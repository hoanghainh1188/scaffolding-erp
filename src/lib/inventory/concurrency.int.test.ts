// Two writers at once (inventory-ledger spec "Ghi đồng thời không làm sai
// giá vốn", design D4). Each case runs several rounds on two connection
// pools so the transactions really overlap.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "@/db/client";
import { inventoryCost } from "@/db/schema";
import { averageAfterInflow } from "@/domain/average-cost";
import type { BusinessDate } from "@/domain/business-date";
import { toMoney } from "@/domain/money";
import type { MovementDraft } from "@/domain/movement";
import { updateItem } from "@/lib/catalog/items";
import { createTestContext } from "@/test/auth";
import {
  resetInventoryTables,
  setupInventoryFixture,
  type InventoryFixture,
} from "@/test/inventory";

import { nextDocumentCode } from "./counter";
import { postMovements } from "./post";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

const ROUNDS = 8;
const TODAY = "2026-10-27" as BusinessDate;

let fx: InventoryFixture;
beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
});

function post(
  db: Database,
  code: string,
  lines: Omit<MovementDraft, "description">[],
) {
  return db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "TEST",
        documentId: null,
        documentCode: code,
        businessDate: "2026-10-08" as BusinessDate,
        lines: lines.map((line) => ({ ...line, description: code })),
      },
      TODAY,
    ),
  );
}

const line = (
  code: string,
  movement: MovementDraft["movement"],
  pieces: number,
  extra: Partial<MovementDraft> = {},
) => ({
  itemId: fx.item(code),
  condition: "GOOD" as const,
  locationId: fx.place("BAI-01"),
  movement,
  quantityMilli: pieces * 1000,
  ...extra,
});

async function pool(code: string) {
  const [row] = await ctx.db
    .select()
    .from(inventoryCost)
    .where(
      and(
        eq(inventoryCost.itemId, fx.item(code)),
        eq(inventoryCost.condition, "GOOD"),
      ),
    );
  return row;
}

async function settle(promises: Promise<unknown>[]) {
  return Promise.allSettled(promises);
}

async function restart() {
  await resetInventoryTables(ctx);
}

describe("two postings at once", () => {
  it("two purchases of the same pair give the average of their finishing order", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await restart();
      await post(ctx.db, "OPEN", [
        line("GG-K17", "OPENING", 920, { amount: 920 * 195_000 }),
      ]);
      const finished: string[] = [];
      const a = post(ctx.db, "A", [
        line("GG-K17", "PURCHASE_IN", 160, { amount: 31_384_800 }),
      ]).then(() => finished.push("A"));
      const b = post(other.db, "B", [
        line("GG-K17", "PURCHASE_IN", 40, { amount: 8_580_000 }),
      ]).then(() => finished.push("B"));
      await Promise.all([a, b]);
      const inflow = {
        A: [160_000, 31_384_800],
        B: [40_000, 8_580_000],
      } as const;
      let state = { poolMilli: 920_000, avgCost: toMoney(195_000) };
      for (const name of finished as ("A" | "B")[]) {
        const [milli, amount] = inflow[name];
        state = {
          poolMilli: state.poolMilli + milli,
          avgCost: averageAfterInflow(state, milli, toMoney(amount)),
        };
      }
      const row = await pool("GG-K17");
      expect(row?.poolQuantity).toBe("1120.000");
      expect(row?.avgCost).toBe(state.avgCost);
      if (finished[0] === "A") expect(row?.avgCost).toBe(195_861);
    }
  });

  it("two sales over the stock: exactly one wins", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await restart();
      await post(ctx.db, "OPEN", [
        line("GG-CH", "OPENING", 100, { amount: 100 * 31_000 }),
      ]);
      const results = await settle([
        post(ctx.db, "A", [line("GG-CH", "SALE_OUT", -60)]),
        post(other.db, "B", [line("GG-CH", "SALE_OUT", -60)]),
      ]);
      const failed = results.filter((r) => r.status === "rejected");
      expect(failed).toHaveLength(1);
      expect((failed[0] as PromiseRejectedResult).reason.result.error).toBe(
        "Không đủ hàng: GG-CH Tốt tại BAI-01 còn 40 cái",
      );
      expect((await pool("GG-CH"))?.poolQuantity).toBe("40.000");
    }
  });

  it("two postings touching two items in opposite order do not deadlock", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await restart();
      await post(ctx.db, "OPEN", [
        line("GG-K17", "OPENING", 100, { amount: 100 * 195_000 }),
        line("GG-CH", "OPENING", 100, { amount: 100 * 31_000 }),
      ]);
      const results = await settle([
        post(ctx.db, "A", [
          line("GG-K17", "SALE_OUT", -1),
          line("GG-CH", "SALE_OUT", -1),
        ]),
        post(other.db, "B", [
          line("GG-CH", "SALE_OUT", -1),
          line("GG-K17", "SALE_OUT", -1),
        ]),
      ]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
      expect((await pool("GG-K17"))?.poolQuantity).toBe("98.000");
      expect((await pool("GG-CH"))?.poolQuantity).toBe("98.000");
    }
  });

  it("archiving an item and posting it take turns", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await setupInventoryFixture(ctx).then((fresh) => {
        fx = fresh;
      });
      const [posted, archived] = await settle([
        post(ctx.db, "A", [
          line("OT-06", "OPENING", 5, { amount: 5 * 450_000 }),
        ]),
        updateItem(other.db, fx.director, fx.item("OT-06"), {
          status: "ARCHIVED",
        }),
      ]);
      const archiveResult =
        archived?.status === "fulfilled"
          ? (archived.value as { ok: boolean; error?: string })
          : null;
      if (posted?.status === "fulfilled") {
        // The posting went first: the archive saw the stock.
        expect(archiveResult).toEqual({
          ok: false,
          status: 409,
          error: "OT-06 còn tồn 5 cái, chỉ ngừng dùng được khi tồn về 0",
        });
      } else {
        // The archive went first: the posting saw an archived item.
        expect(archiveResult?.ok).toBe(true);
        expect((posted as PromiseRejectedResult).reason.result.error).toBe(
          "Vật tư OT-06 đã ngừng dùng",
        );
      }
    }
  });
});

describe("document numbers", () => {
  it("never hands out the same number twice and restarts each year", async () => {
    const codes = await Promise.all([
      ctx.db.transaction((tx) => nextDocumentCode(tx, "ĐC", 2026)),
      other.db.transaction((tx) => nextDocumentCode(tx, "ĐC", 2026)),
      ctx.db.transaction((tx) => nextDocumentCode(tx, "ĐC", 2026)),
    ]);
    expect([...codes].sort()).toEqual([
      "ĐC-2026-001",
      "ĐC-2026-002",
      "ĐC-2026-003",
    ]);
    expect(
      await ctx.db.transaction((tx) => nextDocumentCode(tx, "ĐC", 2027)),
    ).toBe("ĐC-2027-001");
    expect(
      await ctx.db.transaction((tx) => nextDocumentCode(tx, "TĐK", 2026)),
    ).toBe("TĐK-2026-001");
  });
});

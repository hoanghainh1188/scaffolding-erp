import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import { createTestContext } from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import { postMovements } from "./post";
import { getItemSites, getSiteBreakdown, getStockOverview } from "./stock";
import { itemStock, locationStock } from "./totals";

const ctx = createTestContext();
afterAll(ctx.close);

type Opening = [
  code: string,
  Condition,
  place: string,
  quantity: number,
  cost: number,
];

/** The numbers of the stock-views spec scenarios. */
const OPENING: Opening[] = [
  ["GG-K17", "GOOD", "BAI-01", 1240, 195_000],
  ["GG-K17", "NEEDS_REPAIR", "BAI-01", 186, 160_000],
  ["GG-K17", "SCRAP", "BAI-01", 42, 160_000],
  ["GG-K17", "NEEDS_REPAIR", "XUONG-01", 60, 160_000],
  ["GG-K17", "GOOD", "leVanLuong", 1600, 195_000],
  ["GG-K17", "GOOD", "maiDich", 1540, 195_000],
  ["GG-K17", "GOOD", "quangMinh", 720, 195_000],
  ["GG-M16", "GOOD", "BAI-01", 2500, 152_000],
  ["GG-M16", "NEEDS_REPAIR", "BAI-01", 100, 98_000],
  ["GG-M16", "SCRAP", "BAI-01", 11, 98_000],
  ["GG-K15", "SCRAP", "BAI-01", 18, 140_000],
  ["GG-CH", "SCRAP", "BAI-01", 64, 25_000],
  ["PK-KU", "SCRAP", "BAI-01", 6, 40_000],
];

let fx: InventoryFixture;
beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
  await ctx.db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "OPENING",
        documentId: null,
        documentCode: "TĐK-2026-001",
        businessDate: "2026-10-01" as BusinessDate,
        lines: [
          ...OPENING.map(([code, condition, place, pieces, cost]) => ({
            itemId: fx.item(code),
            condition,
            locationId: fx.place(place),
            movement: "OPENING" as const,
            quantityMilli: pieces * 1000,
            amount: pieces * cost,
            description: "Tồn đầu kỳ",
          })),
          {
            itemId: fx.item("PL-SAT"),
            condition: "SCRAP" as const,
            locationId: fx.place("BAI-01"),
            movement: "OPENING" as const,
            quantityMilli: 12_850_500,
            amount: 102_187_176,
            description: "Tồn đầu kỳ",
          },
        ],
      },
      "2026-10-27" as BusinessDate,
    ),
  );
});

const rowOf = async (code: string) => {
  const { rows } = await getStockOverview(ctx.db);
  const row = rows.find((r) => r.code === code);
  if (!row) throw new Error(`no row ${code}`);
  return row;
};

describe("getStockOverview", () => {
  it("splits GG-K17 by yard condition, workshop and sites", async () => {
    const row = await rowOf("GG-K17");
    expect(row.yard).toEqual({
      NEW: 0,
      GOOD: 1_240_000,
      NEEDS_REPAIR: 186_000,
      SCRAP: 42_000,
    });
    expect([row.workshop, row.sites, row.total]).toEqual([
      60_000, 3_860_000, 5_388_000,
    ]);
  });

  it("values each condition at its own average", async () => {
    expect((await rowOf("GG-M16")).value).toBe(
      2500 * 152_000 + 100 * 98_000 + 11 * 98_000,
    );
  });

  it("shows items without ledger lines as zero", async () => {
    const row = await rowOf("OT-06");
    expect([row.total, row.value, row.workshop, row.sites]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("counts scrap in kg, converting pieces", async () => {
    const { cards } = await getStockOverview(ctx.db);
    expect(cards).toMatchObject({
      scrapKgMilli: 13_958_900,
      convertedKgMilli: 1_108_400,
      converted: { PIECE: 141_000 },
      needsRepair: { PIECE: (186 + 60 + 100) * 1000 },
    });
  });

  it("adds up to the ledger", async () => {
    const { rows, cards } = await getStockOverview(ctx.db);
    const [sum] = await ctx.db.execute<{ quantity: string; value: string }>(sql`
      select sum(l.quantity)::text as quantity,
             sum(round(l.quantity * c.avg_cost))::text as value
      from inventory_ledger l
      join inventory_cost c on c.item_id = l.item_id and c.condition = l.condition
    `);
    const totalMilli = rows.reduce((s, r) => s + r.total, 0);
    expect(totalMilli / 1000).toBe(Number(sum?.quantity));
    expect(cards.totalValue).toBe(Number(sum?.value));
  });

  it("searches without accents and filters by group", async () => {
    const { rows } = await getStockOverview(ctx.db, { q: "khung gian giao" });
    expect(rows.map((r) => r.code).sort()).toEqual(["GG-K15", "GG-K17"]);
    const groupId = (await rowOf("PL-SAT")).groupId;
    const scrap = await getStockOverview(ctx.db, { groupId });
    expect(scrap.rows.map((r) => r.code)).toEqual(["PL-SAT"]);
    // The cards always cover everything.
    expect(scrap.cards.scrapKgMilli).toBe(13_958_900);
  });
});

describe("getItemSites", () => {
  it("lists the sites holding an item", async () => {
    const sites = await getItemSites(ctx.db, fx.item("GG-K17"));
    expect(sites.map((s) => [s.siteName, s.quantity]).sort()).toEqual(
      [
        ["Cầu vượt Mai Dịch", 1_540_000],
        ["Nhà phố Lê Văn Lương", 1_600_000],
        ["Nhà xưởng KCN Quang Minh", 720_000],
      ].sort(),
    );
    expect(await getItemSites(ctx.db, fx.item("OT-06"))).toEqual([]);
  });

  it("gives the same lists for every item at once", async () => {
    const all = await getSiteBreakdown(ctx.db);
    expect(all.get(fx.item("GG-K17"))).toEqual(
      await getItemSites(ctx.db, fx.item("GG-K17")),
    );
    expect(all.has(fx.item("OT-06"))).toBe(false);
  });
});

describe("stock after a REVALUE line (no location)", () => {
  beforeEach(async () => {
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "REVALUE",
          documentId: null,
          documentCode: "ĐCG-2026-001",
          businessDate: "2026-10-27" as BusinessDate,
          lines: [
            {
              itemId: fx.item("GG-K17"),
              condition: "GOOD",
              locationId: null,
              movement: "REVALUE",
              quantityMilli: 0,
              amount: 5_100_000,
              description: "Tăng giá trị 5.100.000 ₫ · sửa TĐK-2026-001",
            },
          ],
        },
        "2026-10-27" as BusinessDate,
      ),
    );
  });

  it("keeps every quantity and values at the new average", async () => {
    const row = await rowOf("GG-K17");
    expect(row.yard.GOOD).toBe(1_240_000);
    expect([row.workshop, row.sites, row.total]).toEqual([
      60_000, 3_860_000, 5_388_000,
    ]);
    // 5.100 Tốt × 195.000 + 5.100.000 → 196.000 ₫
    expect(row.value).toBe(
      5100 * 196_000 + 186 * 160_000 + 42 * 160_000 + 60 * 160_000,
    );
  });

  it("still adds up to the ledger and lists the same sites", async () => {
    const { rows } = await getStockOverview(ctx.db);
    const [sum] = await ctx.db.execute<{ quantity: string }>(sql`
      select sum(quantity)::text as quantity from inventory_ledger
    `);
    expect(rows.reduce((s, r) => s + r.total, 0) / 1000).toBe(
      Number(sum?.quantity),
    );
    const sites = await getItemSites(ctx.db, fx.item("GG-K17"));
    expect(sites.map((s) => s.quantity).sort()).toEqual(
      [720_000, 1_540_000, 1_600_000].sort(),
    );
  });

  it("does not change the totals that block archiving", async () => {
    expect(await itemStock(ctx.db, fx.item("GG-K17"))).toEqual({
      PIECE: 5_388_000,
    });
    expect((await locationStock(ctx.db, fx.place("BAI-01"))).PIECE).toBe(
      (1240 + 186 + 42 + 2500 + 100 + 11 + 18 + 64 + 6) * 1000,
    );
  });
});

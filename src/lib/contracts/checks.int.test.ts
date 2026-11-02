// "Kiểm tra trước khi gửi duyệt" (contracts spec; tasks 4.4).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { location } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import { postMovements } from "@/lib/inventory/post";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import {
  d5Rental,
  setupContractFixture,
  type ContractFixture,
} from "@/test/contracts";

import { submitContract } from "./approval";
import { contractChecks } from "./checks";
import { readContent } from "./content";
import { readRevisions } from "./records";
import { createContract } from "./service";

const ctx = createTestContext();
afterAll(ctx.close);

const TODAY = "2026-10-30" as BusinessDate;

let fx: ContractFixture;
beforeEach(async () => {
  fx = await setupContractFixture(ctx);
});

async function opening(
  code: string,
  condition: Condition,
  place: string,
  pieces: number,
) {
  const [row] = await ctx.db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, place));
  await ctx.db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "TEST",
        documentId: null,
        documentCode: "TEST-1",
        businessDate: "2026-10-01" as BusinessDate,
        lines: [
          {
            itemId: fx.item(code),
            condition,
            locationId: row?.id ?? "",
            movement: "OPENING",
            quantityMilli: pieces * 1000,
            amount: pieces * 195_000,
            description: "test",
          },
        ],
      },
      TODAY,
    ),
  );
}

async function checksOf(body = d5Rental(fx)) {
  const saved = await createContract(ctx.db, fx.sales, body);
  if (!saved.ok) throw new Error(saved.error);
  const [revision] = await readRevisions(ctx.db, saved.data.id);
  return {
    saved: saved.data,
    checks: await contractChecks(ctx.db, {
      type: "RENTAL",
      endDate: revision?.endDate ?? null,
      content: await readContent(ctx.db, revision?.id ?? ""),
      overdue: { amount: 0, days: 0 },
      today: TODAY,
    }),
  };
}

describe("contractChecks", () => {
  it("counts New + Good at the yard only, and names what is short", async () => {
    await opening("GG-K17", "GOOD", "BAI-01", 250);
    await opening("GG-K17", "NEW", "BAI-01", 20);
    await opening("GG-K17", "GOOD", "XUONG-01", 500);
    await opening("GG-K17", "NEEDS_REPAIR", "BAI-01", 500);
    const { checks } = await checksOf();
    const stock = checks.lines[0];
    expect(stock?.ok).toBe(false);
    expect(stock?.message).toContain(
      "Kho thiếu 30 GG-K17 cho đợt 1 (cần 300, bãi có 270 Mới + Tốt)",
    );
  });

  it("says the yard has enough when it does", async () => {
    for (const [code, pieces] of [
      ["GG-K17", 300],
      ["GG-CH", 300],
      ["GG-M16", 150],
    ] as const) {
      await opening(code, "GOOD", "BAI-01", pieces);
    }
    const { checks } = await checksOf();
    expect(checks.lines[0]).toEqual({
      ok: true,
      message: "Kho đủ hàng Mới + Tốt ở bãi cho đợt 1",
    });
  });

  it("counts prices that differ from the catalog", async () => {
    const { checks } = await checksOf({
      ...d5Rental(fx),
      lines: [{ itemId: fx.item("PK-KU"), quantity: "400", price: 350 }],
      compensations: [{ itemId: fx.item("GG-K17"), lostPrice: 500_000 }],
    });
    expect(checks.offCatalog).toEqual({ rent: 1, compensation: 1 });
    expect(checks.lines.map((line) => line.message)).toContain(
      "1 giá thuê và 1 giá đền bù khác danh mục",
    );
  });

  it("warns about a guarantee ending before the rental, without blocking", async () => {
    const body = d5Rental(fx);
    const { checks, saved } = await checksOf({
      ...body,
      endDate: "2027-04-30",
    });
    expect(checks.lines.map((line) => line.message)).toContain(
      "Bảo lãnh BL-2026-1188 hết hạn 31/03/2027, trước ngày kết thúc dự kiến 30/04/2027",
    );
    expect((await submitContract(ctx.db, fx.sales, saved.id)).ok).toBe(true);
  });

  it("writes nothing", async () => {
    const before = (await activityRows(ctx.db)).length;
    await checksOf();
    expect((await activityRows(ctx.db)).length).toBe(before + 1);
  });
});

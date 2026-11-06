// Top 5 of the year (dashboard-basic task 3.8, 0.2 #93, #95): revenue of
// the year equals the customer's months added up; kg is what was delivered
// this year, weighed kg first, and a return does not take it back.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { item } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { monthTotals } from "@/domain/dashboard";
import { toMoney } from "@/domain/money";
import { createTestContext } from "@/test/auth";
import {
  deliveredSale,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";
import { returnOf } from "@/test/returns";

import { monthsBetween, revenueBook } from "./revenue";
import { topByKg, topByRevenue } from "./top";

const ctx = createTestContext();
afterAll(ctx.close);

const d = (value: string) => value as BusinessDate;
const JAN_1 = d("2026-01-01");
const TODAY = d("2026-11-20");
let fx: ReceivableFixture;

beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
});

async function weightOf(code: string): Promise<number> {
  const [row] = await ctx.db
    .select({ weight: item.standardWeightKg })
    .from(item)
    .where(eq(item.code, code));
  return Number(row?.weight ?? 0);
}

describe("topByRevenue", () => {
  it("equals the months of the customer added up", async () => {
    await deliveredSale(ctx, fx, {}, new Date("2026-11-05T03:00:00Z"));
    const months = monthsBetween("2026-01", "2026-11");
    const book = await revenueBook(ctx.db, months, TODAY);
    const top = await topByRevenue(ctx.db, book, JAN_1);
    expect(top.length).toBe(2);
    for (const row of top) {
      const own = book.entries
        .filter((entry) => entry.customerId === row.customerId)
        .map((entry) => ({
          date: entry.date,
          rent: toMoney(entry.rent),
          sale: toMoney(entry.sale),
        }));
      const total = monthTotals(own, months, new Set()).reduce(
        (sum, month) => sum + month.total,
        0,
      );
      expect(row.value).toBe(total);
    }
    const minhPhat = top.find((row) => row.customerId === fx.customerId);
    expect(minhPhat?.value).toBeGreaterThan(0);
  });
});

describe("topByKg", () => {
  it("adds what was delivered this year and ignores returns", async () => {
    const before = await topByKg(ctx.db, JAN_1, TODAY);
    const expected =
      120 * (await weightOf("GG-K17")) +
      260 * (await weightOf("GG-CH")) +
      60 * (await weightOf("GG-M16"));
    expect(before).toEqual([
      expect.objectContaining({
        customerId: fx.customerId,
        value: Math.round(expected * 1000),
      }),
    ]);
    const back = await returnOf(ctx, fx, { "GG-CH": [200, 0, 0, 0] });
    expect(back.ok).toBe(true);
    expect(await topByKg(ctx.db, JAN_1, TODAY)).toEqual(before);
  });

  it("takes the weighed kg of a sale", async () => {
    const sale = await deliveredSale(
      ctx,
      fx,
      {},
      new Date("2026-11-05T03:00:00Z"),
    );
    const top = await topByKg(ctx.db, JAN_1, TODAY);
    expect(top.some((row) => row.value === 1_250_500)).toBe(true);
    expect(sale.contractId).toBeTruthy();
  });

  it("leaves out deliveries of another year", async () => {
    expect(await topByKg(ctx.db, d("2027-01-01"), d("2027-12-31"))).toEqual(
      [],
    );
  });
});

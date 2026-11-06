// Full customer ranking (management-reports tasks 3.5; spec
// management-reports "Xếp hạng nhà thầu của năm"; 0.2 #93, #95, #115).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { monthsBetween, revenueBook } from "@/lib/dashboard/revenue";
import { revenueByCustomer, topRows } from "@/lib/dashboard/top";
import { createTestContext } from "@/test/auth";
import {
  deliveredSale,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";
import { returnOf } from "@/test/returns";

import { customerRanking } from "./ranking";

const ctx = createTestContext();
afterAll(ctx.close);

const d = (value: string) => value as BusinessDate;
const JAN_1 = d("2026-01-01");
const TODAY = d("2026-11-20");
let fx: ReceivableFixture;

beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
  await deliveredSale(ctx, fx, {}, new Date("2026-11-05T03:00:00Z"));
});

const bookOfYear = () =>
  revenueBook(ctx.db, monthsBetween("2026-01", "2026-11"), TODAY);

describe("customerRanking", () => {
  it("starts with the D1 top 5, both ways", async () => {
    const book = await bookOfYear();
    const ranking = await customerRanking(ctx.db, book, JAN_1, TODAY);
    const top = await topRows(ctx.db, book, JAN_1, TODAY);
    expect(
      ranking.byRevenue.slice(0, 5).map((row) => [row.customerId, row.revenue]),
    ).toEqual(top.byRevenue.map((row) => [row.customerId, row.revenue]));
    expect(
      ranking.byKg.slice(0, 5).map((row) => [row.customerId, row.kgMilli]),
    ).toEqual(top.byKg.map((row) => [row.customerId, row.kgMilli]));
  });

  it("lists every customer with revenue, rent and sale apart", async () => {
    const book = await bookOfYear();
    const ranking = await customerRanking(ctx.db, book, JAN_1, TODAY);
    const withRevenue = [...revenueByCustomer(book, JAN_1).values()].filter(
      (value) => value > 0,
    );
    expect(ranking.byRevenue).toHaveLength(withRevenue.length);
    expect(ranking.byRevenue.map((row) => row.rank)).toEqual(
      ranking.byRevenue.map((_, index) => index + 1),
    );
    for (const row of ranking.byRevenue) {
      expect(row.rent + row.sale).toBe(row.revenue);
      expect(row.contracts).toBeGreaterThan(0);
      expect(row.name).not.toBe("");
    }
    const sorted = [...ranking.byRevenue].sort((a, b) => b.revenue - a.revenue);
    expect(ranking.byRevenue.map((row) => row.revenue)).toEqual(
      sorted.map((row) => row.revenue),
    );
  });

  it("does not take returned goods off the kg", async () => {
    const book = await bookOfYear();
    const before = await customerRanking(ctx.db, book, JAN_1, TODAY);
    const back = await returnOf(ctx, fx, { "GG-CH": [200, 0, 0, 0] });
    expect(back.ok).toBe(true);
    const after = await customerRanking(ctx.db, book, JAN_1, TODAY);
    expect(after.byKg.map((row) => row.kgMilli)).toEqual(
      before.byKg.map((row) => row.kgMilli),
    );
  });

  it("is empty for a year without documents", async () => {
    const book = await revenueBook(
      ctx.db,
      monthsBetween("2025-01", "2025-12"),
      TODAY,
    );
    const empty = { ...book, entries: [], separate: [] };
    expect(
      await customerRanking(ctx.db, empty, d("2025-01-01"), d("2025-12-31")),
    ).toEqual({ byRevenue: [], byKg: [] });
  });
});

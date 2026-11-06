// D1 numbers that must equal their source screens (dashboard-basic tasks
// 3.4–3.6): overdue = D14, pieces on site = D10 "Tại công trình" on items
// counted in cái = the contracts' D6 numbers, stock by condition = D10.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { item } from "@/db/schema";

import type { BusinessDate } from "@/domain/business-date";
import { CONDITIONS } from "@/domain/condition";
import { onSiteByItem } from "@/lib/deliveries/records";
import { getStockOverview } from "@/lib/inventory/stock";
import { customerBalances } from "@/lib/receivables/balances";
import { createTestContext } from "@/test/auth";
import { stockUp } from "@/test/deliveries";
import {
  closedPeriod,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";

import { overdueSummary } from "./overdue";
import { onSiteSummary, stockByCondition } from "./stock";

const ctx = createTestContext();
afterAll(ctx.close);

const d = (value: string) => value as BusinessDate;
let fx: ReceivableFixture;

beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
});

describe("overdueSummary", () => {
  it("equals the overdue card of D14", async () => {
    await closedPeriod(ctx, fx, "2026-09", 1_000_000, { terms: 0 });
    const today = d("2026-11-06");
    const { totals } = await customerBalances(ctx.db, today, {
      filter: "overdue",
    });
    expect(await overdueSummary(ctx.db, today)).toEqual({
      amount: totals.overdue,
      customers: totals.overdueCount,
      longestDays: totals.longestOverdueDays,
    });
    expect(await overdueSummary(ctx.db, today)).toEqual({
      amount: 1_000_000,
      customers: 1,
      longestDays: 37,
    });
  });

  it("is not overdue on the due day itself", async () => {
    await closedPeriod(ctx, fx, "2026-10", 500_000, { terms: 6 });
    expect((await overdueSummary(ctx.db, d("2026-11-06"))).amount).toBe(0);
    expect(await overdueSummary(ctx.db, d("2026-11-07"))).toMatchObject({
      amount: 500_000,
      longestDays: 1,
    });
  });
});

describe("onSiteSummary", () => {
  it("counts cái like D10 and D6", async () => {
    const summary = await onSiteSummary(ctx.db);
    const { rows } = await getStockOverview(ctx.db);
    const pieceRows = rows.filter((row) => row.unit === "PIECE");
    expect(summary.total.piecesMilli).toBe(
      pieceRows.reduce((sum, row) => sum + row.sites, 0),
    );
    const own = await onSiteByItem(ctx.db, fx.deal.id);
    expect(summary.total.piecesMilli).toBe(
      [...own.values()].reduce((sum, milli) => sum + milli, 0),
    );
    expect(summary.total.piecesMilli).toBe(440_000);
    expect(summary.total.siteCount).toBe(1);
  });

  it("weighs metres into tons but never counts them as cái", async () => {
    const before = await onSiteSummary(ctx.db);
    await stockUp(ctx, fx, fx.siteLocation, [["ONG-49", "GOOD", 120, 50_000]]);
    const after = await onSiteSummary(ctx.db);
    const [pipe] = await ctx.db
      .select({ weight: item.standardWeightKg })
      .from(item)
      .where(eq(item.code, "ONG-49"));
    expect(after.total.piecesMilli).toBe(before.total.piecesMilli);
    expect(after.total.kgMilli - before.total.kgMilli).toBe(
      Math.round(120 * Number(pipe?.weight ?? 0) * 1000),
    );
    const { rows } = await getStockOverview(ctx.db);
    expect(rows.find((row) => row.code === "ONG-49")?.sites).toBe(120_000);
  });

  it("puts the site in its region", async () => {
    const summary = await onSiteSummary(ctx.db);
    const held = summary.regions.filter((row) => row.siteCount > 0);
    expect(held).toHaveLength(1);
    expect(held[0]?.piecesMilli).toBe(summary.total.piecesMilli);
  });
});

describe("stockByCondition", () => {
  it("adds yards and workshops by condition and matches D10 per item", async () => {
    const workshop = await fx.place("XUONG-01");
    await stockUp(ctx, fx, workshop, [
      ["H1,7", "NEEDS_REPAIR", 36, 100_000],
      ["H1,7", "GOOD", 40, 150_000],
    ]);
    const rows = await stockByCondition(ctx.db, 50);
    const { rows: d10 } = await getStockOverview(ctx.db);
    for (const row of rows) {
      const source = d10.find((entry) => entry.itemId === row.itemId);
      if (!source) continue;
      const own = CONDITIONS.reduce((sum, c) => sum + row.stock[c], 0);
      const yard = CONDITIONS.reduce((sum, c) => sum + source.yard[c], 0);
      expect(own).toBe(yard + source.workshop);
      expect(row.onSite).toBe(source.sites);
    }
    const frame = rows.find((row) => row.code === "H1,7");
    const frameD10 = d10.find((row) => row.code === "H1,7");
    expect(frameD10?.workshop).toBe(76_000);
    expect(frame?.stock.NEEDS_REPAIR).toBe(
      (frameD10?.yard.NEEDS_REPAIR ?? 0) + 36_000,
    );
    expect(frame?.stock.GOOD).toBe((frameD10?.yard.GOOD ?? 0) + 40_000);
  });

  it("keeps at most the limit, heaviest first", async () => {
    const rows = await stockByCondition(ctx.db, 2);
    expect(rows).toHaveLength(2);
  });
});

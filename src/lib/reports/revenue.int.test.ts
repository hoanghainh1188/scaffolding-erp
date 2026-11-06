// Revenue of D15 (management-reports tasks 3.2; spec gross-profit "Doanh
// thu của kỳ", "Doanh thu tháng khớp Tổng quan", "Ngày ghi nhận").
import { afterAll, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { approveBuyBack, createBuyBack } from "@/lib/buy-backs/service";
import { lastMonths, revenueBook } from "@/lib/dashboard/revenue";
import { revenueSummary } from "@/lib/dashboard/summary";
import { createTestContext } from "@/test/auth";
import {
  approvedCompensation,
  deliveredSale,
  setupReceivableFixture,
} from "@/test/receivables";
import { returnOf } from "@/test/returns";
import { setupSiteFixture, SITE_NOW } from "@/test/site-operations";

import { reportRevenue, revenueBetween } from "./revenue";

const ctx = createTestContext();
afterAll(ctx.close);

const d = (value: string) => value as BusinessDate;

describe("revenue of the report", () => {
  it("matches D1 month by month (rent, sale)", async () => {
    const fx = await setupReceivableFixture(ctx);
    await deliveredSale(ctx, fx, {}, new Date("2026-11-05T03:00:00Z"));
    const today = d("2026-12-03");
    const report = await reportRevenue(
      ctx.db,
      { from: d("2026-11-01"), to: today },
      today,
    );
    const d1 = revenueSummary(
      await revenueBook(ctx.db, lastMonths(today, 6), today),
      today,
    );
    for (const month of ["2026-11", "2026-12"]) {
      const shown = d1.months.find((row) => row.month === month);
      const parts = report.byMonth.get(month);
      expect(parts?.rent).toBe(shown?.rent);
      expect(parts?.sale).toBe(shown?.sale);
    }
    expect(report.byMonth.get("2026-11")?.rent).toBeGreaterThan(0);
    expect(report.byMonth.get("2026-11")?.sale).toBeGreaterThan(0);
    expect(report.book.openMonths.has("2026-11")).toBe(true);
  });

  it("takes compensation in the month it is approved", async () => {
    const fx = await setupReceivableFixture(ctx);
    // The return with lost goods is posted 05/11, approved 03/12.
    const note = await approvedCompensation(
      ctx,
      fx,
      new Date("2026-12-03T03:00:00Z"),
    );
    const today = d("2026-12-03");
    const report = await reportRevenue(
      ctx.db,
      { from: d("2026-11-01"), to: today },
      today,
    );
    expect(report.byMonth.get("2026-11")?.compensation).toBe(0);
    expect(report.byMonth.get("2026-12")?.compensation).toBe(note.amountDue);
    expect(note.amountDue).toBeGreaterThan(0);
  });

  it("leaves out a compensation note still pending", async () => {
    const fx = await setupReceivableFixture(ctx);
    const posted = await returnOf(ctx, fx, { "GG-K17": [0, 0, 0, 2] });
    expect(posted.ok).toBe(true);
    const today = d("2026-11-06");
    const report = await reportRevenue(
      ctx.db,
      { from: d("2026-11-01"), to: today },
      today,
    );
    expect(report.byMonth.get("2026-11")?.compensation).toBe(0);
  });

  it("takes a buy-back in the month it is approved", async () => {
    const fx = await setupSiteFixture(ctx);
    const saved = await createBuyBack(
      ctx.db,
      fx.sales,
      {
        contractId: fx.from.id,
        reason: "Đã đổ bê tông",
        lines: [{ itemId: fx.item("GG-CH"), quantity: "20" }],
      },
      { now: SITE_NOW },
    );
    if (!saved.ok) throw new Error(saved.error);
    const approved = await approveBuyBack(
      ctx.db,
      fx.director,
      saved.data.id,
      {},
      { now: new Date("2026-11-06T03:00:00Z") },
    );
    if (!approved.ok) throw new Error(approved.error);
    const today = d("2026-11-06");
    const report = await reportRevenue(
      ctx.db,
      { from: d("2026-11-01"), to: today },
      today,
    );
    const parts = report.byMonth.get("2026-11");
    expect(parts?.buyBack).toBe(approved.data.amountDue);
    expect(parts?.compensation).toBe(0);
    expect(
      revenueBetween(report.book, d("2026-11-06"), d("2026-11-06")),
    ).toBeGreaterThanOrEqual(approved.data.amountDue ?? 0);
  });

  it("keeps a past year apart from later documents", async () => {
    const fx = await setupReceivableFixture(ctx);
    await deliveredSale(ctx, fx, {}, new Date("2026-11-05T03:00:00Z"));
    const report = await reportRevenue(
      ctx.db,
      { from: d("2025-01-01"), to: d("2025-12-31") },
      d("2026-11-06"),
    );
    expect(report.byMonth.size).toBe(12);
    for (const parts of report.byMonth.values()) {
      expect(parts).toEqual({ rent: 0, sale: 0, compensation: 0, buyBack: 0 });
    }
    expect(report.book.entries).toEqual([]);
  });
});

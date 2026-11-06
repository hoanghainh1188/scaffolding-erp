// D15 in one object (management-reports tasks 3.6; spec management-reports
// "Báo cáo chỉ đọc"; spec gross-profit "Ngày ghi nhận và cộng dồn").
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { lossPer100 } from "@/domain/fleet-metrics";
import { marginText, sumMonths } from "@/domain/gross-profit";
import { parsePeriod } from "@/domain/report-period";
import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import {
  approvedCompensation,
  deliveredSale,
  setupReceivableFixture,
} from "@/test/receivables";

import { buildReport } from "./report";

const ctx = createTestContext();
afterAll(ctx.close);

const d = (value: string) => value as BusinessDate;
const TODAY = d("2026-11-20");

const TABLES = [
  "inventory_ledger",
  "activity_log",
  "delivery_note",
  "return_note",
  "compensation_note",
  "receipt",
  "billing_period",
];

async function counts() {
  const rows = await Promise.all(
    TABLES.map((table) =>
      getAdminDatabase().execute<{ n: number }>(
        sql.raw(`select count(*)::int as n from "${table}"`),
      ),
    ),
  );
  return rows.map((row) => row[0]?.n);
}

beforeEach(async () => {
  const fx = await setupReceivableFixture(ctx);
  await deliveredSale(ctx, fx, {}, new Date("2026-11-05T03:00:00Z"));
  await approvedCompensation(ctx, fx, new Date("2026-11-06T03:00:00Z"));
});

describe("buildReport", () => {
  it("writes nothing", async () => {
    const before = await counts();
    await buildReport(ctx.db, parsePeriod("year", "2026", TODAY), TODAY);
    await buildReport(ctx.db, parsePeriod("month", "2026-11", TODAY), TODAY);
    expect(await counts()).toEqual(before);
  });

  it("adds the period, the previous one and the year from the same months", async () => {
    const report = await buildReport(
      ctx.db,
      parsePeriod("month", "2026-11", TODAY),
      TODAY,
    );
    expect(report.label).toBe("Tháng 11/2026");
    expect(report.previousLabel).toBe("Tháng 10/2026");
    expect(report.dataUntil).toBe("số liệu đến hết 20/11/2026");
    expect(report.months.map((row) => row.month)).toEqual(
      Array.from(
        { length: 11 },
        (_, index) => `2026-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(report.current).toEqual(sumMonths(report.months, ["2026-11"]));
    expect(report.yearToDate).toEqual(
      sumMonths(
        report.months,
        report.months.map((row) => row.month),
      ),
    );
    expect(report.current.revenue.sale).toBeGreaterThan(0);
    expect(report.current.revenue.compensation).toBeGreaterThan(0);
    expect(report.current.costs.sale).toBeGreaterThan(0);
    expect(report.current.costs.loss).toBeGreaterThan(0);
    expect(report.current.provisional).toBe(true);
    expect(report.change.comparable.label).toBe("01/10 – 20/10");
    expect(report.ranking.byRevenue.length).toBeGreaterThan(0);
    expect(report.fleet.totalKgDays).toBeGreaterThan(0);
    expect(lossPer100(report.losses.total)).toBeGreaterThan(0);
    expect(report.lossesYear.lossKgMilli).toBe(report.losses.total.lossKgMilli);
  });

  it("is all zero for January 2020", async () => {
    const report = await buildReport(
      ctx.db,
      parsePeriod("month", "2020-01", TODAY),
      TODAY,
    );
    expect(report.dataUntil).toBe("số liệu đến hết 31/01/2020");
    expect(report.current.revenueTotal).toBe(0);
    expect(report.current.costTotal).toBe(0);
    expect(marginText(report.current.profit, report.current.revenueTotal)).toBe(
      "—",
    );
    expect(report.change.text).toBeNull();
    expect(report.months.map((row) => row.month)).toEqual(["2020-01"]);
    expect(report.losses.rows).toEqual([]);
    expect(lossPer100(report.losses.total)).toBeNull();
    expect(report.uses).toEqual([]);
    expect(report.fleet.totalKgDays).toBe(0);
    expect(report.ranking).toEqual({ byRevenue: [], byKg: [] });
  });
});

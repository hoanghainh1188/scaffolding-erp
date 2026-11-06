// The D15 workbook (management-reports tasks 4.1; spec management-reports
// "Xuất Excel báo cáo").
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { parsePeriod } from "@/domain/report-period";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import {
  approvedCompensation,
  deliveredSale,
  setupReceivableFixture,
} from "@/test/receivables";
import { rowCount, unzipXlsx } from "@/test/xlsx";

import { exportReport } from "./export";
import { buildReport } from "./report";

const ctx = createTestContext();
afterAll(ctx.close);

const TODAY = "2026-11-20" as BusinessDate;
const NOVEMBER = parsePeriod("month", "2026-11", TODAY);

beforeEach(async () => {
  const fx = await setupReceivableFixture(ctx);
  await deliveredSale(ctx, fx, {}, new Date("2026-11-05T03:00:00Z"));
  await approvedCompensation(ctx, fx, new Date("2026-11-06T03:00:00Z"));
});

describe("exportReport", () => {
  it("writes five sheets with the page's numbers", async () => {
    const before = (await activityRows(ctx.db)).length;
    const report = await buildReport(ctx.db, NOVEMBER, TODAY);
    const result = await exportReport(ctx.db, NOVEMBER, TODAY);
    expect(result.filename).toBe("bao-cao-2026-11.xlsx");
    const files = unzipXlsx(result.file);
    const workbook = files.get("xl/workbook.xml") ?? "";
    for (const name of [
      "Lợi nhuận gộp",
      "Theo tháng",
      "Hao hụt",
      "Khai thác",
      "Xếp hạng nhà thầu",
    ]) {
      expect(workbook).toContain(`<sheet name="${name}"`);
    }
    const profit = files.get("xl/worksheets/sheet1.xml") ?? "";
    expect(profit).toContain("Tháng 11/2026");
    expect(profit).toContain("Sửa chữa (lỗ hỏng hàng)");
    expect(profit).toContain(`<v>${report.current.profit}</v>`);
    expect(profit).toContain(`<v>${report.current.revenueTotal}</v>`);
    expect(Number.isInteger(report.current.profit)).toBe(true);
    const months = files.get("xl/worksheets/sheet2.xml") ?? "";
    expect(rowCount(months)).toBe(1 + 11);
    expect(months).not.toMatch(/<v>-?\d+\.\d+<\/v>/);
    const losses = files.get("xl/worksheets/sheet3.xml") ?? "";
    expect(rowCount(losses)).toBe(1 + report.losses.rows.length + 1);
    const uses = files.get("xl/worksheets/sheet4.xml") ?? "";
    expect(rowCount(uses)).toBe(1 + report.uses.length + 1);
    const ranking = files.get("xl/worksheets/sheet5.xml") ?? "";
    expect(rowCount(ranking)).toBeGreaterThanOrEqual(
      1 + report.ranking.byRevenue.length,
    );
    expect(await activityRows(ctx.db)).toHaveLength(before);
  });
});

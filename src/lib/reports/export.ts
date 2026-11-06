// "Xuất Excel" of D15 (management-reports design D10; spec
// management-reports "Xuất Excel báo cáo"): the numbers of the page in five
// sheets, every item and every customer, nothing folded. Money is a whole
// number cell, tonnes and percents are number cells.
import type { Database } from "@/db/client";
import type { BusinessDate } from "@/domain/business-date";
import {
  averageKgMilli,
  averagePieces,
  lossPer100,
  utilizationTenths,
  type LossRow,
} from "@/domain/fleet-metrics";
import {
  COST_CATEGORIES,
  COST_LABELS,
  percentTenths,
  REVENUE_LABELS,
  REVENUE_PARTS,
  type ProfitTotals,
} from "@/domain/gross-profit";
import type { ReportPeriod } from "@/domain/report-period";
import { buildXlsxBook, type XlsxValue } from "@/lib/export/xlsx";

import { buildReport, type Report } from "./report";

type Reader = Pick<Database, "select">;

const tonnes = (kgMilli: number) => Math.round(kgMilli) / 1_000_000;
const percent = (tenths: number | null) =>
  tenths === null ? null : tenths / 10;

function profitRows(report: Report): XlsxValue[][] {
  const columns = [report.current, report.previous, report.yearToDate];
  const row = (label: string, value: (totals: ProfitTotals) => number) => [
    label,
    ...columns.map(value),
  ];
  return [
    row("Doanh thu (chưa VAT)", (t) => t.revenueTotal),
    ...REVENUE_PARTS.map((part) =>
      row(REVENUE_LABELS[part], (t) => t.revenue[part]),
    ),
    row("Giá vốn và hao hụt", (t) => t.costTotal),
    ...COST_CATEGORIES.map((category) =>
      row(COST_LABELS[category], (t) => t.costs[category]),
    ),
    row("Lợi nhuận gộp", (t) => t.profit),
    [
      "Tỷ suất lợi nhuận gộp (%)",
      ...columns.map((t) => percent(percentTenths(t.profit, t.revenueTotal))),
    ],
    row("Chi phí sửa đã chi trong kỳ", (t) => t.repairSpent),
    ["Tiền thuê tạm tính", ...columns.map((t) => (t.provisional ? "Có" : ""))],
  ];
}

const lossRow = (row: LossRow, code: string, name: string): XlsxValue[] => [
  code,
  name,
  tonnes(averageKgMilli(row)),
  tonnes(row.lossKgMilli),
  tonnes(row.scrapKgMilli),
  tonnes(row.repairKgMilli),
  (() => {
    const value = lossPer100(row);
    return value === null ? null : value / 100;
  })(),
];

export function reportWorkbook(report: Report): Uint8Array {
  const money = (header: string) => ({ header, width: 18 });
  const ranked = [
    ...report.ranking.byRevenue,
    ...report.ranking.byKg.filter(
      (row) =>
        !report.ranking.byRevenue.some(
          (other) => other.customerId === row.customerId,
        ),
    ),
  ];
  const kgRank = new Map(
    report.ranking.byKg.map((row) => [row.customerId, row.rank]),
  );
  return buildXlsxBook([
    {
      sheetName: "Lợi nhuận gộp",
      columns: [
        { header: "Khoản mục", width: 44 },
        money(report.label),
        money(report.previousLabel),
        money(`Năm ${report.year} (lũy kế)`),
      ],
      rows: profitRows(report),
    },
    {
      sheetName: "Theo tháng",
      columns: [
        { header: "Tháng", width: 10 },
        money("Tiền thuê"),
        money("Bán hàng"),
        money("Đền bù"),
        money("Mua lại"),
        money("Doanh thu"),
        ...COST_CATEGORIES.map((category) => money(COST_LABELS[category])),
        money("Giá vốn và hao hụt"),
        money("Lợi nhuận gộp"),
        money("Chi phí sửa đã chi"),
        { header: "Tạm tính", width: 10 },
      ],
      rows: report.months.map((month) => {
        const revenue = REVENUE_PARTS.reduce(
          (sum, part) => sum + month.revenue[part],
          0,
        );
        const costs = COST_CATEGORIES.reduce(
          (sum, category) => sum + month.costs[category],
          0,
        );
        return [
          `${month.month.slice(5)}/${month.month.slice(0, 4)}`,
          ...REVENUE_PARTS.map((part) => month.revenue[part]),
          revenue,
          ...COST_CATEGORIES.map((category) => month.costs[category]),
          costs,
          revenue - costs,
          month.repairSpent,
          month.provisional ? "Có" : "",
        ];
      }),
    },
    {
      sheetName: "Hao hụt",
      columns: [
        { header: "Mã hàng", width: 14 },
        { header: "Tên", width: 30 },
        { header: "Bình quân (tấn)", width: 16 },
        { header: "Mất (tấn)", width: 12 },
        { header: "Phế (tấn)", width: 12 },
        { header: "Phải sửa (tấn)", width: 14 },
        { header: "Trên 100 tấn", width: 14 },
      ],
      rows: [
        ...report.losses.rows.map((row) => lossRow(row, row.code, row.name)),
        lossRow(report.losses.total, "", "Cộng"),
      ],
    },
    {
      sheetName: "Khai thác",
      columns: [
        { header: "Mã hàng", width: 14 },
        { header: "Tên", width: 30 },
        { header: "Tổng", width: 14 },
        { header: "Ở công trình", width: 14 },
        { header: "Đơn vị", width: 8 },
        { header: "Khai thác (%)", width: 14 },
      ],
      rows: [
        ...report.uses.map((row) => [
          row.code,
          row.name,
          averagePieces(row.totalMilliDays, row.days),
          averagePieces(row.siteMilliDays, row.days),
          "cái",
          percent(utilizationTenths(row.siteMilliDays, row.totalMilliDays)),
        ]),
        [
          "",
          "Cả kho",
          tonnes(
            averageKgMilli({
              kgDays: report.fleet.totalKgDays,
              days: report.fleet.days,
            }),
          ),
          tonnes(
            averageKgMilli({
              kgDays: report.fleet.siteKgDays,
              days: report.fleet.days,
            }),
          ),
          "tấn",
          percent(
            utilizationTenths(
              report.fleet.siteKgDays,
              report.fleet.totalKgDays,
            ),
          ),
        ],
      ],
    },
    {
      sheetName: "Xếp hạng nhà thầu",
      columns: [
        { header: "Hạng theo doanh thu", width: 12 },
        { header: "Hạng theo kg", width: 12 },
        { header: "Nhà thầu", width: 36 },
        money("Doanh thu"),
        money("Thuê"),
        money("Bán"),
        { header: "Tấn đã giao", width: 14 },
        { header: "Hợp đồng", width: 10 },
      ],
      rows: ranked.map((row) => [
        row.revenue > 0 ? row.rank : null,
        kgRank.get(row.customerId) ?? null,
        row.name,
        row.revenue,
        row.rent,
        row.sale,
        tonnes(row.kgMilli),
        row.contracts,
      ]),
    },
  ]);
}

/** The workbook of `period` and its file name. */
export async function exportReport(
  db: Reader,
  period: ReportPeriod,
  today: BusinessDate,
): Promise<{ file: Uint8Array; filename: string }> {
  const report = await buildReport(db, period, today);
  return {
    file: reportWorkbook(report),
    filename: `bao-cao-${period.value}.xlsx`,
  };
}

// D15 blocks (management-reports tasks 5.2–5.4; spec management-reports):
// the tiles and the change against the previous period, the three-column
// profit table, the month chart, the loss and utilization tables folded
// after ten items, the full ranking.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import {
  dailyFleet,
  fleetTotals,
  lossTable,
  sumFleet,
  utilizationTable,
  type FleetItem,
} from "@/domain/fleet-metrics";
import {
  changeText,
  monthlyProfit,
  sumMonths,
  type LedgerSum,
  type RevenueParts,
} from "@/domain/gross-profit";
import { comparableRange, parsePeriod } from "@/domain/report-period";
import type { RankingRow } from "@/lib/reports/ranking";
import type { Report } from "@/lib/reports/report";

import { CustomerRanking } from "./customer-ranking";
import { LossTable, UseTable } from "./fleet-tables";
import { chartMonths, ProfitChart } from "./profit-chart";
import { costText, ProfitTable } from "./profit-table";
import { ReportTiles } from "./report-tiles";

const d = (value: string) => value as BusinessDate;
const K = 1000;
const OCT_TODAY = d("2026-11-06");

const parts = (rent: number, sale = 0, compensation = 0, buyBack = 0) =>
  ({ rent, sale, compensation, buyBack }) satisfies RevenueParts;

const MONTHS = Array.from(
  { length: 10 },
  (_, index) => `2026-${String(index + 1).padStart(2, "0")}`,
);

const ledger: LedgerSum[] = [
  {
    month: "2026-10",
    documentType: "DELIVERY_NOTE",
    movement: "SALE_OUT",
    amount: -102_200_000,
  },
  {
    month: "2026-10",
    documentType: "BUY_BACK",
    movement: "SALE_OUT",
    amount: -7_900_000,
  },
  {
    month: "2026-10",
    documentType: "RETURN_NOTE",
    movement: "LOSS_OUT",
    amount: -9_860_000,
  },
  {
    month: "2026-10",
    documentType: "RETURN_NOTE",
    movement: "RETURN_OUT",
    amount: -6_240_000,
  },
  {
    month: "2026-10",
    documentType: "STOCKTAKE",
    movement: "ADJUST_OUT",
    amount: -1_140_000,
  },
  {
    month: "2026-02",
    documentType: "RETURN_NOTE",
    movement: "LOSS_OUT",
    amount: -400_000_000,
  },
];

const ITEMS: FleetItem[] = Array.from({ length: 16 }, (_, index) => ({
  itemId: `i${index}`,
  code: `M-${String(index).padStart(2, "0")}`,
  name: `Mã ${index}`,
  unit: "PIECE",
  standardWeightKg: "10.000",
}));

function makeReport(today = OCT_TODAY, value = "2026-10"): Report {
  const period = parsePeriod("month", value, today);
  const revenue = new Map<string, RevenueParts>(
    MONTHS.map((month) => [month, parts(30_000_000)]),
  );
  revenue.set("2026-09", parts(450_150_000));
  revenue.set(
    "2026-10",
    parts(352_300_000, 146_000_000, 24_450_000, 12_800_000),
  );
  const rows = monthlyProfit(
    MONTHS,
    revenue,
    ledger,
    [
      {
        month: "2026-10",
        repairCost: 14_300_000,
        lossAmount: 600_000,
        materialCost: 0,
      },
    ],
    new Set(["2026-10"]),
  );
  const months = dailyFleet(
    ITEMS.flatMap((item, index) => [
      { itemId: item.itemId, onSite: true, milli: (index + 1) * K },
      { itemId: item.itemId, onSite: false, milli: 20 * K },
    ]),
    [],
    d("2026-10-01"),
    d("2026-10-31"),
  );
  const fleet = sumFleet(months, ["2026-10"]);
  const current = sumMonths(rows, ["2026-10"]);
  const comparable = comparableRange(period, today);
  const ranking: RankingRow[] = [
    ["a", "Cty CP Đầu tư Sông Hồng", 1_284_500_000, 412_800 * K],
    ["b", "Cty TNHH Xây dựng Minh Phát", 962_300_000, 500_000 * K],
    ["c", "Anh Trần Văn Hùng", 186_400_000, 58_200 * K],
  ].map(([customerId, name, revenue, kgMilli], index) => ({
    rank: index + 1,
    customerId: customerId as string,
    name: name as string,
    revenue: revenue as number,
    rent: (revenue as number) - 100_000_000,
    sale: 100_000_000,
    kgMilli: kgMilli as number,
    contracts: 2,
  }));
  return {
    period,
    label: "Tháng 10/2026",
    previousLabel: "Tháng 09/2026",
    dataUntil: "số liệu đến hết 31/10/2026",
    range: { from: period.from, to: period.to },
    year: 2026,
    current,
    previous: sumMonths(rows, ["2026-09"]),
    yearToDate: sumMonths(rows, MONTHS),
    change: {
      text: changeText(current.revenueTotal, 450_150_000),
      comparable,
    },
    months: rows,
    losses: lossTable(
      ITEMS,
      fleet,
      [{ month: "2026-10", itemId: "i0", kind: "loss", milli: 2 * K }],
      ["2026-10"],
    ),
    lossesYear: lossTable(ITEMS, fleet, [], ["2026-10"]).total,
    uses: utilizationTable(ITEMS, fleet),
    fleet: fleetTotals(ITEMS, fleet),
    ranking: {
      byRevenue: ranking,
      byKg: [...ranking]
        .sort((a, b) => b.kgMilli - a.kgMilli)
        .map((row, index) => ({ ...row, rank: index + 1 })),
    },
  };
}

describe("ReportTiles", () => {
  it("shows revenue against the whole previous month when it has ended", () => {
    render(<ReportTiles report={makeReport()} />);
    expect(screen.getByText("535.550.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("+ 19,0 % so với tháng 9")).toBeInTheDocument();
    expect(screen.getByText("407.610.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("Tỷ suất 76,1 %")).toBeInTheDocument();
  });

  it("compares a running month with its first days", () => {
    const report = makeReport(d("2026-11-06"), "2026-11");
    const running = {
      ...report,
      change: {
        text: changeText(71_300_000, 68_400_000),
        comparable: comparableRange(report.period, d("2026-11-06")),
      },
    };
    render(<ReportTiles report={running} />);
    expect(
      screen.getByText("+ 4,2 % so với 01/10 – 06/10"),
    ).toBeInTheDocument();
  });

  it("writes no percent without a base", () => {
    const report = makeReport();
    render(
      <ReportTiles
        report={{ ...report, change: { ...report.change, text: null } }}
      />,
    );
    expect(screen.queryByText(/so với tháng 9/)).toBeNull();
    expect(screen.getByText("Chưa có số kỳ trước để so")).toBeInTheDocument();
  });
});

describe("ProfitTable", () => {
  it("lists the lines decided in review and the notes", () => {
    render(<ProfitTable report={makeReport()} />);
    const table = screen.getByRole("table");
    for (const label of [
      "Giảm giá trị khi trả về đổi tình trạng",
      "Sửa chữa (lỗ hỏng hàng)",
      "Chênh lệch kiểm kê và điều chỉnh",
    ]) {
      expect(within(table).getByText(label)).toBeInTheDocument();
    }
    const profit = within(table).getByText("Lợi nhuận gộp").closest("tr");
    expect(profit).toHaveTextContent("407.610.000 ₫");
    const costs = within(table).getByText("Giá vốn và hao hụt").closest("tr");
    expect(costs).toHaveTextContent("− 127.940.000 ₫");
    // This month and the year hold the open October; September is closed.
    expect(within(table).getAllByText("tạm tính")).toHaveLength(2);
    expect(
      screen.getByText(/Chi phí sửa đã chi trong kỳ: 14\.300\.000 ₫/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Chưa gồm chi phí ngoài sổ kho \(xe, nhân công…\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Hàng mất tính theo ngày trả, đền bù theo ngày duyệt/),
    ).toBeInTheDocument();
  });

  it("writes a gain as plus", () => {
    expect(costText(-408_276)).toBe("+ 408.276 ₫");
    expect(costText(141_640_000)).toBe("− 141.640.000 ₫");
    expect(costText(0)).toBe("0 ₫");
  });
});

describe("ProfitChart", () => {
  it("draws ten months, marks the provisional one, puts a loss under zero", () => {
    const report = makeReport();
    const months = chartMonths(report.months);
    const { container } = render(<ProfitChart year={2026} months={months} />);
    const list = screen.getByRole("list", {
      name: "Doanh thu và lợi nhuận gộp theo tháng",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    expect(within(list).getByText(/T10 \(tạm tính\)/)).toBeInTheDocument();
    expect(container.querySelector("svg")?.textContent).toContain("T10*");
    const february = months.find((month) => month.month === "2026-02");
    expect(february?.profit).toBeLessThan(0);
    const zero = Number(container.querySelector("line")?.getAttribute("y1"));
    const below = [...container.querySelectorAll("rect.fill-primary")].filter(
      (rect) => Number(rect.getAttribute("y")) === zero,
    );
    expect(below).toHaveLength(1);
  });
});

describe("fleet tables", () => {
  it("folds the items after the tenth and totals the losses", () => {
    render(<LossTable report={makeReport()} />);
    const table = screen.getByRole("table");
    const body = within(table).getAllByRole("rowgroup")[1] as HTMLElement;
    expect(within(body).getAllByRole("row")).toHaveLength(11);
    expect(within(table).getByText("6 mã khác")).toBeInTheDocument();
    expect(within(table).getByText("Cộng").closest("tr")).toHaveTextContent(
      "0,02",
    );
  });

  it("sorts utilization highest first, in pieces", () => {
    render(<UseTable report={makeReport()} />);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("M-15");
    expect(rows[1]).toHaveTextContent("36");
    expect(rows[1]).toHaveTextContent("44,4 %");
    expect(screen.getByText("6 mã khác")).toBeInTheDocument();
  });
});

describe("CustomerRanking", () => {
  it("lists every customer and switches to kg", async () => {
    render(
      <CustomerRanking
        year={2026}
        byRevenue={makeReport().ranking.byRevenue}
        byKg={makeReport().ranking.byKg}
      />,
    );
    const names = () =>
      within(screen.getByRole("table"))
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent);
    expect(names()[0]).toContain("Sông Hồng");
    expect(names()).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Theo kg" }));
    expect(names()[0]).toContain("Minh Phát");
    expect(screen.getByText("500,0")).toBeInTheDocument();
  });
});

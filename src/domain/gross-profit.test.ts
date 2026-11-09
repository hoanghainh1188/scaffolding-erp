// Gross profit (management-reports tasks 2.2–2.4; spec gross-profit;
// 0.2 #107, #111–#113).
import { describe, expect, it } from "vitest";

import {
  changeText,
  classifyLedger,
  COST_CATEGORIES,
  COST_LABELS,
  ledgerCostCheck,
  LEDGER_DOCUMENTS,
  marginText,
  monthlyProfit,
  percentTenths,
  sumMonths,
  type LedgerSum,
  type MonthProfit,
  type ProductionSum,
  type RepairSum,
  type RevenueParts,
} from "./gross-profit";
import { STOCKTAKE_DOCUMENT_TYPE } from "./stocktake";

const RETURN = LEDGER_DOCUMENTS.return;
const line = (
  month: string,
  documentType: string,
  movement: string,
  amount: number,
): LedgerSum => ({ month, documentType, movement, amount });
const repair = (
  month: string,
  repairCost: number,
  lossAmount: number,
  materialCost = 0,
): RepairSum => ({ month, repairCost, lossAmount, materialCost });
const noRevenue = new Map<string, RevenueParts>();

function totalsOf(
  months: string[],
  ledger: LedgerSum[],
  repairs: RepairSum[] = [],
  revenue: ReadonlyMap<string, RevenueParts> = noRevenue,
) {
  const rows = monthlyProfit(months, revenue, ledger, repairs, new Set());
  return { rows, total: sumMonths(rows, months) };
}

describe("classifyLedger (design D1, D2)", () => {
  it.each([
    [LEDGER_DOCUMENTS.delivery, "SALE_OUT", "sale"],
    [LEDGER_DOCUMENTS.buyBack, "SALE_OUT", "buyBack"],
    [RETURN, "LOSS_OUT", "loss"],
    [RETURN, "RETURN_OUT", "returnWriteDown"],
    [RETURN, "RETURN_IN", "returnWriteDown"],
    [LEDGER_DOCUMENTS.stocktake, "ADJUST_OUT", "countAdjust"],
    [LEDGER_DOCUMENTS.adjustment, "ADJUST_IN", "countAdjust"],
  ])("%s %s is %s", (type, movement, category) => {
    expect(classifyLedger(type, movement)).toBe(category);
  });

  it.each([
    ["OPENING", "OPENING"],
    ["GOODS_RECEIPT", "PURCHASE_IN"],
    ["REVALUE", "REVALUE"],
    [LEDGER_DOCUMENTS.delivery, "DELIVERY_OUT"],
    [LEDGER_DOCUMENTS.delivery, "DELIVERY_IN"],
    ["SITE_TRANSFER", "TRANSFER_OUT"],
    ["SITE_TRANSFER", "TRANSFER_IN"],
    ["REPAIR", "REPAIR_OUT"],
    ["REPAIR", "REPAIR_IN"],
  ])("%s %s is outside the cost lines", (type, movement) => {
    expect(classifyLedger(type, movement)).toBeNull();
  });

  it("reads the document types the posting code writes", async () => {
    const site = await import("@/lib/deliveries/site-ledger");
    expect(LEDGER_DOCUMENTS.delivery).toBe(site.DELIVERY_DOCUMENT_TYPE);
    expect(LEDGER_DOCUMENTS.buyBack).toBe(site.BUY_BACK_DOCUMENT_TYPE);
    expect(LEDGER_DOCUMENTS.return).toBe(site.RETURN_DOCUMENT_TYPE);
    expect(LEDGER_DOCUMENTS.stocktake).toBe(STOCKTAKE_DOCUMENT_TYPE);
  });

  it("labels the rows as decided in review (0.2 #111–#113)", () => {
    expect(COST_CATEGORIES.map((category) => COST_LABELS[category])).toEqual([
      "Giá vốn hàng bán",
      "Giá vốn hàng khách mua lại",
      "Hàng mất ở công trình",
      "Giảm giá trị khi trả về đổi tình trạng",
      "Sửa chữa (lỗ hỏng hàng)",
      "Chênh lệch kiểm kê và điều chỉnh",
    ]);
  });
});

describe("gross profit of a month (spec: tính tay một tháng)", () => {
  const revenue = new Map<string, RevenueParts>([
    [
      "2026-10",
      {
        rent: 352_300_000,
        sale: 146_000_000,
        compensation: 24_450_000,
        buyBack: 12_800_000,
      },
    ],
  ]);
  const ledger = [
    line("2026-10", LEDGER_DOCUMENTS.delivery, "SALE_OUT", -102_200_000),
    line("2026-10", LEDGER_DOCUMENTS.buyBack, "SALE_OUT", -7_900_000),
    line("2026-10", RETURN, "LOSS_OUT", -9_860_000),
    line("2026-10", RETURN, "RETURN_OUT", -46_240_000),
    line("2026-10", RETURN, "RETURN_IN", 40_000_000),
    line("2026-10", LEDGER_DOCUMENTS.stocktake, "ADJUST_OUT", -1_340_000),
    line("2026-10", LEDGER_DOCUMENTS.adjustment, "ADJUST_IN", 200_000),
    line("2026-10", "GOODS_RECEIPT", "PURCHASE_IN", 80_000_000),
    line("2026-10", LEDGER_DOCUMENTS.delivery, "DELIVERY_OUT", -9_000_000),
    line("2026-10", LEDGER_DOCUMENTS.delivery, "DELIVERY_IN", 9_000_000),
    line("2026-10", "REPAIR", "REPAIR_OUT", -1_050_000),
    line("2026-10", "REPAIR", "REPAIR_IN", 450_000),
  ];
  const repairs = [repair("2026-10", 0, 600_000)];
  const { total } = totalsOf(["2026-10"], ledger, repairs, revenue);

  it("takes every cost line from the ledger", () => {
    expect(total.revenueTotal).toBe(535_550_000);
    expect(total.costs).toEqual({
      sale: 102_200_000,
      buyBack: 7_900_000,
      loss: 9_860_000,
      returnWriteDown: 6_240_000,
      repair: 600_000,
      countAdjust: 1_140_000,
    });
    expect(total.costTotal).toBe(127_940_000);
    expect(total.profit).toBe(407_610_000);
    expect(marginText(total.profit, total.revenueTotal)).toBe("76,1 %");
  });

  it("matches the ledger check of design D1", () => {
    expect(ledgerCostCheck(ledger, repairs)).toBe(total.costTotal);
  });
});

describe("periods add up their months (spec: quý bằng tổng 3 tháng)", () => {
  const months = ["2026-07", "2026-08", "2026-09"];
  const profits = [341_000_000, 393_000_000, 358_180_000];
  const rows: MonthProfit[] = months.map((month, index) => ({
    month,
    revenue: {
      rent: profits[index] ?? 0,
      sale: 0,
      compensation: 0,
      buyBack: 0,
    },
    costs: {
      sale: 0,
      buyBack: 0,
      loss: 0,
      returnWriteDown: 0,
      repair: 0,
      countAdjust: 0,
    },
    repairSpent: 1_000,
    productionSpent: 500,
    provisional: month === "2026-09",
  }));

  it("sums the quarter", () => {
    const quarter = sumMonths(rows, months);
    expect(quarter.profit).toBe(1_092_180_000);
    expect(quarter.repairSpent).toBe(3_000);
    expect(quarter.productionSpent).toBe(1_500);
    expect(quarter.provisional).toBe(true);
  });

  it("is the sum of its parts whichever way it is cut", () => {
    const first = sumMonths(rows, ["2026-07"]).profit;
    const rest = sumMonths(rows, ["2026-08", "2026-09"]).profit;
    expect(first + rest).toBe(sumMonths(rows, months).profit);
    expect(sumMonths(rows, ["2026-07", "2026-08"]).provisional).toBe(false);
  });
});

describe("no cost taken twice (design D1, 0.2 #111)", () => {
  it("returned for repair, repaired, then lost", () => {
    const months = ["2026-10", "2026-11", "2026-12"];
    const ledger = [
      line("2026-10", RETURN, "RETURN_OUT", -4_000_000),
      line("2026-10", RETURN, "RETURN_IN", 2_500_000),
      line("2026-11", "REPAIR", "REPAIR_OUT", -2_500_000),
      line("2026-11", "REPAIR", "REPAIR_IN", 3_000_000),
      line("2026-12", RETURN, "LOSS_OUT", -3_000_000),
    ];
    const repairs = [repair("2026-11", 500_000, 0)];
    const { rows, total } = totalsOf(months, ledger, repairs);
    expect(rows.map((row) => row.costs.returnWriteDown)).toEqual([
      1_500_000, 0, 0,
    ]);
    expect(rows[1]?.costs.repair).toBe(0);
    expect(rows[1]?.repairSpent).toBe(500_000);
    expect(rows[2]?.costs.loss).toBe(3_000_000);
    expect(total.costTotal).toBe(4_500_000);
    expect(ledgerCostCheck(ledger, repairs)).toBe(4_500_000);
  });

  it("returned as scrap, then the scrap is sold", () => {
    const months = ["2026-10", "2026-11"];
    const revenue = new Map<string, RevenueParts>([
      ["2026-11", { rent: 0, sale: 405_000, compensation: 0, buyBack: 0 }],
    ]);
    const ledger = [
      line("2026-10", RETURN, "RETURN_OUT", -1_600_000),
      line("2026-10", RETURN, "RETURN_IN", 240_000),
      line("2026-11", LEDGER_DOCUMENTS.delivery, "SALE_OUT", -240_000),
    ];
    const { rows, total } = totalsOf(months, ledger, [], revenue);
    expect(rows[0]?.costs.returnWriteDown).toBe(1_360_000);
    expect(rows[1]?.costs.sale).toBe(240_000);
    expect(rows[1]?.revenue.sale).toBe(405_000);
    expect(total.costTotal).toBe(1_600_000);
    expect(ledgerCostCheck(ledger, [])).toBe(1_600_000);
  });

  it("takes the damage loss of a line with nothing repaired", () => {
    const ledger = [
      line("2026-11", "REPAIR", "REPAIR_OUT", -1_050_000),
      line("2026-11", "REPAIR", "REPAIR_IN", 450_000),
    ];
    const repairs = [repair("2026-11", 0, 600_000)];
    const { total } = totalsOf(["2026-11"], ledger, repairs);
    expect(total.costs.repair).toBe(600_000);
    expect(ledgerCostCheck(ledger, repairs)).toBe(600_000);
  });

  it("takes nothing for a line whose repaired pieces carry the scrap", () => {
    const ledger = [
      line("2026-11", "REPAIR", "REPAIR_OUT", -6_400_000),
      line("2026-11", "REPAIR", "REPAIR_IN", 7_975_000),
      line("2026-11", "REPAIR", "REPAIR_IN", 405_000),
    ];
    const repairs = [repair("2026-11", 1_980_000, 0)];
    const { total } = totalsOf(["2026-11"], ledger, repairs);
    expect(total.costs.repair).toBe(0);
    expect(total.repairSpent).toBe(1_980_000);
    expect(ledgerCostCheck(ledger, repairs)).toBe(0);
  });

  it("work order D12: supplies are not taken twice (repair-work-orders D3)", () => {
    const ledger = [
      line("2026-11", "REPAIR", "TRANSFER_OUT", -7_000_000),
      line("2026-11", "REPAIR", "TRANSFER_IN", 7_000_000),
      line("2026-11", "REPAIR", "REPAIR_OUT", -6_400_000),
      line("2026-11", "REPAIR", "REPAIR_IN", 7_975_000),
      line("2026-11", "REPAIR", "REPAIR_IN", 405_000),
      line("2026-11", "REPAIR", "REPAIR_OUT", -600_000),
      line("2026-11", "REPAIR", "REPAIR_IN", 845_000),
      line("2026-11", "REPAIR", "REPAIR_OUT", -585_000),
    ];
    const repairs = [repair("2026-11", 2_225_000, 0, 585_000)];
    const { total } = totalsOf(["2026-11"], ledger, repairs);
    expect(total.costs.repair).toBe(0);
    expect(total.costTotal).toBe(0);
    expect(total.repairSpent).toBe(2_225_000);
    expect(ledgerCostCheck(ledger, repairs)).toBe(0);
    // The old check added the supplies back and was 585.000 ₫ off.
    expect(ledgerCostCheck(ledger, [repair("2026-11", 2_225_000, 0)])).toBe(
      585_000,
    );
  });

  it("work order with supplies, then the stock is lost", () => {
    const months = ["2026-11", "2026-12"];
    const ledger = [
      line("2026-11", "REPAIR", "REPAIR_OUT", -2_500_000),
      line("2026-11", "REPAIR", "REPAIR_IN", 3_000_000),
      line("2026-11", "REPAIR", "REPAIR_OUT", -200_000),
      line("2026-12", RETURN, "LOSS_OUT", -3_000_000),
    ];
    const repairs = [repair("2026-11", 500_000, 0, 200_000)];
    const { rows, total } = totalsOf(months, ledger, repairs);
    expect(sumMonths(rows, ["2026-11"]).costTotal).toBe(0);
    expect(rows[0]?.repairSpent).toBe(500_000);
    expect(rows[1]?.costs.loss).toBe(3_000_000);
    expect(total.costTotal).toBe(3_000_000);
    expect(ledgerCostCheck(ledger, repairs)).toBe(3_000_000);
  });

  it("keeps a negative write-down when the stock comes back dearer", () => {
    const { total } = totalsOf(
      ["2026-10"],
      [
        line("2026-10", RETURN, "RETURN_OUT", -100_000),
        line("2026-10", RETURN, "RETURN_IN", 120_000),
      ],
    );
    expect(total.costs.returnWriteDown).toBe(-20_000);
  });

  it("leaves out the value correction and the opening stock (0.2 #113)", () => {
    const ledger = [
      line("2026-10", "REVALUE", "REVALUE", 1_200_000),
      line("2026-10", "OPENING", "OPENING", 50_000_000),
    ];
    const { total } = totalsOf(["2026-10"], ledger);
    expect(total.costTotal).toBe(0);
    expect(ledgerCostCheck(ledger, [])).toBe(0);
  });
});

describe("percent texts", () => {
  it("rounds the margin half up to one decimal", () => {
    expect(marginText(7_955, 10_000)).toBe("79,6 %");
    expect(marginText(7_954, 10_000)).toBe("79,5 %");
    expect(percentTenths(-7_955, 10_000)).toBe(-796);
    expect(marginText(-50_000, 1_000_000)).toBe("−5,0 %");
  });

  it("has no margin without revenue", () => {
    expect(marginText(0, 0)).toBe("—");
    expect(marginText(-100, -200)).toBe("—");
  });

  it("writes the change against the period before", () => {
    expect(changeText(535_550_000, 450_150_000)).toBe("+ 19,0 %");
    expect(changeText(71_300_000, 68_400_000)).toBe("+ 4,2 %");
    expect(changeText(4_486_500_000, 4_100_000_000)).toBe("+ 9,4 %");
    expect(changeText(90, 100)).toBe("− 10,0 %");
    expect(changeText(100, 0)).toBeNull();
  });
});

describe("production orders (production-orders design D3)", () => {
  const PRODUCTION = "PRODUCTION";
  const month = "2026-11";
  // LSX-2026-004 of D20.
  const ledger = [
    line(month, PRODUCTION, "PRODUCTION_OUT", -41_119_500),
    line(month, PRODUCTION, "PRODUCTION_IN", 46_219_500),
  ];
  const productions: ProductionSum[] = [{ month, laborCost: 5_100_000 }];

  it("leaves production out of every cost line", () => {
    expect(classifyLedger(PRODUCTION, "PRODUCTION_IN")).toBeNull();
    expect(classifyLedger(PRODUCTION, "PRODUCTION_OUT")).toBeNull();
  });

  it("checks to 0 on a month with only that order", () => {
    expect(ledgerCostCheck(ledger, [], productions)).toBe(0);
  });

  it("would be off by the materials if they were added back", () => {
    const wrong: ProductionSum[] = [
      { month, laborCost: 5_100_000 + 41_119_500 },
    ];
    expect(ledgerCostCheck(ledger, [], wrong)).toBe(41_119_500);
  });

  it("shows the labour under the table and costs nothing", () => {
    const rows = monthlyProfit([month], noRevenue, ledger, [], new Set(), [
      ...productions,
      { month: "2026-10", laborCost: 7 },
    ]);
    expect(rows[0]?.productionSpent).toBe(5_100_000);
    const total = sumMonths(rows, [month]);
    expect(total.productionSpent).toBe(5_100_000);
    expect(total.costTotal).toBe(0);
  });
});

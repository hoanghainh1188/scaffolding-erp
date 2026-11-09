// Gross profit of D15 (management-reports design D1–D3; 0.2 số 107, số 111–số 113,
// số 116). Revenue before VAT minus the cost and losses the stock ledger
// records, no depreciation. Every amount has one day and every period is a
// sum of months, so this period, the previous one and the year add up.
// Repair costs are not taken when spent: they sit in the price of the Good
// stock and reach the profit when that stock leaves (0.2 số 111), so the
// "Sửa chữa" line is the damage loss only. Pure functions.
import { roundHalfUp } from "./average-cost";

/** Ledger document types read here (the posting code writes the same). */
export const LEDGER_DOCUMENTS = {
  delivery: "DELIVERY_NOTE",
  buyBack: "BUY_BACK",
  return: "RETURN_NOTE",
  stocktake: "STOCKTAKE",
  adjustment: "ADJUSTMENT",
} as const;

export const REVENUE_PARTS = [
  "rent",
  "sale",
  "compensation",
  "buyBack",
] as const;
export type RevenuePart = (typeof REVENUE_PARTS)[number];

export const COST_CATEGORIES = [
  "sale",
  "buyBack",
  "loss",
  "returnWriteDown",
  "repair",
  "countAdjust",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const REVENUE_LABELS: Readonly<Record<RevenuePart, string>> = {
  rent: "Tiền thuê (gồm cước thuê)",
  sale: "Bán hàng (gồm cước bán)",
  compensation: "Đền bù đã duyệt",
  buyBack: "Mua lại đã duyệt",
};

export const COST_LABELS: Readonly<Record<CostCategory, string>> = {
  sale: "Giá vốn hàng bán",
  buyBack: "Giá vốn hàng khách mua lại",
  loss: "Hàng mất ở công trình",
  returnWriteDown: "Giảm giá trị khi trả về đổi tình trạng",
  repair: "Sửa chữa (lỗ hỏng hàng)",
  countAdjust: "Chênh lệch kiểm kê và điều chỉnh",
};

/** Ledger movements outside the cost (design D1): stock coming in. */
const ACQUISITIONS: ReadonlySet<string> = new Set([
  "OPENING",
  "PURCHASE_IN",
  "REVALUE",
]);

/**
 * The cost line a ledger line belongs to, or null. Repair lines are null:
 * the "Sửa chữa" line reads the damage loss of the slip (design D1);
 * deliveries to sites and site transfers add up to 0.
 */
export function classifyLedger(
  documentType: string,
  movement: string,
): Exclude<CostCategory, "repair"> | null {
  if (movement === "SALE_OUT") {
    if (documentType === LEDGER_DOCUMENTS.delivery) return "sale";
    if (documentType === LEDGER_DOCUMENTS.buyBack) return "buyBack";
    return null;
  }
  if (movement === "LOSS_OUT") return "loss";
  if (movement === "RETURN_OUT" || movement === "RETURN_IN") {
    return documentType === LEDGER_DOCUMENTS.return ? "returnWriteDown" : null;
  }
  if (movement === "ADJUST_OUT" || movement === "ADJUST_IN") {
    return documentType === LEDGER_DOCUMENTS.stocktake ||
      documentType === LEDGER_DOCUMENTS.adjustment
      ? "countAdjust"
      : null;
  }
  return null;
}

/** Ledger value of one (month, document type, movement); out is negative. */
export interface LedgerSum {
  month: string;
  documentType: string;
  movement: string;
  amount: number;
}

/** Repair slips posted in one month (by the ledger day of the posting). */
export interface RepairSum {
  month: string;
  /** Repair cost on the slip lines: spent, already in the Good price. */
  repairCost: number;
  /**
   * The part of repairCost that is supplies issued from stock (work
   * orders, repair-work-orders design D3): it moved value inside the
   * ledger, so the check must not add it back. 0 on simple slips.
   */
  materialCost: number;
  /** Damage loss of lines with nothing repaired (0.2 số 23). */
  lossAmount: number;
}

/**
 * Piece-rate labour of the production orders posted in one month
 * (production-orders design D3): the one part of a posting not in the
 * ledger. Materials and offcuts are ledger lines already.
 */
export interface ProductionSum {
  month: string;
  laborCost: number;
}

export type RevenueParts = Readonly<Record<RevenuePart, number>>;
export type CostParts = Readonly<Record<CostCategory, number>>;

export interface MonthProfit {
  month: string;
  revenue: RevenueParts;
  costs: CostParts;
  /** Repair cost spent: shown under the table, not taken (0.2 số 111). */
  repairSpent: number;
  /** Production labour spent: shown under the table, inside the goods' price. */
  productionSpent: number;
  /** Some rental period of the month is not closed. */
  provisional: boolean;
}

const zeroRevenue = (): Record<RevenuePart, number> => ({
  rent: 0,
  sale: 0,
  compensation: 0,
  buyBack: 0,
});

const zeroCosts = (): Record<CostCategory, number> => ({
  sale: 0,
  buyBack: 0,
  loss: 0,
  returnWriteDown: 0,
  repair: 0,
  countAdjust: 0,
});

/** One row per month: revenue parts, cost lines (+ lowers the profit). */
export function monthlyProfit(
  months: readonly string[],
  revenue: ReadonlyMap<string, RevenueParts>,
  ledger: readonly LedgerSum[],
  repairs: readonly RepairSum[],
  openMonths: ReadonlySet<string>,
  productions: readonly ProductionSum[] = [],
): MonthProfit[] {
  return months.map((month) => {
    const costs = zeroCosts();
    for (const row of ledger) {
      if (row.month !== month) continue;
      const category = classifyLedger(row.documentType, row.movement);
      if (category) costs[category] -= row.amount;
    }
    let repairSpent = 0;
    for (const row of repairs) {
      if (row.month !== month) continue;
      costs.repair += row.lossAmount;
      repairSpent += row.repairCost;
    }
    return {
      month,
      revenue: { ...zeroRevenue(), ...revenue.get(month) },
      costs,
      repairSpent,
      productionSpent: productions
        .filter((row) => row.month === month)
        .reduce((sum, row) => sum + row.laborCost, 0),
      provisional: openMonths.has(month),
    };
  });
}

export interface ProfitTotals {
  revenue: RevenueParts;
  revenueTotal: number;
  costs: CostParts;
  costTotal: number;
  profit: number;
  repairSpent: number;
  productionSpent: number;
  provisional: boolean;
}

const sumOf = (values: Readonly<Record<string, number>>) =>
  Object.values(values).reduce((sum, value) => sum + value, 0);

/** The totals of some months: a quarter, a year, a year to date. */
export function sumMonths(
  rows: readonly MonthProfit[],
  months: readonly string[],
): ProfitTotals {
  const wanted = new Set(months);
  const revenue = zeroRevenue();
  const costs = zeroCosts();
  let repairSpent = 0;
  let productionSpent = 0;
  let provisional = false;
  for (const row of rows) {
    if (!wanted.has(row.month)) continue;
    for (const part of REVENUE_PARTS) revenue[part] += row.revenue[part];
    for (const category of COST_CATEGORIES) {
      costs[category] += row.costs[category];
    }
    repairSpent += row.repairSpent;
    productionSpent += row.productionSpent;
    provisional ||= row.provisional;
  }
  const revenueTotal = sumOf(revenue);
  const costTotal = sumOf(costs);
  return {
    revenue,
    revenueTotal,
    costs,
    costTotal,
    profit: revenueTotal - costTotal,
    repairSpent,
    productionSpent,
    provisional,
  };
}

/**
 * The check of design D1: cost and losses = − the ledger value of every
 * line but stock coming in, + the repair cost that did not go through the
 * ledger (typed cost of simple slips, labour of work orders and production
 * orders; supplies, materials and offcuts are already ledger lines,
 * repair-work-orders design D3, production-orders design D3).
 */
export function ledgerCostCheck(
  ledger: readonly LedgerSum[],
  repairs: readonly RepairSum[],
  productions: readonly ProductionSum[] = [],
): number {
  const ledgerValue = ledger
    .filter((row) => !ACQUISITIONS.has(row.movement))
    .reduce((sum, row) => sum + row.amount, 0);
  const spent = repairs.reduce(
    (sum, row) => sum + row.repairCost - row.materialCost,
    0,
  );
  const labor = productions.reduce((sum, row) => sum + row.laborCost, 0);
  return -ledgerValue + spent + labor;
}

/** Tenths of a percent, halves away from zero; null when base ≤ 0. */
export function percentTenths(part: number, base: number): number | null {
  if (base <= 0) return null;
  return Number(roundHalfUp(BigInt(part) * 1000n, BigInt(base)));
}

/** "76,1 %" or "−4,0 %". */
export function percentText(tenths: number): string {
  const sign = tenths < 0 ? "−" : "";
  const abs = Math.abs(tenths);
  return `${sign}${Math.floor(abs / 10).toLocaleString("vi-VN")},${abs % 10} %`;
}

/** Gross margin: "76,1 %", or "—" when there is no revenue. */
export function marginText(profit: number, revenue: number): string {
  const tenths = percentTenths(profit, revenue);
  return tenths === null ? "—" : percentText(tenths);
}

/** "+ 19,0 %" / "− 4,2 %" against a base; null when the base is ≤ 0. */
export function changeText(current: number, base: number): string | null {
  const tenths = percentTenths(current - base, base);
  if (tenths === null) return null;
  const sign = tenths < 0 ? "−" : "+";
  return `${sign} ${percentText(Math.abs(tenths))}`;
}

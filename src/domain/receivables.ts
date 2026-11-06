// Receivables (receivables spec, design D1–D4): the fixed order of debts,
// how a receipt is split over them (0.2 #19), how prepayments and negative
// periods settle later debts (0.2 #82), overdue status by Vietnamese day,
// VAT of a sale delivery (0.2 #84) and how a deposit is set off when a
// contract is settled (0.2 #40, #81). Pure functions: the database layer
// reads the inputs and stores the allocations they return. The generic core
// (split, credits, status) lives in ./allocation, shared with payables
// (payables design D1); this module keeps its names and messages.
import {
  allocateOrdered,
  applyCreditsOrdered,
  dueStatus,
  holderStatus,
  type CreditAllocation,
  type CreditSource,
  type DueStatus,
  type DueStatusKind,
  type HolderStatus,
  type HolderStatusKind,
  type ManualPart,
} from "./allocation";
import { type BusinessDate } from "./business-date";
import { roundHalfUp } from "./average-cost";
import { formatMoney, toMoney, type Money } from "./money";

export const DEBT_KINDS = [
  "BILLING",
  "SALE",
  "COMPENSATION",
  "BUY_BACK",
] as const;
export type DebtKind = (typeof DEBT_KINDS)[number];

export const DEBT_KIND_LABELS: Readonly<Record<DebtKind, string>> = {
  BILLING: "Thuê",
  SALE: "Bán",
  COMPENSATION: "Đền bù",
  BUY_BACK: "Mua lại",
};

export {
  DUE_SOON_DAYS,
  dueSoonOf,
  orderSources,
  overdueOf,
  type CreditAllocation,
  type CreditSource,
  type ManualPart,
  type Overdue,
} from "./allocation";

/** A receipt or settlement refund: how the money moved. */
export const PAYMENT_METHODS = ["CASH", "TRANSFER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  CASH: "Tiền mặt",
  TRANSFER: "Chuyển khoản",
};

export const RECEIPT_KINDS = ["PAYMENT", "DEPOSIT"] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];
export const RECEIPT_KIND_LABELS: Readonly<Record<ReceiptKind, string>> = {
  PAYMENT: "Trả nợ",
  DEPOSIT: "Nộp cọc tiền",
};

/** Key of a debt: "<kind>:<id>". */
export function debtKey(kind: DebtKind, id: string): string {
  return `${kind}:${id}`;
}

/** A debt with what is left of it. Amounts include VAT. */
export interface OpenDebt {
  key: string;
  kind: DebtKind;
  contractCode: string;
  /** Document code, or the month "YYYY-MM" of a period. */
  documentCode: string;
  issuedDate: BusinessDate;
  dueDate: BusinessDate;
  /** What is still owed: total minus live allocations, never below 0. */
  remaining: Money;
  /** For messages: "PX-2026-041", "Kỳ 10/2026". */
  label: string;
}

/** A rule of receivables broken by the request (422) or by a race (409). */
export class ReceivableRuleError extends Error {
  override readonly name = "ReceivableRuleError";
  readonly status: 409 | 422;

  constructor(message: string, status: 409 | 422 = 422) {
    super(message);
    this.status = status;
  }
}

const KIND_ORDER: Readonly<Record<DebtKind, number>> = {
  BILLING: 0,
  SALE: 1,
  COMPENSATION: 2,
  BUY_BACK: 3,
};

type Ordered = Pick<
  OpenDebt,
  "kind" | "contractCode" | "documentCode" | "issuedDate" | "dueDate"
>;

/** The fixed order (spec receivables): due, issued, kind, contract, code. */
export function compareDebts(a: Ordered, b: Ordered): number {
  return (
    a.dueDate.localeCompare(b.dueDate) ||
    a.issuedDate.localeCompare(b.issuedDate) ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    a.contractCode.localeCompare(b.contractCode) ||
    a.documentCode.localeCompare(b.documentCode)
  );
}

export function orderDebts<T extends Ordered>(debts: readonly T[]): T[] {
  return [...debts].sort(compareDebts);
}

export type AllocationMode = "AUTO" | "MANUAL" | "PREPAYMENT" | "DEPOSIT";

export interface Allocation {
  debtKey: string;
  amount: Money;
  mode: AllocationMode;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Left over after every open debt: the prepayment (0.2 #82). */
  unapplied: Money;
}

export const RECEIVABLE_MESSAGES = {
  amount: "Số tiền phải lớn hơn 0 ₫.",
  unknownDebt: "Khoản được chọn không thuộc nhà thầu này.",
  manualTooMuch: (amount: Money) =>
    `Tổng các khoản chỉ định vượt số tiền phiếu thu (${formatMoney(amount)}).`,
  overDebt: (label: string, remaining: Money) =>
    remaining <= 0
      ? `${label} đã được trừ đủ bởi phiếu khác. Bạn xem lại rồi ghi.`
      : `${label} chỉ còn ${formatMoney(remaining)}.`,
  refundChanged: (seen: Money, now: Money) =>
    `Số hoàn cọc đã đổi từ ${formatMoney(seen)} thành ${formatMoney(now)} từ lúc bạn mở. Bạn xem lại rồi thanh lý.`,
} as const;

/**
 * Splits a payment (0.2 #19): the parts the customer named first, then the
 * rest over the open debts in the fixed order; what is left is unapplied.
 * `openDebts` holds every debt of the customer, settled ones with 0 left.
 * A named part larger than what is left fails: 422 when the debt never
 * owed that much, 409 when another receipt took it meanwhile (`seen`).
 */
export function allocate(input: {
  amount: Money;
  openDebts: readonly OpenDebt[];
  manual?: readonly ManualPart[];
  /** What the form showed as remaining, to tell a race from a mistake. */
  seen?: ReadonlyMap<string, Money>;
}): AllocationResult {
  return allocateOrdered({
    amount: input.amount,
    debts: orderDebts(input.openDebts),
    manual: input.manual,
    seen: input.seen,
    messages: RECEIVABLE_MESSAGES,
    fail: (message, status) => new ReceivableRuleError(message, status),
  });
}

/** Settles open debts in the fixed order from older sources first (0.2 #82). */
export function applyCredits(input: {
  credits: readonly CreditSource[];
  openDebts: readonly OpenDebt[];
}): CreditAllocation[] {
  return applyCreditsOrdered({
    credits: input.credits,
    debts: orderDebts(input.openDebts),
  });
}

export type DebtStatusKind = DueStatusKind;
export type DebtStatus = DueStatus;

/** Status of one debt on `today` (Vietnamese day, spec receivables). */
export function debtStatus(
  remaining: number,
  dueDate: BusinessDate,
  today: BusinessDate,
): DebtStatus {
  return dueStatus(remaining, dueDate, today, "Đã thu đủ");
}

/** VAT of a sale delivery (0.2 #84): on goods + freight, rounded half up. */
export function saleVat(
  sale: Money,
  freight: Money,
  vatBasisPoints: number | null,
): Money {
  if (vatBasisPoints === null) return toMoney(0);
  return toMoney(
    Number(
      roundHalfUp(BigInt(sale + freight) * BigInt(vatBasisPoints), 10_000n),
    ),
  );
}

export type CustomerStatusKind = HolderStatusKind;
export type CustomerStatus = HolderStatus;

/** The "Tình hình" of a customer row on D14. */
export function customerStatus(input: {
  debts: readonly Pick<OpenDebt, "remaining" | "dueDate">[];
  prepaid: Money;
  today: BusinessDate;
}): CustomerStatus {
  return holderStatus({
    debts: input.debts,
    credit: input.prepaid,
    today: input.today,
    creditLabel: "Trả trước",
  });
}

export interface SettlementPlan {
  deposit: Money;
  offset: Money;
  refund: Money;
  allocations: CreditAllocation[];
  /** What the contract still owes after the set-off. */
  stillOwed: Money;
}

/**
 * Sets the received cash deposit off against the debts of the same
 * contract (0.2 #40, #81): older deposit receipts first, debts in the
 * fixed order. The rest of the deposit is refunded. When the caller sends
 * the refund it saw and it differs, the plan is refused with 409.
 */
export function settlementPlan(input: {
  deposits: readonly CreditSource[];
  contractDebts: readonly OpenDebt[];
  expectedRefund?: Money;
}): SettlementPlan {
  const allocations = applyCredits({
    credits: input.deposits,
    openDebts: input.contractDebts,
  });
  const deposit = input.deposits.reduce((sum, d) => sum + d.available, 0);
  const offset = allocations.reduce((sum, a) => sum + a.amount, 0);
  const owed = input.contractDebts.reduce(
    (sum, debt) => sum + Math.max(debt.remaining, 0),
    0,
  );
  const refund = toMoney(deposit - offset);
  if (input.expectedRefund !== undefined && input.expectedRefund !== refund) {
    throw new ReceivableRuleError(
      RECEIVABLE_MESSAGES.refundChanged(input.expectedRefund, refund),
      409,
    );
  }
  return {
    deposit: toMoney(deposit),
    offset: toMoney(offset),
    refund,
    allocations,
    stillOwed: toMoney(owed - offset),
  };
}

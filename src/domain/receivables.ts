// Receivables (receivables spec, design D1–D4): the fixed order of debts,
// how a receipt is split over them (0.2 #19), how prepayments and negative
// periods settle later debts (0.2 #82), overdue status by Vietnamese day,
// VAT of a sale delivery (0.2 #84) and how a deposit is set off when a
// contract is settled (0.2 #40, #81). Pure functions: the database layer
// reads the inputs and stores the allocations they return.
import { addDays, daysBetween, type BusinessDate } from "./business-date";
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

/** Days ahead counted by "Đến hạn trong 7 ngày" (spec receivables). */
export const DUE_SOON_DAYS = 7;

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

export interface ManualPart {
  debtKey: string;
  amount: Money;
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
  if (input.amount <= 0)
    throw new ReceivableRuleError(RECEIVABLE_MESSAGES.amount);
  const left = new Map(input.openDebts.map((debt) => [debt.key, debt]));
  const remaining = new Map(
    input.openDebts.map((debt) => [debt.key, debt.remaining as number]),
  );
  const allocations: Allocation[] = [];
  let money: number = input.amount;
  const manual = input.manual ?? [];
  const manualTotal = manual.reduce((sum, part) => sum + part.amount, 0);
  if (manualTotal > input.amount) {
    throw new ReceivableRuleError(
      RECEIVABLE_MESSAGES.manualTooMuch(input.amount),
    );
  }
  for (const part of manual) {
    if (part.amount <= 0)
      throw new ReceivableRuleError(RECEIVABLE_MESSAGES.amount);
    const debt = left.get(part.debtKey);
    const owed = remaining.get(part.debtKey);
    if (!debt || owed === undefined) {
      throw new ReceivableRuleError(RECEIVABLE_MESSAGES.unknownDebt);
    }
    if (part.amount > owed) {
      const seen = input.seen?.get(part.debtKey);
      const raced = seen !== undefined && seen >= part.amount;
      throw new ReceivableRuleError(
        RECEIVABLE_MESSAGES.overDebt(debt.label, toMoney(raced ? 0 : owed)),
        raced ? 409 : 422,
      );
    }
    remaining.set(part.debtKey, owed - part.amount);
    money -= part.amount;
    allocations.push({
      debtKey: part.debtKey,
      amount: part.amount,
      mode: "MANUAL",
    });
  }
  for (const debt of orderDebts(input.openDebts)) {
    if (money <= 0) break;
    const owed = remaining.get(debt.key) ?? 0;
    if (owed <= 0) continue;
    const take = Math.min(owed, money);
    remaining.set(debt.key, owed - take);
    money -= take;
    allocations.push({
      debtKey: debt.key,
      amount: toMoney(take),
      mode: "AUTO",
    });
  }
  return { allocations, unapplied: toMoney(money) };
}

/** Money that can still settle debts: a receipt's surplus or a credit. */
export interface CreditSource {
  key: string;
  /** Received date of the receipt, or the period end of a credit. */
  date: BusinessDate;
  code: string;
  available: Money;
}

export interface CreditAllocation {
  sourceKey: string;
  debtKey: string;
  amount: Money;
}

/** Older sources first: date, then code. */
export function orderSources<T extends Pick<CreditSource, "date" | "code">>(
  sources: readonly T[],
): T[] {
  return [...sources].sort(
    (a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code),
  );
}

/** Settles open debts in the fixed order from older sources first (0.2 #82). */
export function applyCredits(input: {
  credits: readonly CreditSource[];
  openDebts: readonly OpenDebt[];
}): CreditAllocation[] {
  const debts = orderDebts(input.openDebts).map((debt) => ({
    key: debt.key,
    owed: debt.remaining as number,
  }));
  const result: CreditAllocation[] = [];
  let index = 0;
  for (const source of orderSources(input.credits)) {
    let available: number = source.available;
    while (available > 0 && index < debts.length) {
      const debt = debts[index];
      if (!debt) break;
      if (debt.owed <= 0) {
        index += 1;
        continue;
      }
      const take = Math.min(debt.owed, available);
      debt.owed -= take;
      available -= take;
      result.push({
        sourceKey: source.key,
        debtKey: debt.key,
        amount: toMoney(take),
      });
      if (debt.owed <= 0) index += 1;
    }
  }
  return result;
}

export type DebtStatusKind =
  "PAID" | "OVERDUE" | "DUE_TODAY" | "DUE_TOMORROW" | "NOT_DUE";

export interface DebtStatus {
  kind: DebtStatusKind;
  /** Days overdue; 0 unless OVERDUE. */
  days: number;
  label: string;
}

/** Status of one debt on `today` (Vietnamese day, spec receivables). */
export function debtStatus(
  remaining: number,
  dueDate: BusinessDate,
  today: BusinessDate,
): DebtStatus {
  if (remaining <= 0) return { kind: "PAID", days: 0, label: "Đã thu đủ" };
  const days = daysBetween(dueDate, today);
  if (days > 0) {
    return { kind: "OVERDUE", days, label: `Quá hạn ${days} ngày` };
  }
  if (days === 0) return { kind: "DUE_TODAY", days: 0, label: "Hạn hôm nay" };
  if (days === -1) return { kind: "DUE_TOMORROW", days: 0, label: "Hạn mai" };
  return { kind: "NOT_DUE", days: 0, label: "Chưa đến hạn" };
}

export interface Overdue {
  amount: Money;
  /** Days of the overdue debt with the earliest due date. */
  days: number;
}

/** Overdue debt of a customer: what is left past its due date. */
export function overdueOf(
  debts: readonly Pick<OpenDebt, "remaining" | "dueDate">[],
  today: BusinessDate,
): Overdue {
  let amount = 0;
  let earliest: BusinessDate | null = null;
  for (const debt of debts) {
    if (debt.remaining <= 0 || debt.dueDate >= today) continue;
    amount += debt.remaining;
    if (earliest === null || debt.dueDate < earliest) earliest = debt.dueDate;
  }
  return {
    amount: toMoney(amount),
    days: earliest === null ? 0 : daysBetween(earliest, today),
  };
}

/** Debts due from today to today + 7 (the D14 tile). */
export function dueSoonOf(
  debts: readonly Pick<OpenDebt, "remaining" | "dueDate">[],
  today: BusinessDate,
): Money {
  const last = addDays(today, DUE_SOON_DAYS);
  return toMoney(
    debts
      .filter(
        (debt) =>
          debt.remaining > 0 && debt.dueDate >= today && debt.dueDate <= last,
      )
      .reduce((sum, debt) => sum + debt.remaining, 0),
  );
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

export type CustomerStatusKind =
  "OVERDUE" | "DUE_SOON" | "NOT_DUE" | "PREPAID" | "CLEAR";

export interface CustomerStatus {
  kind: CustomerStatusKind;
  label: string;
}

/** The "Tình hình" of a customer row on D14. */
export function customerStatus(input: {
  debts: readonly Pick<OpenDebt, "remaining" | "dueDate">[];
  prepaid: Money;
  today: BusinessDate;
}): CustomerStatus {
  const overdue = overdueOf(input.debts, input.today);
  if (overdue.amount > 0) {
    return { kind: "OVERDUE", label: `Quá hạn ${overdue.days} ngày` };
  }
  const open = input.debts.filter((debt) => debt.remaining > 0);
  const last = addDays(input.today, DUE_SOON_DAYS);
  const soon = open
    .map((debt) => debt.dueDate)
    .filter((due) => due <= last)
    .sort()[0];
  if (soon) {
    const [, month, day] = soon.split("-");
    return { kind: "DUE_SOON", label: `Hạn ${day}/${month}` };
  }
  if (open.length > 0) return { kind: "NOT_DUE", label: "Chưa đến hạn" };
  if (input.prepaid > 0) return { kind: "PREPAID", label: "Trả trước" };
  return { kind: "CLEAR", label: "Hết nợ" };
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

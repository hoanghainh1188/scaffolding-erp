// The core shared by receivables and payables (payables design D1): split a
// payment over debts already in their fixed order (named parts first, then
// oldest first), settle debts from credit sources (a prepayment, an
// advance), and the status of a debt and of its holder by Vietnamese day.
// Pure and generic: each side brings its own order, messages and errors, so
// receivables keep their exact behaviour.
import { addDays, daysBetween, type BusinessDate } from "./business-date";
import { toMoney, type Money } from "./money";

/** Days ahead counted by "Đến hạn trong 7 ngày" (D14, D14c). */
export const DUE_SOON_DAYS = 7;

/** A debt with what is left of it. */
export interface OpenItem {
  key: string;
  /** What is still owed: total minus live allocations, never below 0. */
  remaining: Money;
  /** For messages: "PX-2026-041", "PN-2026-090". */
  label: string;
}

export type OrderedAllocationMode = "AUTO" | "MANUAL";

export interface OrderedAllocation {
  debtKey: string;
  amount: Money;
  mode: OrderedAllocationMode;
}

export interface ManualPart {
  debtKey: string;
  amount: Money;
}

export interface OrderedAllocationResult {
  allocations: OrderedAllocation[];
  /** Left over after every open debt: a prepayment or an advance. */
  unapplied: Money;
}

export interface AllocationMessages {
  amount: string;
  unknownDebt: string;
  manualTooMuch: (amount: Money) => string;
  overDebt: (label: string, remaining: Money) => string;
}

/** Builds the error of a broken rule: 422 for the request, 409 for a race. */
export type AllocationFail = (message: string, status: 409 | 422) => Error;

/**
 * Splits a payment: the named parts first, then the rest over `debts`
 * (already in their fixed order); what is left is unapplied. `debts` holds
 * every debt of the holder, settled ones with 0 left. A named part larger
 * than what is left fails: 422 when the debt never owed that much, 409 when
 * another payment took it meanwhile (`seen`).
 */
export function allocateOrdered<D extends OpenItem>(input: {
  amount: Money;
  debts: readonly D[];
  manual?: readonly ManualPart[];
  /** What the form showed as remaining, to tell a race from a mistake. */
  seen?: ReadonlyMap<string, Money>;
  messages: AllocationMessages;
  fail: AllocationFail;
}): OrderedAllocationResult {
  const { messages, fail } = input;
  if (input.amount <= 0) throw fail(messages.amount, 422);
  const left = new Map(input.debts.map((debt) => [debt.key, debt]));
  const remaining = new Map(
    input.debts.map((debt) => [debt.key, debt.remaining as number]),
  );
  const allocations: OrderedAllocation[] = [];
  let money: number = input.amount;
  const manual = input.manual ?? [];
  const manualTotal = manual.reduce((sum, part) => sum + part.amount, 0);
  if (manualTotal > input.amount) {
    throw fail(messages.manualTooMuch(input.amount), 422);
  }
  for (const part of manual) {
    if (part.amount <= 0) throw fail(messages.amount, 422);
    const debt = left.get(part.debtKey);
    const owed = remaining.get(part.debtKey);
    if (!debt || owed === undefined) throw fail(messages.unknownDebt, 422);
    if (part.amount > owed) {
      const seen = input.seen?.get(part.debtKey);
      const raced = seen !== undefined && seen >= part.amount;
      throw fail(
        messages.overDebt(debt.label, toMoney(raced ? 0 : owed)),
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
  for (const debt of input.debts) {
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

/** Money that can still settle debts: a payment's surplus or a credit. */
export interface CreditSource {
  key: string;
  /** Date of the payment, or the period end of a credit. */
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

/** Settles `debts` (already in their fixed order) from older sources first. */
export function applyCreditsOrdered(input: {
  credits: readonly CreditSource[];
  debts: readonly Pick<OpenItem, "key" | "remaining">[];
}): CreditAllocation[] {
  const debts = input.debts.map((debt) => ({
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

export type DueStatusKind =
  "PAID" | "OVERDUE" | "DUE_TODAY" | "DUE_TOMORROW" | "NOT_DUE";

export interface DueStatus {
  kind: DueStatusKind;
  /** Days overdue; 0 unless OVERDUE. */
  days: number;
  label: string;
}

/** Status of one debt on `today` (Vietnamese day). */
export function dueStatus(
  remaining: number,
  dueDate: BusinessDate,
  today: BusinessDate,
  paidLabel: string,
): DueStatus {
  if (remaining <= 0) return { kind: "PAID", days: 0, label: paidLabel };
  const days = daysBetween(dueDate, today);
  if (days > 0) {
    return { kind: "OVERDUE", days, label: `Quá hạn ${days} ngày` };
  }
  if (days === 0) return { kind: "DUE_TODAY", days: 0, label: "Hạn hôm nay" };
  if (days === -1) return { kind: "DUE_TOMORROW", days: 0, label: "Hạn mai" };
  return { kind: "NOT_DUE", days: 0, label: "Chưa đến hạn" };
}

type Dated = Pick<OpenItem, "remaining"> & { dueDate: BusinessDate };

export interface Overdue {
  amount: Money;
  /** Days of the overdue debt with the earliest due date. */
  days: number;
}

/** Overdue debt of a holder: what is left past its due date. */
export function overdueOf(
  debts: readonly Dated[],
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

/** Debts due from today to today + 7 (the "Đến hạn trong 7 ngày" tile). */
export function dueSoonOf(debts: readonly Dated[], today: BusinessDate): Money {
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

export type HolderStatusKind =
  "OVERDUE" | "DUE_SOON" | "NOT_DUE" | "PREPAID" | "CLEAR";

export interface HolderStatus {
  kind: HolderStatusKind;
  label: string;
}

/**
 * The "Tình hình" of a customer (D14) or a seller (D14c, 0.2 số 104): overdue,
 * else the earliest due date within 7 days, else not due, else only credit
 * ("Trả trước" / "Đã ứng trước"), else clear.
 */
export function holderStatus(input: {
  debts: readonly Dated[];
  credit: Money;
  today: BusinessDate;
  creditLabel: string;
}): HolderStatus {
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
  if (input.credit > 0) return { kind: "PREPAID", label: input.creditLabel };
  return { kind: "CLEAR", label: "Hết nợ" };
}

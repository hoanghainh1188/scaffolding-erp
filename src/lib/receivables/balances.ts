// What each customer still owes (receivables design D2, D3, D7): the debts
// of debts.ts minus the live allocations. An allocation is live unless its
// receipt was cancelled; credits from negative periods are always live.
// The prepayment is never stored: it is what live payment receipts and
// credits have not given to a debt yet.
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import {
  billingPeriod,
  contract,
  customer,
  receipt,
  receiptAllocation,
  receiptCancellation,
  user,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { toMoney, type Money } from "@/domain/money";
import {
  customerStatus,
  debtKey,
  debtStatus,
  dueSoonOf,
  overdueOf,
  type AllocationMode,
  type CreditSource,
  type CustomerStatus,
  type DebtStatus,
  type OpenDebt,
  type Overdue,
  type PaymentMethod,
  type ReceiptKind,
} from "@/domain/receivables";
import { toSearchText } from "@/domain/search-text";

import {
  readDebts,
  type CreditPeriod,
  type Debt,
  type DebtScope,
  type Reader,
} from "./debts";

export interface ReceiptRow {
  id: string;
  code: string;
  customerId: string;
  kind: ReceiptKind;
  contractId: string | null;
  contractCode: string | null;
  amount: Money;
  method: PaymentMethod;
  receivedDate: BusinessDate;
  note: string | null;
  createdByName: string;
  createdAt: Date;
  cancelled: {
    reason: string;
    byName: string;
    at: Date;
  } | null;
}

export interface AllocationRow {
  id: string;
  receiptId: string | null;
  creditPeriodId: string | null;
  debtKey: string;
  amount: Money;
  mode: AllocationMode;
  settlementId: string | null;
  live: boolean;
}

export interface DebtView extends Debt {
  paid: Money;
  remaining: Money;
  status: DebtStatus;
}

export interface DepositView {
  contractId: string;
  received: Money;
  /** Live deposit receipts, oldest first. */
  receipts: ReceiptRow[];
}

export interface CustomerLedger {
  customerId: string;
  debts: DebtView[];
  /** Sources that can still settle a debt (payments and negative periods). */
  credits: CreditSource[];
  prepaid: Money;
  owed: Money;
  overdue: Overdue;
  receipts: ReceiptRow[];
  allocations: AllocationRow[];
  deposits: Map<string, DepositView>;
}

function allocationDebtKey(row: {
  billingPeriodId: string | null;
  deliveryNoteId: string | null;
  compensationNoteId: string | null;
  buyBackNoteId: string | null;
}): string {
  if (row.billingPeriodId) return debtKey("BILLING", row.billingPeriodId);
  if (row.deliveryNoteId) return debtKey("SALE", row.deliveryNoteId);
  if (row.compensationNoteId) {
    return debtKey("COMPENSATION", row.compensationNoteId);
  }
  return debtKey("BUY_BACK", row.buyBackNoteId ?? "");
}

const cancelUser = sql<string>`(select name from "user" where id = ${receiptCancellation.cancelledBy})`;

/** Receipts of the customers, newest first, with their cancellation. */
export async function readReceipts(
  db: Reader,
  customerIds?: readonly string[],
): Promise<ReceiptRow[]> {
  if (customerIds?.length === 0) return [];
  const rows = await db
    .select({
      id: receipt.id,
      code: receipt.code,
      customerId: receipt.customerId,
      kind: receipt.kind,
      contractId: receipt.contractId,
      contractCode: contract.code,
      amount: receipt.amount,
      method: receipt.method,
      receivedDate: receipt.receivedDate,
      note: receipt.note,
      createdByName: user.name,
      createdAt: receipt.createdAt,
      cancelReason: receiptCancellation.reason,
      cancelledAt: receiptCancellation.cancelledAt,
      cancelledBy: cancelUser,
    })
    .from(receipt)
    .innerJoin(user, eq(user.id, receipt.createdBy))
    .leftJoin(contract, eq(contract.id, receipt.contractId))
    .leftJoin(
      receiptCancellation,
      eq(receiptCancellation.receiptId, receipt.id),
    )
    .where(
      customerIds ? inArray(receipt.customerId, [...customerIds]) : undefined,
    )
    .orderBy(desc(receipt.receivedDate), desc(receipt.code));
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    customerId: row.customerId,
    kind: row.kind as ReceiptKind,
    contractId: row.contractId,
    contractCode: row.contractCode,
    amount: toMoney(row.amount),
    method: row.method as PaymentMethod,
    receivedDate: row.receivedDate as BusinessDate,
    note: row.note,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    cancelled:
      row.cancelReason !== null && row.cancelledAt !== null
        ? {
            reason: row.cancelReason,
            byName: row.cancelledBy,
            at: row.cancelledAt,
          }
        : null,
  }));
}

/** Allocations whose source belongs to the customers. */
export async function readAllocations(
  db: Reader,
  customerIds?: readonly string[],
): Promise<(AllocationRow & { customerId: string })[]> {
  if (customerIds?.length === 0) return [];
  const owner = sql<string>`coalesce(${receipt.customerId}, ${contract.customerId})`;
  const rows = await db
    .select({
      id: receiptAllocation.id,
      receiptId: receiptAllocation.receiptId,
      creditPeriodId: receiptAllocation.creditPeriodId,
      billingPeriodId: receiptAllocation.billingPeriodId,
      deliveryNoteId: receiptAllocation.deliveryNoteId,
      compensationNoteId: receiptAllocation.compensationNoteId,
      buyBackNoteId: receiptAllocation.buyBackNoteId,
      amount: receiptAllocation.amount,
      mode: receiptAllocation.mode,
      settlementId: receiptAllocation.settlementId,
      cancelled: receiptCancellation.receiptId,
      customerId: owner,
    })
    .from(receiptAllocation)
    .leftJoin(receipt, eq(receipt.id, receiptAllocation.receiptId))
    .leftJoin(
      receiptCancellation,
      eq(receiptCancellation.receiptId, receiptAllocation.receiptId),
    )
    .leftJoin(
      billingPeriod,
      eq(billingPeriod.id, receiptAllocation.creditPeriodId),
    )
    .leftJoin(contract, eq(contract.id, billingPeriod.contractId))
    .where(
      customerIds
        ? or(
            inArray(receipt.customerId, [...customerIds]),
            and(
              isNull(receiptAllocation.receiptId),
              inArray(contract.customerId, [...customerIds]),
            ),
          )
        : undefined,
    )
    .orderBy(receiptAllocation.createdAt);
  return rows.map((row) => ({
    id: row.id,
    receiptId: row.receiptId,
    creditPeriodId: row.creditPeriodId,
    debtKey: allocationDebtKey(row),
    amount: toMoney(row.amount),
    mode: row.mode as AllocationMode,
    settlementId: row.settlementId,
    live: row.cancelled === null,
    customerId: row.customerId,
  }));
}

/** Debt of the domain with what is left: for allocate / applyCredits. */
export const openDebtOf = (debt: DebtView): OpenDebt => ({
  key: debt.key,
  kind: debt.kind,
  contractCode: debt.contractCode,
  documentCode: debt.documentCode,
  issuedDate: debt.issuedDate,
  dueDate: debt.dueDate,
  remaining: debt.remaining,
  label: debt.label,
});

function groupBy<T>(rows: readonly T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    map.set(k, [...(map.get(k) ?? []), row]);
  }
  return map;
}

function buildLedger(
  customerId: string,
  debts: readonly Debt[],
  credits: readonly CreditPeriod[],
  receipts: readonly ReceiptRow[],
  allocations: readonly AllocationRow[],
  today: BusinessDate,
): CustomerLedger {
  const live = allocations.filter((row) => row.live);
  const paidOf = new Map<string, number>();
  const usedOf = new Map<string, number>();
  for (const row of live) {
    paidOf.set(row.debtKey, (paidOf.get(row.debtKey) ?? 0) + row.amount);
    const source = row.receiptId ?? `credit:${row.creditPeriodId ?? ""}`;
    usedOf.set(source, (usedOf.get(source) ?? 0) + row.amount);
  }
  const views: DebtView[] = debts.map((debt) => {
    const paid = toMoney(paidOf.get(debt.key) ?? 0);
    const remaining = toMoney(Math.max(debt.total - paid, 0));
    return {
      ...debt,
      paid,
      remaining,
      status: debtStatus(remaining, debt.dueDate, today),
    };
  });
  const sources: CreditSource[] = [];
  for (const row of receipts) {
    if (row.kind !== "PAYMENT" || row.cancelled) continue;
    const available = row.amount - (usedOf.get(row.id) ?? 0);
    if (available > 0) {
      sources.push({
        key: `receipt:${row.id}`,
        date: row.receivedDate,
        code: row.code,
        available: toMoney(available),
      });
    }
  }
  for (const credit of credits) {
    const available = credit.amount - (usedOf.get(`credit:${credit.id}`) ?? 0);
    if (available > 0) {
      sources.push({
        key: `credit:${credit.id}`,
        date: credit.date,
        code: `${credit.contractCode} ${credit.label}`,
        available: toMoney(available),
      });
    }
  }
  const deposits = new Map<string, DepositView>();
  for (const row of [...receipts].reverse()) {
    if (row.kind !== "DEPOSIT" || row.cancelled || !row.contractId) continue;
    const view = deposits.get(row.contractId) ?? {
      contractId: row.contractId,
      received: toMoney(0),
      receipts: [],
    };
    deposits.set(row.contractId, {
      ...view,
      received: toMoney(view.received + row.amount),
      receipts: [...view.receipts, row],
    });
  }
  return {
    customerId,
    debts: views,
    credits: sources,
    prepaid: toMoney(sources.reduce((sum, row) => sum + row.available, 0)),
    owed: toMoney(views.reduce((sum, row) => sum + row.remaining, 0)),
    overdue: overdueOf(views, today),
    receipts: [...receipts],
    allocations: [...allocations],
    deposits,
  };
}

/** Ledgers of the customers in scope (all customers with money when none). */
export async function readLedgers(
  db: Reader,
  today: BusinessDate,
  scope: Pick<DebtScope, "customerIds"> = {},
): Promise<Map<string, CustomerLedger>> {
  const [book, receipts, allocations] = await Promise.all([
    readDebts(db, scope),
    readReceipts(db, scope.customerIds),
    readAllocations(db, scope.customerIds),
  ]);
  const debtsBy = groupBy(book.debts, (row) => row.customerId);
  const creditsBy = groupBy(book.credits, (row) => row.customerId);
  const receiptsBy = groupBy(receipts, (row) => row.customerId);
  const allocationsBy = groupBy(allocations, (row) => row.customerId);
  const ids = new Set([
    ...(scope.customerIds ?? []),
    ...debtsBy.keys(),
    ...creditsBy.keys(),
    ...receiptsBy.keys(),
  ]);
  const result = new Map<string, CustomerLedger>();
  for (const id of ids) {
    result.set(
      id,
      buildLedger(
        id,
        debtsBy.get(id) ?? [],
        creditsBy.get(id) ?? [],
        receiptsBy.get(id) ?? [],
        allocationsBy.get(id) ?? [],
        today,
      ),
    );
  }
  return result;
}

/** The ledger of one customer (empty when it has no money yet). */
export async function readLedger(
  db: Reader,
  customerId: string,
  today: BusinessDate,
): Promise<CustomerLedger> {
  const ledgers = await readLedgers(db, today, { customerIds: [customerId] });
  return (
    ledgers.get(customerId) ?? buildLedger(customerId, [], [], [], [], today)
  );
}

// ----------------------------------------------------------------- D14 list

export const RECEIVABLE_FILTERS = [
  "owing",
  "overdue",
  "prepaid",
  "all",
] as const;
export type ReceivableFilter = (typeof RECEIVABLE_FILTERS)[number];

export const RECEIVABLE_PAGE_SIZE = 50;

export interface CustomerBalance {
  id: string;
  code: string;
  name: string;
  paymentTermsDays: number;
  contractCount: number;
  /** What is left, split like the D14 columns. */
  rentAndFreight: Money;
  sale: Money;
  compensationAndBuyBack: Money;
  owed: Money;
  overdue: Overdue;
  dueSoon: Money;
  prepaid: Money;
  status: CustomerStatus;
}

export interface BalanceTotals {
  owed: Money;
  owingCount: number;
  overdue: Money;
  overdueCount: number;
  longestOverdueDays: number;
  dueSoon: Money;
  dueSoonNames: string[];
  prepaid: Money;
  prepaidNames: string[];
}

export interface BalancePage {
  totals: BalanceTotals;
  counts: Record<ReceivableFilter, number>;
  rows: CustomerBalance[];
  page: number;
  pageCount: number;
  /** Every row of the filter and search, for the Excel export. */
  all: CustomerBalance[];
  ledgers: Map<string, CustomerLedger>;
}

export interface BalanceQuery {
  filter: ReceivableFilter;
  q?: string;
  page?: number;
}

const sumBy = (rows: readonly DebtView[], kinds: readonly string[]) =>
  toMoney(
    rows
      .filter((row) => kinds.includes(row.kind))
      .reduce((sum, row) => sum + row.remaining, 0),
  );

function balanceOf(
  ledger: CustomerLedger,
  info: { code: string; name: string; paymentTermsDays: number },
  today: BusinessDate,
): CustomerBalance {
  return {
    id: ledger.customerId,
    ...info,
    contractCount: new Set(ledger.debts.map((row) => row.contractId)).size,
    rentAndFreight: sumBy(ledger.debts, ["BILLING"]),
    sale: sumBy(ledger.debts, ["SALE"]),
    compensationAndBuyBack: sumBy(ledger.debts, ["COMPENSATION", "BUY_BACK"]),
    owed: ledger.owed,
    overdue: ledger.overdue,
    dueSoon: dueSoonOf(ledger.debts, today),
    prepaid: ledger.prepaid,
    status: customerStatus({
      debts: ledger.debts,
      prepaid: ledger.prepaid,
      today,
    }),
  };
}

const matches = (filter: ReceivableFilter, row: CustomerBalance) => {
  if (filter === "owing") return row.owed > 0;
  if (filter === "overdue") return row.overdue.amount > 0;
  if (filter === "prepaid") return row.prepaid > 0;
  return true;
};

/** D14: totals, counts, one page of customers, and every filtered row. */
export async function customerBalances(
  db: Reader,
  today: BusinessDate,
  query: BalanceQuery,
): Promise<BalancePage> {
  const ledgers = await readLedgers(db, today);
  const ids = [...ledgers.keys()];
  const infos = ids.length
    ? await db
        .select({
          id: customer.id,
          code: customer.code,
          name: customer.name,
          paymentTermsDays: customer.paymentTermsDays,
          searchText: customer.searchText,
        })
        .from(customer)
    : [];
  const infoBy = new Map(infos.map((row) => [row.id, row]));
  const balances: (CustomerBalance & { searchText: string })[] = [];
  for (const [id, ledger] of ledgers) {
    const info = infoBy.get(id);
    if (!info) continue;
    balances.push({
      ...balanceOf(ledger, info, today),
      searchText: info.searchText,
    });
  }
  const owing = balances.filter((row) => row.owed > 0);
  const overdue = balances.filter((row) => row.overdue.amount > 0);
  const soon = balances.filter((row) => row.dueSoon > 0);
  const prepaid = balances.filter((row) => row.prepaid > 0);
  const total = (
    rows: typeof balances,
    pick: (row: CustomerBalance) => number,
  ) => toMoney(rows.reduce((sum, row) => sum + pick(row), 0));
  const totals: BalanceTotals = {
    owed: total(owing, (row) => row.owed),
    owingCount: owing.length,
    overdue: total(overdue, (row) => row.overdue.amount),
    overdueCount: overdue.length,
    longestOverdueDays: Math.max(0, ...overdue.map((row) => row.overdue.days)),
    dueSoon: total(soon, (row) => row.dueSoon),
    dueSoonNames: soon.map((row) => row.name),
    prepaid: total(prepaid, (row) => row.prepaid),
    prepaidNames: prepaid.map((row) => row.name),
  };
  const counts: Record<ReceivableFilter, number> = {
    owing: owing.length,
    overdue: overdue.length,
    prepaid: prepaid.length,
    all: balances.length,
  };
  const term = toSearchText(query.q);
  const all = balances
    .filter((row) => matches(query.filter, row))
    .filter((row) => !term || row.searchText.includes(term))
    .sort(
      (a, b) =>
        b.overdue.amount - a.overdue.amount ||
        b.owed - a.owed ||
        b.prepaid - a.prepaid ||
        a.name.localeCompare(b.name, "vi"),
    )
    .map((row): CustomerBalance => {
      const { searchText, ...rest } = row;
      void searchText;
      return rest;
    });
  const pageCount = Math.max(1, Math.ceil(all.length / RECEIVABLE_PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
  return {
    totals,
    counts,
    rows: all.slice(
      (page - 1) * RECEIVABLE_PAGE_SIZE,
      page * RECEIVABLE_PAGE_SIZE,
    ),
    page,
    pageCount,
    all,
    ledgers,
  };
}

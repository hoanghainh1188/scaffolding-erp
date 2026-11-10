// What each seller is still owed (payables design D2, D3, D8): the debts of
// debts.ts minus the live allocations. An allocation is live unless its
// payment was cancelled. The advance is never stored: it is what live
// payments have not given to a receipt yet (0.2 số 100).
import { desc, eq, inArray, sql } from "drizzle-orm";

import {
  supplier,
  supplierPayment,
  supplierPaymentAllocation,
  supplierPaymentCancellation,
  user,
} from "@/db/schema";
import {
  overdueOf,
  type CreditSource,
  type DueStatus,
  type HolderStatus,
  type Overdue,
  dueSoonOf,
} from "@/domain/allocation";
import type { BusinessDate } from "@/domain/business-date";
import { toMoney, type Money } from "@/domain/money";
import {
  payableStatus,
  supplierStatus,
  type OpenPayable,
  type PaymentKind,
} from "@/domain/payables";
import type { PaymentMethod } from "@/domain/receivables";
import { toSearchText } from "@/domain/search-text";

import { readPayables, type Payable, type Reader } from "./debts";

export type AllocationMode = "AUTO" | "MANUAL" | "ADVANCE";

export interface PaymentRow {
  id: string;
  code: string;
  supplierId: string;
  kind: PaymentKind;
  amount: Money;
  method: PaymentMethod;
  paidDate: BusinessDate;
  note: string | null;
  createdByName: string;
  createdAt: Date;
  cancelled: { reason: string; byName: string; at: Date } | null;
}

export interface PaymentAllocationRow {
  id: string;
  paymentId: string;
  goodsReceiptId: string;
  amount: Money;
  mode: AllocationMode;
  createdAt: Date;
  live: boolean;
}

export interface PayableView extends Payable {
  paid: Money;
  remaining: Money;
  status: DueStatus;
}

export interface SupplierLedger {
  supplierId: string;
  payables: PayableView[];
  /** Live payments with money left: the advance, oldest first. */
  advances: CreditSource[];
  advance: Money;
  owed: Money;
  overdue: Overdue;
  payments: PaymentRow[];
  allocations: PaymentAllocationRow[];
}

const cancelUser = sql<string>`(select name from "user" where id = ${supplierPaymentCancellation.cancelledBy})`;

/** Payments of the sellers, newest first, with their cancellation. */
export async function readPayments(
  db: Reader,
  supplierIds?: readonly string[],
): Promise<PaymentRow[]> {
  if (supplierIds?.length === 0) return [];
  const rows = await db
    .select({
      id: supplierPayment.id,
      code: supplierPayment.code,
      supplierId: supplierPayment.supplierId,
      kind: supplierPayment.kind,
      amount: supplierPayment.amount,
      method: supplierPayment.method,
      paidDate: supplierPayment.paidDate,
      note: supplierPayment.note,
      createdByName: user.name,
      createdAt: supplierPayment.createdAt,
      cancelReason: supplierPaymentCancellation.reason,
      cancelledAt: supplierPaymentCancellation.cancelledAt,
      cancelledBy: cancelUser,
    })
    .from(supplierPayment)
    .innerJoin(user, eq(user.id, supplierPayment.createdBy))
    .leftJoin(
      supplierPaymentCancellation,
      eq(supplierPaymentCancellation.paymentId, supplierPayment.id),
    )
    .where(
      supplierIds
        ? inArray(supplierPayment.supplierId, [...supplierIds])
        : undefined,
    )
    .orderBy(desc(supplierPayment.paidDate), desc(supplierPayment.code));
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    supplierId: row.supplierId,
    kind: row.kind as PaymentKind,
    amount: toMoney(row.amount),
    method: row.method as PaymentMethod,
    paidDate: row.paidDate as BusinessDate,
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

/** Allocations whose payment belongs to the sellers, oldest first. */
export async function readPaymentAllocations(
  db: Reader,
  supplierIds?: readonly string[],
): Promise<(PaymentAllocationRow & { supplierId: string })[]> {
  if (supplierIds?.length === 0) return [];
  const rows = await db
    .select({
      id: supplierPaymentAllocation.id,
      paymentId: supplierPaymentAllocation.paymentId,
      goodsReceiptId: supplierPaymentAllocation.goodsReceiptId,
      amount: supplierPaymentAllocation.amount,
      mode: supplierPaymentAllocation.mode,
      createdAt: supplierPaymentAllocation.createdAt,
      cancelled: supplierPaymentCancellation.paymentId,
      supplierId: supplierPayment.supplierId,
    })
    .from(supplierPaymentAllocation)
    .innerJoin(
      supplierPayment,
      eq(supplierPayment.id, supplierPaymentAllocation.paymentId),
    )
    .leftJoin(
      supplierPaymentCancellation,
      eq(
        supplierPaymentCancellation.paymentId,
        supplierPaymentAllocation.paymentId,
      ),
    )
    .where(
      supplierIds
        ? inArray(supplierPayment.supplierId, [...supplierIds])
        : undefined,
    )
    .orderBy(supplierPaymentAllocation.createdAt);
  return rows.map((row) => ({
    id: row.id,
    paymentId: row.paymentId,
    goodsReceiptId: row.goodsReceiptId,
    amount: toMoney(row.amount),
    mode: row.mode as AllocationMode,
    createdAt: row.createdAt,
    live: row.cancelled === null,
    supplierId: row.supplierId,
  }));
}

/** Payable of the domain with what is left: for allocatePayment. */
export const openPayableOf = (view: PayableView): OpenPayable => ({
  key: view.key,
  code: view.code,
  label: view.label,
  issuedDate: view.issuedDate,
  dueDate: view.dueDate,
  remaining: view.remaining,
});

function groupBy<T>(rows: readonly T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    map.set(k, [...(map.get(k) ?? []), row]);
  }
  return map;
}

export function buildLedger(
  supplierId: string,
  payables: readonly Payable[],
  payments: readonly PaymentRow[],
  allocations: readonly PaymentAllocationRow[],
  today: BusinessDate,
): SupplierLedger {
  const live = allocations.filter((row) => row.live);
  const paidOf = new Map<string, number>();
  const usedOf = new Map<string, number>();
  for (const row of live) {
    paidOf.set(
      row.goodsReceiptId,
      (paidOf.get(row.goodsReceiptId) ?? 0) + row.amount,
    );
    usedOf.set(row.paymentId, (usedOf.get(row.paymentId) ?? 0) + row.amount);
  }
  const views: PayableView[] = payables.map((payable) => {
    const paid = toMoney(paidOf.get(payable.key) ?? 0);
    const remaining = toMoney(Math.max(payable.total - paid, 0));
    return {
      ...payable,
      paid,
      remaining,
      status: payableStatus(remaining, payable.dueDate, today),
    };
  });
  const advances: CreditSource[] = [];
  for (const row of payments) {
    if (row.cancelled) continue;
    const available = row.amount - (usedOf.get(row.id) ?? 0);
    if (available > 0) {
      advances.push({
        key: row.id,
        date: row.paidDate,
        code: row.code,
        available: toMoney(available),
      });
    }
  }
  return {
    supplierId,
    payables: views,
    advances,
    advance: toMoney(advances.reduce((sum, row) => sum + row.available, 0)),
    owed: toMoney(views.reduce((sum, row) => sum + row.remaining, 0)),
    overdue: overdueOf(views, today),
    payments: [...payments],
    allocations: [...allocations],
  };
}

/** Ledgers of the sellers in scope (every seller with money when none). */
export async function readLedgers(
  db: Reader,
  today: BusinessDate,
  supplierIds?: readonly string[],
): Promise<Map<string, SupplierLedger>> {
  const [payables, payments, allocations] = await Promise.all([
    readPayables(db, { supplierIds }),
    readPayments(db, supplierIds),
    readPaymentAllocations(db, supplierIds),
  ]);
  const payablesBy = groupBy(payables, (row) => row.supplierId);
  const paymentsBy = groupBy(payments, (row) => row.supplierId);
  const allocationsBy = groupBy(allocations, (row) => row.supplierId);
  const ids = new Set([
    ...(supplierIds ?? []),
    ...payablesBy.keys(),
    ...paymentsBy.keys(),
  ]);
  const result = new Map<string, SupplierLedger>();
  for (const id of ids) {
    result.set(
      id,
      buildLedger(
        id,
        payablesBy.get(id) ?? [],
        paymentsBy.get(id) ?? [],
        allocationsBy.get(id) ?? [],
        today,
      ),
    );
  }
  return result;
}

/** The ledger of one seller (empty when it has no money yet). */
export async function readLedger(
  db: Reader,
  supplierId: string,
  today: BusinessDate,
): Promise<SupplierLedger> {
  const ledgers = await readLedgers(db, today, [supplierId]);
  return ledgers.get(supplierId) ?? buildLedger(supplierId, [], [], [], today);
}

// --------------------------------------------------------------- D14c list

export const PAYABLE_FILTERS = ["owing", "overdue", "advance", "all"] as const;
export type PayableFilter = (typeof PAYABLE_FILTERS)[number];

export const PAYABLE_PAGE_SIZE = 50;

export interface SupplierInfo {
  id: string;
  code: string;
  name: string;
  kind: "COMPANY" | "PERSON";
  status: string;
  paymentTermsDays: number;
  idNumberLast4: string | null;
  bankAccountLast4: string | null;
  bankName: string | null;
  searchText: string;
}

export interface SupplierBalance {
  id: string;
  code: string;
  name: string;
  kind: "COMPANY" | "PERSON";
  paymentTermsDays: number;
  owed: Money;
  overdue: Overdue;
  dueSoon: Money;
  advance: Money;
  status: HolderStatus;
}

export interface PayableTotals {
  owed: Money;
  owingCount: number;
  overdue: Money;
  overdueCount: number;
  longestOverdueDays: number;
  dueSoon: Money;
  dueSoonNames: string[];
  advance: Money;
  advanceNames: string[];
}

export interface PayablePage {
  totals: PayableTotals;
  counts: Record<PayableFilter, number>;
  rows: SupplierBalance[];
  page: number;
  pageCount: number;
  /** Every row of the filter and search, for the Excel export. */
  all: SupplierBalance[];
  ledgers: Map<string, SupplierLedger>;
  infos: Map<string, SupplierInfo>;
}

export interface PayableQuery {
  filter: PayableFilter;
  q?: string;
  page?: number;
}

const matches = (filter: PayableFilter, row: SupplierBalance) => {
  if (filter === "owing") return row.owed > 0;
  if (filter === "overdue") return row.overdue.amount > 0;
  if (filter === "advance") return row.advance > 0;
  return true;
};

/** Every seller row the screens need, keyed by id. */
export async function readSupplierInfos(
  db: Reader,
): Promise<Map<string, SupplierInfo>> {
  const rows = await db
    .select({
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      kind: supplier.kind,
      status: supplier.status,
      paymentTermsDays: supplier.paymentTermsDays,
      idNumberLast4: supplier.idNumberLast4,
      bankAccountLast4: supplier.bankAccountLast4,
      bankName: supplier.bankName,
      searchText: supplier.searchText,
    })
    .from(supplier);
  return new Map(
    rows.map((row) => [
      row.id,
      { ...row, kind: row.kind as SupplierInfo["kind"] },
    ]),
  );
}

/** D14c: totals, counts, one page of sellers, and every filtered row. */
export async function supplierBalances(
  db: Reader,
  today: BusinessDate,
  query: PayableQuery,
): Promise<PayablePage> {
  const [ledgers, infos] = await Promise.all([
    readLedgers(db, today),
    readSupplierInfos(db),
  ]);
  const balances: (SupplierBalance & { searchText: string })[] = [];
  for (const info of infos.values()) {
    const ledger = ledgers.get(info.id);
    // "Tất cả": sellers in use, and stopped ones that have documents.
    if (!ledger && info.status !== "ACTIVE") continue;
    const book = ledger ?? buildLedger(info.id, [], [], [], today);
    balances.push({
      id: info.id,
      code: info.code,
      name: info.name,
      kind: info.kind,
      paymentTermsDays: info.paymentTermsDays,
      owed: book.owed,
      overdue: book.overdue,
      dueSoon: dueSoonOf(book.payables, today),
      advance: book.advance,
      status: supplierStatus({
        payables: book.payables,
        advance: book.advance,
        today,
      }),
      searchText: info.searchText,
    });
  }
  const owing = balances.filter((row) => row.owed > 0);
  const overdue = balances.filter((row) => row.overdue.amount > 0);
  const soon = balances.filter((row) => row.dueSoon > 0);
  const advance = balances.filter((row) => row.advance > 0);
  const total = (
    rows: typeof balances,
    pick: (row: SupplierBalance) => number,
  ) => toMoney(rows.reduce((sum, row) => sum + pick(row), 0));
  const totals: PayableTotals = {
    owed: total(owing, (row) => row.owed),
    owingCount: owing.length,
    overdue: total(overdue, (row) => row.overdue.amount),
    overdueCount: overdue.length,
    longestOverdueDays: Math.max(0, ...overdue.map((row) => row.overdue.days)),
    dueSoon: total(soon, (row) => row.dueSoon),
    dueSoonNames: soon.map((row) => row.name),
    advance: total(advance, (row) => row.advance),
    advanceNames: advance.map((row) => row.name),
  };
  const counts: Record<PayableFilter, number> = {
    owing: owing.length,
    overdue: overdue.length,
    advance: advance.length,
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
        a.name.localeCompare(b.name, "vi"),
    )
    .map((row): SupplierBalance => {
      const { searchText, ...rest } = row;
      void searchText;
      return rest;
    });
  const pageCount = Math.max(1, Math.ceil(all.length / PAYABLE_PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
  return {
    totals,
    counts,
    rows: all.slice((page - 1) * PAYABLE_PAGE_SIZE, page * PAYABLE_PAGE_SIZE),
    page,
    pageCount,
    all,
    ledgers,
    infos,
  };
}

// The debts of customers (receivables spec "Bốn loại khoản nợ", design D1),
// read in batches from the documents that own the money: closed billing
// periods, posted sale deliveries, approved compensation and buy-back notes.
// Nothing here is stored as a copy. A period with a negative total is a
// credit, not a debt: it settles later debts like a prepayment.
//
// VAT and the due date of a sale delivery come from the revision stored on
// the note when it was posted: the revision in force on the delivery day,
// which no later amendment can replace (0.2 #89, contract-amendments).
import { and, asc, eq, inArray, isNotNull, max, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  billingPeriod,
  buyBackNote,
  compensationNote,
  contract,
  contractRevision,
  deliveryNote,
  deliveryNoteLine,
  deliveryNotePick,
  site,
} from "@/db/schema";
import { addDays, type BusinessDate } from "@/domain/business-date";
import type { PricingUnit } from "@/domain/contract-lines";
import { deliveredSaleAmount } from "@/domain/delivery-note";
import { toMoney, type Money } from "@/domain/money";
import { debtKey, saleVat, type DebtKind } from "@/domain/receivables";
import { basisPointsOf } from "@/domain/rental-billing";
import { itemFacts, milliOf } from "@/lib/deliveries/records";

export type Reader = Pick<Database, "select">;

/** One debt with its parts; amounts include VAT. */
export interface Debt {
  key: string;
  kind: DebtKind;
  id: string;
  customerId: string;
  contractId: string;
  contractCode: string;
  siteName: string | null;
  /** Document code, or "YYYY-MM" of a period. */
  documentCode: string;
  /** "PX-2026-041", "Kỳ 10/2026". */
  label: string;
  /** Period end, delivery day or approval day. */
  issuedDate: BusinessDate;
  dueDate: BusinessDate;
  /** Rent + adjustments of a period. */
  rent: Money;
  freight: Money;
  sale: Money;
  compensation: Money;
  buyBack: Money;
  vat: Money;
  total: Money;
  /** Whether VAT applies at all ("không VAT" otherwise). */
  vatApplies: boolean;
}

/** A closed period whose total is below zero (0.2 #80): money owed back. */
export interface CreditPeriod {
  key: string;
  id: string;
  customerId: string;
  contractId: string;
  contractCode: string;
  label: string;
  date: BusinessDate;
  amount: Money;
}

export interface DebtScope {
  customerIds?: readonly string[];
  contractId?: string;
}

export interface DebtBook {
  debts: Debt[];
  credits: CreditPeriod[];
}

const ZERO = toMoney(0);

const periodLabel = (month: string) => {
  const [year, mm] = month.split("-");
  return `Kỳ ${mm}/${year}`;
};

function scopeOn(
  scope: DebtScope,
  contractIdColumn: typeof contract.id,
): SQL | undefined {
  const parts: SQL[] = [];
  if (scope.customerIds) {
    if (scope.customerIds.length === 0) return eq(contract.id, contract.id);
    parts.push(inArray(contract.customerId, [...scope.customerIds]));
  }
  if (scope.contractId) parts.push(eq(contractIdColumn, scope.contractId));
  return parts.length ? and(...parts) : undefined;
}

const empty = (scope: DebtScope) => scope.customerIds?.length === 0;

const contractColumns = {
  contractId: contract.id,
  contractCode: contract.code,
  customerId: contract.customerId,
  siteName: site.name,
};

async function readPeriods(db: Reader, scope: DebtScope): Promise<DebtBook> {
  const rows = await db
    .select({
      ...contractColumns,
      id: billingPeriod.id,
      month: billingPeriod.month,
      periodEnd: billingPeriod.periodEnd,
      rent: billingPeriod.rentAmount,
      adjustment: billingPeriod.adjustmentAmount,
      freight: billingPeriod.freightAmount,
      vat: billingPeriod.vatAmount,
      total: billingPeriod.totalAmount,
      dueDate: billingPeriod.dueDate,
      vatEnabled: contractRevision.vatEnabled,
    })
    .from(billingPeriod)
    .innerJoin(contract, eq(contract.id, billingPeriod.contractId))
    .innerJoin(
      contractRevision,
      eq(contractRevision.id, billingPeriod.revisionId),
    )
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(scopeOn(scope, contract.id))
    .orderBy(asc(billingPeriod.periodEnd));
  const debts: Debt[] = [];
  const credits: CreditPeriod[] = [];
  for (const row of rows) {
    const label = periodLabel(row.month.slice(0, 7));
    if (row.total < 0) {
      credits.push({
        key: debtKey("BILLING", row.id),
        id: row.id,
        customerId: row.customerId,
        contractId: row.contractId,
        contractCode: row.contractCode,
        label,
        date: row.periodEnd as BusinessDate,
        amount: toMoney(-row.total),
      });
      continue;
    }
    debts.push({
      key: debtKey("BILLING", row.id),
      kind: "BILLING",
      id: row.id,
      customerId: row.customerId,
      contractId: row.contractId,
      contractCode: row.contractCode,
      siteName: row.siteName,
      documentCode: row.month.slice(0, 7),
      label,
      issuedDate: row.periodEnd as BusinessDate,
      dueDate: row.dueDate as BusinessDate,
      rent: toMoney(row.rent + row.adjustment),
      freight: toMoney(row.freight),
      sale: ZERO,
      compensation: ZERO,
      buyBack: ZERO,
      vat: toMoney(row.vat),
      total: toMoney(row.total),
      vatApplies: row.vatEnabled || row.vat > 0,
    });
  }
  return { debts, credits };
}

async function readSales(db: Reader, scope: DebtScope): Promise<Debt[]> {
  const notes = await db
    .select({
      ...contractColumns,
      id: deliveryNote.id,
      code: deliveryNote.code,
      businessDate: deliveryNote.businessDate,
      companyTruck: deliveryNote.companyTruck,
      freightAmount: deliveryNote.freightAmount,
      vatEnabled: contractRevision.vatEnabled,
      vatRate: contractRevision.vatRate,
      paymentTermsDays: contractRevision.paymentTermsDays,
    })
    .from(deliveryNote)
    .innerJoin(contract, eq(contract.id, deliveryNote.contractId))
    .innerJoin(
      contractRevision,
      eq(contractRevision.id, deliveryNote.contractRevisionId),
    )
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(
      and(
        eq(deliveryNote.status, "POSTED"),
        eq(contract.type, "SALE"),
        scopeOn(scope, contract.id),
      ),
    )
    .orderBy(asc(deliveryNote.businessDate), asc(deliveryNote.code));
  if (notes.length === 0) return [];
  // One query of every priced pick of the notes above, joined rather than
  // listed by id, so the number of notes never hits the parameter limit.
  const saleNotes = and(
    eq(deliveryNote.status, "POSTED"),
    eq(contract.type, "SALE"),
    scopeOn(scope, contract.id),
    isNotNull(deliveryNoteLine.pricingUnit),
    isNotNull(deliveryNoteLine.unitPrice),
  );
  const picked = await db
    .select({
      lineId: deliveryNoteLine.id,
      noteId: deliveryNoteLine.noteId,
      itemId: deliveryNoteLine.itemId,
      pricingUnit: deliveryNoteLine.pricingUnit,
      unitPrice: deliveryNoteLine.unitPrice,
      quantity: deliveryNotePick.quantity,
      weighedKg: deliveryNotePick.weighedKg,
    })
    .from(deliveryNotePick)
    .innerJoin(
      deliveryNoteLine,
      eq(deliveryNoteLine.id, deliveryNotePick.lineId),
    )
    .innerJoin(deliveryNote, eq(deliveryNote.id, deliveryNoteLine.noteId))
    .innerJoin(contract, eq(contract.id, deliveryNote.contractId))
    .where(saleNotes);
  const facts = await itemFacts(db, [
    ...new Set(picked.map((row) => row.itemId)),
  ]);
  const saleByNote = new Map<string, number>();
  for (const pick of picked) {
    const amount = deliveredSaleAmount({
      pricingUnit: pick.pricingUnit as PricingUnit,
      unit: facts.get(pick.itemId)?.unit ?? "PIECE",
      quantityMilli: milliOf(pick.quantity),
      weighedMilli: pick.weighedKg === null ? null : milliOf(pick.weighedKg),
      unitPrice: toMoney(pick.unitPrice ?? 0),
    });
    saleByNote.set(pick.noteId, (saleByNote.get(pick.noteId) ?? 0) + amount);
  }
  return notes.map((note) => {
    const sale = toMoney(saleByNote.get(note.id) ?? 0);
    const freight = toMoney(
      note.companyTruck && note.freightAmount !== null ? note.freightAmount : 0,
    );
    const basisPoints = basisPointsOf(note.vatRate, note.vatEnabled);
    const vat = saleVat(sale, freight, basisPoints);
    const day = (note.businessDate ?? "") as BusinessDate;
    return {
      key: debtKey("SALE", note.id),
      kind: "SALE" as const,
      id: note.id,
      customerId: note.customerId,
      contractId: note.contractId,
      contractCode: note.contractCode,
      siteName: note.siteName,
      documentCode: note.code,
      label: note.code,
      issuedDate: day,
      dueDate: addDays(day, note.paymentTermsDays),
      rent: ZERO,
      freight,
      sale,
      compensation: ZERO,
      buyBack: ZERO,
      vat,
      total: toMoney(sale + freight + vat),
      vatApplies: basisPoints !== null,
    };
  });
}

async function readApproved(
  db: Reader,
  scope: DebtScope,
  kind: "COMPENSATION" | "BUY_BACK",
): Promise<Debt[]> {
  const table = kind === "COMPENSATION" ? compensationNote : buyBackNote;
  const rows = await db
    .select({
      ...contractColumns,
      id: table.id,
      code: table.code,
      amountDue: table.amountDue,
      approvedDate: table.approvedDate,
      dueDate: table.dueDate,
    })
    .from(table)
    .innerJoin(contract, eq(contract.id, table.contractId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(and(eq(table.status, "APPROVED"), scopeOn(scope, contract.id)))
    .orderBy(asc(table.approvedDate), asc(table.code));
  return rows.map((row) => {
    const amount = toMoney(row.amountDue ?? 0);
    return {
      key: debtKey(kind, row.id),
      kind,
      id: row.id,
      customerId: row.customerId,
      contractId: row.contractId,
      contractCode: row.contractCode,
      siteName: row.siteName,
      documentCode: row.code,
      label: row.code,
      issuedDate: (row.approvedDate ?? "") as BusinessDate,
      dueDate: (row.dueDate ?? "") as BusinessDate,
      rent: ZERO,
      freight: ZERO,
      sale: ZERO,
      compensation: kind === "COMPENSATION" ? amount : ZERO,
      buyBack: kind === "BUY_BACK" ? amount : ZERO,
      vat: ZERO,
      total: amount,
      vatApplies: false,
    };
  });
}

/** Every debt and credit in scope, a handful of queries whatever the size. */
export async function readDebts(
  db: Reader,
  scope: DebtScope = {},
): Promise<DebtBook> {
  if (empty(scope)) return { debts: [], credits: [] };
  const [periods, sales, compensations, buyBacks] = await Promise.all([
    readPeriods(db, scope),
    readSales(db, scope),
    readApproved(db, scope, "COMPENSATION"),
    readApproved(db, scope, "BUY_BACK"),
  ]);
  return {
    debts: [...periods.debts, ...sales, ...compensations, ...buyBacks],
    credits: periods.credits,
  };
}

/** The latest posted delivery day of a contract (0.2 #89), or null. */
export async function lastDeliveryDate(
  db: Reader,
  contractId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ day: max(deliveryNote.businessDate) })
    .from(deliveryNote)
    .where(
      and(
        eq(deliveryNote.contractId, contractId),
        eq(deliveryNote.status, "POSTED"),
      ),
    );
  return row?.day ?? null;
}

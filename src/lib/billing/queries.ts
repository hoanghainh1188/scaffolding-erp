// What D7, the printout and the Excel file read (rental-billing design D4,
// D8, D12): the rental contracts of a month with their amount and state,
// and the statement of one contract: computed from the ledger while the
// month is open, read back from the closed copy once it is closed.
import { and, asc, eq, inArray, or } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  billingAdjustment,
  billingPeriod,
  billingPeriodFreight,
  billingPeriodLine,
  buyBackNote,
  contract,
  customer,
  deliveryNote,
  site,
  siteTransfer,
  user,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { BUY_BACK_STATUS_LABELS, type BuyBackStatus } from "@/domain/buy-back";
import {
  DELIVERY_STATUS_LABELS,
  type DeliveryStatus,
} from "@/domain/delivery-note";
import { toMoney } from "@/domain/money";
import {
  basisPointsOf,
  hasContent,
  periodOf,
  termsOn,
  vatGroups,
  type Statement,
  type StatementLine,
} from "@/domain/rental-billing";
import { holidaysIn, type HolidayRange } from "@/domain/rental-holiday";
import type { EndKind } from "@/domain/rental-lots";
import {
  TRANSFER_STATUS_LABELS,
  type TransferStatus,
} from "@/domain/site-transfer";
import { readHolidays } from "@/lib/holidays/queries";

import {
  whyNotClosable,
  loadBillingSource,
  statementOf,
  type BillingSource,
} from "./compute";

type Reader = Pick<Database, "select">;

export interface ContractHead {
  id: string;
  code: string;
  status: string;
  customerName: string;
  customerTaxCode: string | null;
  customerAddress: string | null;
  siteName: string;
}

export interface PeriodContract extends ContractHead {
  totalAmount: number;
  closed: boolean;
}

export interface PeriodHoliday extends HolidayRange {
  days: number;
}

export interface PeriodList {
  month: string;
  from: BusinessDate;
  to: BusinessDate;
  holidays: PeriodHoliday[];
  contracts: PeriodContract[];
  closedCount: number;
}

export interface PendingDocument {
  code: string;
  label: string;
}

export interface ContractStatementView {
  contract: ContractHead;
  statement: Statement;
  holidays: PeriodHoliday[];
  closed: { at: Date; byName: string } | null;
  /** Why the period cannot be closed now; null when it can. */
  closeBlock: string | null;
  pending: PendingDocument[];
  /** Closed months of the contract, newest first ("2027-01"). */
  closedMonths: string[];
  /** Contract terms in force at the end of the period, for the header. */
  vatBasisPoints: number | null;
}

const headColumns = {
  id: contract.id,
  code: contract.code,
  status: contract.status,
  customerName: customer.name,
  customerTaxCode: customer.taxCode,
  customerAddress: customer.address,
  siteName: site.name,
};

/** Rental contracts that may have rent: running or finished. */
async function rentalHeads(
  tx: Reader,
  ids?: readonly string[],
): Promise<ContractHead[]> {
  const rows = await tx
    .select(headColumns)
    .from(contract)
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .innerJoin(site, eq(site.id, contract.siteId))
    .where(
      and(
        eq(contract.type, "RENTAL"),
        ids
          ? inArray(contract.id, [...ids])
          : inArray(contract.status, ["ACTIVE", "CLOSED"]),
      ),
    )
    .orderBy(asc(contract.code));
  return rows;
}

const periodHolidays = (
  month: string,
  holidays: readonly HolidayRange[],
): PeriodHoliday[] => {
  const { from, to } = periodOf(month);
  return holidaysIn(from, to, holidays);
};

/** The D7 list of a month. */
export async function periodList(
  db: Reader,
  month: string,
  today: BusinessDate,
): Promise<PeriodList> {
  const period = periodOf(month);
  const [heads, holidays, closedRows] = await Promise.all([
    rentalHeads(db),
    readHolidays(db),
    db
      .select({
        contractId: billingPeriod.contractId,
        total: billingPeriod.totalAmount,
      })
      .from(billingPeriod)
      .where(eq(billingPeriod.month, `${month}-01`)),
  ]);
  const closedTotals = new Map(
    closedRows.map((row) => [row.contractId, row.total]),
  );
  const contracts: PeriodContract[] = [];
  for (const head of heads) {
    const stored = closedTotals.get(head.id);
    if (stored !== undefined) {
      contracts.push({ ...head, totalAmount: stored, closed: true });
      continue;
    }
    const source = await loadBillingSource(db, head.id);
    if (source.terms.length === 0) continue;
    const statement = statementOf(source, month, today, holidays);
    if (!hasContent(statement)) continue;
    contracts.push({
      ...head,
      totalAmount: statement.totalAmount,
      closed: false,
    });
  }
  return {
    month,
    from: period.from,
    to: period.to,
    holidays: periodHolidays(month, holidays),
    contracts,
    closedCount: contracts.filter((entry) => entry.closed).length,
  };
}

/** Documents of the contract still waiting (D7 note, design D6). */
async function pendingDocuments(
  tx: Reader,
  contractId: string,
): Promise<PendingDocument[]> {
  const [notes, transfers, buyBacks] = await Promise.all([
    tx
      .select({ code: deliveryNote.code, status: deliveryNote.status })
      .from(deliveryNote)
      .where(
        and(
          eq(deliveryNote.contractId, contractId),
          inArray(deliveryNote.status, ["PLANNED", "PICKING"]),
        ),
      ),
    tx
      .select({ code: siteTransfer.code, status: siteTransfer.status })
      .from(siteTransfer)
      .where(
        and(
          or(
            eq(siteTransfer.fromContractId, contractId),
            eq(siteTransfer.toContractId, contractId),
          ),
          inArray(siteTransfer.status, ["DRAFT", "SENT"]),
        ),
      ),
    tx
      .select({ code: buyBackNote.code, status: buyBackNote.status })
      .from(buyBackNote)
      .where(
        and(
          eq(buyBackNote.contractId, contractId),
          eq(buyBackNote.status, "PENDING"),
        ),
      ),
  ]);
  return [
    ...notes.map((row) => ({
      code: row.code,
      label: DELIVERY_STATUS_LABELS[row.status as DeliveryStatus],
    })),
    ...transfers.map((row) => ({
      code: row.code,
      label: TRANSFER_STATUS_LABELS[row.status as TransferStatus],
    })),
    ...buyBacks.map((row) => ({
      code: row.code,
      label: BUY_BACK_STATUS_LABELS[row.status as BuyBackStatus],
    })),
  ].sort((a, b) => a.code.localeCompare(b.code));
}

const dateOrNull = (value: string | null) => value as BusinessDate | null;
const milliOf = (value: string | null) =>
  value === null ? 0 : Math.round(Number(value) * 1000);

/** A closed period read back from its copy (design D4). */
async function storedStatement(
  tx: Reader,
  month: string,
  periodId: string,
): Promise<{ statement: Statement; closed: { at: Date; byName: string } }> {
  const [head] = await tx
    .select({
      period: billingPeriod,
      byName: user.name,
    })
    .from(billingPeriod)
    .innerJoin(user, eq(user.id, billingPeriod.closedBy))
    .where(eq(billingPeriod.id, periodId));
  if (!head) throw new Error(`No billing period ${periodId}`);
  const [rows, freightRows] = await Promise.all([
    tx
      .select()
      .from(billingPeriodLine)
      .where(eq(billingPeriodLine.periodId, periodId))
      .orderBy(asc(billingPeriodLine.lineNo)),
    tx
      .select()
      .from(billingPeriodFreight)
      .where(eq(billingPeriodFreight.periodId, periodId))
      .orderBy(asc(billingPeriodFreight.businessDate)),
  ]);
  const p = head.period;
  const adjustmentIds = rows.flatMap((row) =>
    row.adjustmentId ? [row.adjustmentId] : [],
  );
  const authors = adjustmentIds.length
    ? await tx
        .select({
          id: billingAdjustment.id,
          name: user.name,
          createdAt: billingAdjustment.createdAt,
          updatedAt: billingAdjustment.updatedAt,
        })
        .from(billingAdjustment)
        .innerJoin(user, eq(user.id, billingAdjustment.createdBy))
        .where(inArray(billingAdjustment.id, adjustmentIds))
    : [];
  const authorOf = new Map(authors.map((row) => [row.id, row]));
  const lines: StatementLine[] = rows.map((row) => ({
    kind: row.kind as StatementLine["kind"],
    itemId: row.itemId,
    itemCode: row.itemCode,
    itemName: row.itemName,
    quantityMilli: milliOf(row.quantity),
    fromDate: dateOrNull(row.fromDate),
    toDate: dateOrNull(row.toDate),
    calendarDays: row.calendarDays,
    holidayDays: row.holidayDays,
    chargedDays: row.chargedDays,
    dailyPrice: row.dailyPrice,
    amount: toMoney(row.amount),
    vatBasisPoints: basisPointsOf(row.vatRate, row.vatRate !== null),
    revisionCode: row.revisionCode,
    priceChanged: row.priceChanged,
    missingPrice: false,
    inDoc:
      row.inDocumentCode === null
        ? null
        : {
            type: row.inDocumentType ?? "",
            id: row.inDocumentCode,
            code: row.inDocumentCode,
          },
    inDate: dateOrNull(row.inDate),
    originDate: dateOrNull(row.originDate),
    out:
      row.outKind === null || row.outDocumentCode === null
        ? null
        : {
            kind: row.outKind as EndKind,
            doc: {
              type: row.outDocumentType ?? "",
              id: row.outDocumentCode,
              code: row.outDocumentCode,
            },
            date: row.outDate as BusinessDate,
          },
    minimumDays: row.kind === "MINIMUM" ? parseMinimum(row.note) : null,
    rentedDays:
      row.kind === "MINIMUM" && row.chargedDays !== null
        ? parseMinimum(row.note) - row.chargedDays
        : null,
    adjustment:
      row.kind === "ADJUSTMENT" && row.adjustmentId && row.refMonth
        ? {
            id: row.adjustmentId,
            refMonth: row.refMonth.slice(0, 7),
            amount: row.amount,
            reason: row.note ?? "",
            createdByName: authorOf.get(row.adjustmentId)?.name ?? "",
            createdAt: authorOf.get(row.adjustmentId)?.createdAt ?? p.closedAt,
            updatedAt: authorOf.get(row.adjustmentId)?.updatedAt ?? p.closedAt,
          }
        : null,
  }));
  const freight = freightRows.map((row) => ({
    deliveryNoteId: row.deliveryNoteId,
    code: row.deliveryCode,
    batchNo: row.batchNo,
    vehiclePlate: row.vehiclePlate,
    date: row.businessDate as BusinessDate,
    amount: row.amount,
    vatBasisPoints: basisPointsOf(row.vatRate, row.vatRate !== null),
  }));
  const vat = vatGroups([...lines, ...freight]);
  const revisionCode = rows.find((row) => row.revisionCode)?.revisionCode;
  return {
    closed: { at: p.closedAt, byName: head.byName },
    statement: {
      period: periodOf(month),
      asOf: p.periodEnd as BusinessDate,
      running: false,
      lines,
      freight,
      rentAmount: toMoney(p.rentAmount),
      adjustmentAmount: toMoney(p.adjustmentAmount),
      freightAmount: toMoney(p.freightAmount),
      beforeVat: toMoney(p.rentAmount + p.adjustmentAmount + p.freightAmount),
      vat,
      vatAmount: toMoney(p.vatAmount),
      totalAmount: toMoney(p.totalAmount),
      revisionCode: revisionCode ?? "",
      paymentTermsDays: p.paymentTermsDays,
      dueDate: p.dueDate as BusinessDate,
      holidayDays: p.holidayDays,
      missingPrices: [],
    },
  };
}

/** "Tối thiểu 45 ngày" stored in the note of a MINIMUM line. */
export const minimumNote = (days: number) => `Tối thiểu ${days} ngày`;
function parseMinimum(note: string | null): number {
  const match = /Tối thiểu (\d+) ngày/.exec(note ?? "");
  return match ? Number(match[1]) : 0;
}

/** The D7 statement of one rental contract for a month; null if unknown. */
export async function contractStatement(
  db: Reader,
  contractId: string,
  month: string,
  today: BusinessDate,
): Promise<ContractStatementView | null> {
  const [head] = await rentalHeads(db, [contractId]);
  if (!head) return null;
  const [source, holidays, pending] = await Promise.all([
    loadBillingSource(db, contractId),
    readHolidays(db),
    pendingDocuments(db, contractId),
  ]);
  return statementView(db, head, source, month, today, holidays, pending);
}

function extras(source: BillingSource, month: string) {
  const end = periodOf(month).to;
  return {
    closedMonths: [...source.closed.keys()].sort().reverse(),
    vatBasisPoints:
      source.terms.length > 0
        ? termsOn(source.terms, end).vatBasisPoints
        : null,
  };
}

async function statementView(
  db: Reader,
  head: ContractHead,
  source: BillingSource,
  month: string,
  today: BusinessDate,
  holidays: readonly HolidayRange[],
  pending: PendingDocument[],
): Promise<ContractStatementView | null> {
  const done = source.closed.get(month);
  if (done) {
    const stored = await storedStatement(db, month, done.id);
    return {
      contract: head,
      statement: stored.statement,
      holidays: periodHolidays(month, holidays),
      closed: stored.closed,
      closeBlock: whyNotClosable(source, stored.statement, today, holidays),
      pending: [],
      ...extras(source, month),
    };
  }
  if (source.terms.length === 0) return null;
  const statement = statementOf(source, month, today, holidays);
  return {
    contract: head,
    statement,
    holidays: periodHolidays(month, holidays),
    closed: null,
    closeBlock: whyNotClosable(source, statement, today, holidays),
    pending,
    ...extras(source, month),
  };
}

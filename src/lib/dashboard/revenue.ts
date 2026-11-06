// Revenue as it happens (dashboard-basic design D2, spec sales-revenue;
// 0.2 #80, #90, #96). One book for a range of months up to today:
// - rent: each (rental contract, month) from its closed snapshot, or from the
//   open statement of D7 (statementOf), split into days;
// - sale: posted sale delivery notes (goods + freight) on the delivery day;
// - compensation and buy-back notes approved, on the approval day, apart.
// Before VAT throughout. Nothing is stored.
import { and, eq, gte, inArray, lte } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  billingAdjustment,
  billingPeriod,
  billingPeriodFreight,
  billingPeriodLine,
  buyBackNote,
  compensationNote,
  contract,
  contractSettlement,
  deliveryNote,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import {
  dailyRevenue,
  dailyRevenueOfClosed,
  type DailySplit,
  type DayMismatch,
} from "@/domain/daily-revenue";
import {
  hasContent,
  monthOf,
  nextMonth,
  periodOf,
} from "@/domain/rental-billing";
import type { HolidayRange } from "@/domain/rental-holiday";
import { statementOf, type BillingSource } from "@/lib/billing/compute";
import { loadBillingSources } from "@/lib/billing/sources";
import { deliveredAmounts } from "@/lib/deliveries/amounts";
import { readHolidays } from "@/lib/holidays/queries";

type Reader = Pick<Database, "select">;

/** Revenue of one contract on one day. */
export interface RevenueEntry {
  date: BusinessDate;
  contractId: string;
  customerId: string;
  rent: number;
  sale: number;
}

/** Compensation or buy-back approved on a day: shown apart (0.2 #90). */
export interface SeparateEntry {
  date: BusinessDate;
  customerId: string;
  amount: number;
}

export interface RevenueBook {
  months: string[];
  entries: RevenueEntry[];
  separate: SeparateEntry[];
  /** Months with a rental period not closed yet: provisional. */
  openMonths: Set<string>;
  /** Closed lines whose days no longer match charged_days (design D2). */
  mismatches: DayMismatch[];
}

/** "2026-06" … "2026-11": `count` months ending with the month of `today`. */
export function lastMonths(today: BusinessDate, count: number): string[] {
  const end = monthOf(today);
  const [year, month] = end.split("-").map(Number) as [number, number];
  const startIndex = year * 12 + (month - 1) - (count - 1);
  const first = `${Math.floor(startIndex / 12)}-${String((startIndex % 12) + 1).padStart(2, "0")}`;
  return monthsBetween(first, end);
}

export function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  for (let at = first; at <= last; at = nextMonth(at)) months.push(at);
  return months;
}

interface RentalContract {
  id: string;
  code: string;
  customerId: string;
}

/** Rental contracts that may have rent in the range (design D2). */
async function rentalContracts(
  db: Reader,
  from: BusinessDate,
): Promise<RentalContract[]> {
  const rows = await db
    .select({
      id: contract.id,
      code: contract.code,
      customerId: contract.customerId,
      status: contract.status,
      settledDate: contractSettlement.settledDate,
    })
    .from(contract)
    .leftJoin(
      contractSettlement,
      eq(contractSettlement.contractId, contract.id),
    )
    .where(
      and(
        eq(contract.type, "RENTAL"),
        inArray(contract.status, ["APPROVED", "ACTIVE", "CLOSED"]),
      ),
    );
  return rows
    .filter((row) => !row.settledDate || row.settledDate >= from)
    .map(({ id, code, customerId }) => ({ id, code, customerId }));
}

interface ClosedPeriod {
  id: string;
  contractId: string;
  month: string;
}

async function closedPeriods(
  db: Reader,
  ids: readonly string[],
  months: readonly string[],
): Promise<ClosedPeriod[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: billingPeriod.id,
      contractId: billingPeriod.contractId,
      month: billingPeriod.month,
    })
    .from(billingPeriod)
    .where(
      and(
        inArray(
          billingPeriod.month,
          months.map((month) => `${month}-01`),
        ),
        inArray(billingPeriod.contractId, [...ids]),
      ),
    );
  return rows.map((row) => ({ ...row, month: monthOf(row.month) }));
}

async function closedSplits(
  db: Reader,
  periods: readonly ClosedPeriod[],
  codes: ReadonlyMap<string, string>,
  holidays: readonly HolidayRange[],
): Promise<Map<string, DailySplit>> {
  if (periods.length === 0) return new Map();
  const ids = periods.map((period) => period.id);
  const [lines, freight] = await Promise.all([
    db
      .select({
        periodId: billingPeriodLine.periodId,
        lineNo: billingPeriodLine.lineNo,
        kind: billingPeriodLine.kind,
        amount: billingPeriodLine.amount,
        fromDate: billingPeriodLine.fromDate,
        toDate: billingPeriodLine.toDate,
        chargedDays: billingPeriodLine.chargedDays,
        outDate: billingPeriodLine.outDate,
        adjustmentCreatedAt: billingAdjustment.createdAt,
      })
      .from(billingPeriodLine)
      .leftJoin(
        billingAdjustment,
        eq(billingAdjustment.id, billingPeriodLine.adjustmentId),
      )
      .where(inArray(billingPeriodLine.periodId, ids)),
    db
      .select({
        periodId: billingPeriodFreight.periodId,
        date: billingPeriodFreight.businessDate,
        amount: billingPeriodFreight.amount,
      })
      .from(billingPeriodFreight)
      .where(inArray(billingPeriodFreight.periodId, ids)),
  ]);
  return new Map(
    periods.map((period) => [
      `${period.contractId}|${period.month}`,
      dailyRevenueOfClosed(
        {
          period: periodOf(period.month),
          contractCode: codes.get(period.contractId) ?? "",
          lines: lines
            .filter((line) => line.periodId === period.id)
            .map((line) => ({
              lineNo: line.lineNo,
              kind: line.kind as "RENT" | "MINIMUM" | "ADJUSTMENT",
              amount: line.amount,
              fromDate: line.fromDate as BusinessDate | null,
              toDate: line.toDate as BusinessDate | null,
              chargedDays: line.chargedDays,
              outDate: line.outDate as BusinessDate | null,
              adjustmentCreatedAt: line.adjustmentCreatedAt,
            })),
          freight: freight
            .filter((entry) => entry.periodId === period.id)
            .map((entry) => ({
              date: entry.date as BusinessDate,
              amount: entry.amount,
            })),
        },
        holidays,
      ),
    ]),
  );
}

/** Rent of every rental contract, by contract and day. */
async function rentEntries(
  db: Reader,
  months: readonly string[],
  today: BusinessDate,
  holidays: readonly HolidayRange[],
): Promise<Pick<RevenueBook, "entries" | "openMonths" | "mismatches">> {
  const first = periodOf(months[0] ?? monthOf(today)).from;
  const contracts = await rentalContracts(db, first);
  const codes = new Map(contracts.map((entry) => [entry.id, entry.code]));
  const periods = await closedPeriods(
    db,
    contracts.map((entry) => entry.id),
    months,
  );
  const closedKeys = new Set(
    periods.map((period) => `${period.contractId}|${period.month}`),
  );
  const needSource = contracts.filter((entry) =>
    months.some((month) => !closedKeys.has(`${entry.id}|${month}`)),
  );
  const [closed, sources] = await Promise.all([
    closedSplits(db, periods, codes, holidays),
    loadBillingSources(
      db,
      needSource.map((entry) => entry.id),
    ),
  ]);
  const entries: RevenueEntry[] = [];
  const openMonths = new Set<string>();
  const mismatches: DayMismatch[] = [];
  for (const entry of contracts) {
    for (const month of months) {
      const key = `${entry.id}|${month}`;
      const split =
        closed.get(key) ??
        openSplit(sources.get(entry.id), month, today, holidays);
      if (!split) continue;
      if (!closed.has(key)) openMonths.add(month);
      mismatches.push(...split.mismatches);
      for (const [date, amount] of split.days) {
        entries.push({
          date,
          contractId: entry.id,
          customerId: entry.customerId,
          rent: amount,
          sale: 0,
        });
      }
    }
  }
  return { entries, openMonths, mismatches };
}

/** The open statement of D7 split into days; null when there is nothing. */
function openSplit(
  source: BillingSource | undefined,
  month: string,
  today: BusinessDate,
  holidays: readonly HolidayRange[],
): DailySplit | null {
  if (!source || source.terms.length === 0) return null;
  if (!source.firstMonth || source.firstMonth > month) return null;
  const statement = statementOf(source, month, today, holidays);
  if (!hasContent(statement)) return null;
  return dailyRevenue(statement, holidays);
}

/** Posted sale notes (goods + freight) on their delivery day. */
async function saleEntries(
  db: Reader,
  from: BusinessDate,
  to: BusinessDate,
): Promise<RevenueEntry[]> {
  const notes = await db
    .select({
      contractId: deliveryNote.contractId,
      customerId: contract.customerId,
    })
    .from(deliveryNote)
    .innerJoin(contract, eq(contract.id, deliveryNote.contractId))
    .where(
      and(
        eq(deliveryNote.status, "POSTED"),
        eq(contract.type, "SALE"),
        gte(deliveryNote.businessDate, from),
        lte(deliveryNote.businessDate, to),
      ),
    );
  const customers = new Map(
    notes.map((note) => [note.contractId, note.customerId]),
  );
  const entries: RevenueEntry[] = [];
  for (const [contractId, customerId] of customers) {
    for (const note of await deliveredAmounts(db, contractId)) {
      if (note.businessDate < from || note.businessDate > to) continue;
      entries.push({
        date: note.businessDate,
        contractId,
        customerId,
        rent: 0,
        sale: note.saleTotal + (note.freight ?? 0),
      });
    }
  }
  return entries;
}

/** Compensation and buy-back notes approved in the range (0.2 #90). */
async function separateEntries(
  db: Reader,
  from: BusinessDate,
  to: BusinessDate,
): Promise<SeparateEntry[]> {
  const inRange = (
    column:
      typeof compensationNote.approvedDate | typeof buyBackNote.approvedDate,
  ) => and(gte(column, from), lte(column, to));
  const [compensations, buyBacks] = await Promise.all([
    db
      .select({
        date: compensationNote.approvedDate,
        customerId: contract.customerId,
        amount: compensationNote.amountDue,
      })
      .from(compensationNote)
      .innerJoin(contract, eq(contract.id, compensationNote.contractId))
      .where(
        and(
          eq(compensationNote.status, "APPROVED"),
          inRange(compensationNote.approvedDate),
        ),
      ),
    db
      .select({
        date: buyBackNote.approvedDate,
        customerId: contract.customerId,
        amount: buyBackNote.amountDue,
      })
      .from(buyBackNote)
      .innerJoin(contract, eq(contract.id, buyBackNote.contractId))
      .where(
        and(
          eq(buyBackNote.status, "APPROVED"),
          inRange(buyBackNote.approvedDate),
        ),
      ),
  ]);
  return [...compensations, ...buyBacks].map((row) => ({
    date: row.date as BusinessDate,
    customerId: row.customerId,
    amount: row.amount ?? 0,
  }));
}

/** The revenue book of `months` (oldest first, ending with today's month). */
export async function revenueBook(
  db: Reader,
  months: readonly string[],
  today: BusinessDate,
): Promise<RevenueBook> {
  const first = periodOf(months[0] ?? monthOf(today)).from;
  const holidays = await readHolidays(db);
  const [rent, sale, separate] = await Promise.all([
    rentEntries(db, months, today, holidays),
    saleEntries(db, first, today),
    separateEntries(db, first, today),
  ]);
  return {
    months: [...months],
    entries: [...rent.entries, ...sale],
    separate,
    openMonths: rent.openMonths,
    mismatches: rent.mismatches,
  };
}

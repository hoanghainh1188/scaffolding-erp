// Reading the holidays without rent (rental-billing design D2, D12): the
// whole table for the rent (a few rows a year), one year for the settings
// page, and the latest closed period that freezes them.
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

import type { Database } from "@/db/client";
import { billingPeriod, contract, rentalHoliday } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { HolidayRange } from "@/domain/rental-holiday";

type Reader = Pick<Database, "select">;

export interface HolidayRow extends HolidayRange {
  id: string;
  updatedAt: Date;
}

const columns = {
  id: rentalHoliday.id,
  name: rentalHoliday.name,
  startDate: rentalHoliday.startDate,
  endDate: rentalHoliday.endDate,
  updatedAt: rentalHoliday.updatedAt,
};

const toRow = (row: {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  updatedAt: Date;
}): HolidayRow => ({
  ...row,
  startDate: row.startDate as BusinessDate,
  endDate: row.endDate as BusinessDate,
});

/** Every holiday, oldest first. */
export async function readHolidays(tx: Reader): Promise<HolidayRow[]> {
  const rows = await tx
    .select(columns)
    .from(rentalHoliday)
    .orderBy(asc(rentalHoliday.startDate));
  return rows.map(toRow);
}

/** Holidays touching a year (settings page filter). */
export async function holidaysOfYear(
  tx: Reader,
  year: number,
): Promise<HolidayRow[]> {
  const rows = await tx
    .select(columns)
    .from(rentalHoliday)
    .where(
      and(
        lte(rentalHoliday.startDate, `${year}-12-31`),
        gte(rentalHoliday.endDate, `${year}-01-01`),
      ),
    )
    .orderBy(asc(rentalHoliday.startDate));
  return rows.map(toRow);
}

export interface LatestClosed {
  periodEnd: BusinessDate;
  month: string;
  contractCode: string;
}

/** The closed period ending last, of any contract; null when none is. */
export async function latestClosedPeriod(
  tx: Reader,
): Promise<LatestClosed | null> {
  const [row] = await tx
    .select({
      periodEnd: billingPeriod.periodEnd,
      month: billingPeriod.month,
      contractCode: contract.code,
    })
    .from(billingPeriod)
    .innerJoin(contract, eq(contract.id, billingPeriod.contractId))
    .orderBy(desc(billingPeriod.periodEnd), asc(contract.code))
    .limit(1);
  return row
    ? {
        periodEnd: row.periodEnd as BusinessDate,
        month: row.month.slice(0, 7),
        contractCode: row.contractCode,
      }
    : null;
}

/** A closed period overlapping [from, to], the earliest one; else null. */
export async function closedPeriodWithin(
  tx: Reader,
  from: BusinessDate,
  to: BusinessDate,
): Promise<LatestClosed | null> {
  const [row] = await tx
    .select({
      periodEnd: billingPeriod.periodEnd,
      month: billingPeriod.month,
      contractCode: contract.code,
    })
    .from(billingPeriod)
    .innerJoin(contract, eq(contract.id, billingPeriod.contractId))
    .where(
      and(gte(billingPeriod.periodEnd, from), lte(billingPeriod.month, to)),
    )
    .orderBy(asc(billingPeriod.month), asc(contract.code))
    .limit(1);
  return row
    ? {
        periodEnd: row.periodEnd as BusinessDate,
        month: row.month.slice(0, 7),
        contractCode: row.contractCode,
      }
    : null;
}

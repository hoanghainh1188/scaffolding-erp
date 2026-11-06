// Revenue by day (dashboard-basic design D2, spec sales-revenue; 0.2 #80,
// #90, #96). Pure: a rental statement of one contract and month (open, from
// rental-billing; or closed, from its snapshot) is split into days so the
// days add up to the statement before VAT, to the đồng.
//
// - RENT: the line amount over its charged days (holidays skipped), largest
//   remainder, the earliest day first on a tie.
// - MINIMUM: the whole line on the end date.
// - ADJUSTMENT: on the day it was written (Vietnam time), clamped into the
//   period, so the day is the same before and after closing (0.2 #80).
// - Freight of the rental contract: on the delivery date, in rent (0.2 #96).
import {
  addDays,
  daysBetween,
  toBusinessDate,
  type BusinessDate,
} from "./business-date";
import { largestRemainder } from "./landed-cost";
import { toMoney, type Money } from "./money";
import type { BillingPeriod, Statement } from "./rental-billing";
import type { HolidayRange } from "./rental-holiday";

/** One line to split, from an open statement or a closed snapshot. */
export interface SplitLine {
  kind: "RENT" | "MINIMUM" | "ADJUSTMENT";
  amount: number;
  /** RENT: first and last day of the line. */
  fromDate: BusinessDate | null;
  toDate: BusinessDate | null;
  /** RENT: days charged (calendar days less holidays). */
  chargedDays: number | null;
  /** MINIMUM: the end (return) date. */
  endDate: BusinessDate | null;
  /** ADJUSTMENT: when the line was written. */
  createdAt: Date | null;
  /** For the warning of a snapshot whose days do not match. */
  label?: string;
}

export interface SplitInput {
  period: BillingPeriod;
  lines: readonly SplitLine[];
  freight: readonly { date: BusinessDate; amount: number }[];
}

/** A snapshot line whose recounted days differ from charged_days. */
export interface DayMismatch {
  label: string;
  recounted: number;
  charged: number;
}

export interface DailySplit {
  /** Amount by business date; days without revenue are absent. */
  days: ReadonlyMap<BusinessDate, Money>;
  total: Money;
  mismatches: DayMismatch[];
}

const isHoliday = (date: BusinessDate, holidays: readonly HolidayRange[]) =>
  holidays.some(
    (holiday) => holiday.startDate <= date && date <= holiday.endDate,
  );

/** Every date from `from` to `to`, both included. */
export function datesBetween(
  from: BusinessDate,
  to: BusinessDate,
): BusinessDate[] {
  const count = daysBetween(from, to) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    addDays(from, index),
  );
}

/** `date` moved inside the period. */
export function clampToPeriod(
  date: BusinessDate,
  period: BillingPeriod,
): BusinessDate {
  if (date < period.from) return period.from;
  if (date > period.to) return period.to;
  return date;
}

/** The day an adjustment counts on (0.2 #80, design D2). */
export function adjustmentDay(
  createdAt: Date,
  period: BillingPeriod,
): BusinessDate {
  return clampToPeriod(toBusinessDate(createdAt), period);
}

/** Splits `amount` evenly over `dates`, earliest first on a tie. */
export function spreadEvenly(
  amount: number,
  dates: readonly BusinessDate[],
): [BusinessDate, number][] {
  if (dates.length === 0 || amount === 0) return [];
  const sign = amount < 0 ? -1 : 1;
  const parts = largestRemainder(
    BigInt(Math.abs(amount)),
    dates.map(() => 1n),
  );
  return dates.map((date, index) => [date, sign * Number(parts[index] ?? 0n)]);
}

function rentDates(
  line: SplitLine,
  holidays: readonly HolidayRange[],
  mismatches: DayMismatch[],
): BusinessDate[] {
  if (!line.fromDate || !line.toDate) return [];
  const calendar = datesBetween(line.fromDate, line.toDate);
  const charged = calendar.filter((date) => !isHoliday(date, holidays));
  const expected = line.chargedDays ?? charged.length;
  if (charged.length === expected) return charged;
  mismatches.push({
    label: line.label ?? `${line.fromDate}…${line.toDate}`,
    recounted: charged.length,
    charged: expected,
  });
  return calendar.slice(0, Math.max(0, expected));
}

/** Splits one statement (open or closed) into days. */
export function splitIntoDays(
  input: SplitInput,
  holidays: readonly HolidayRange[],
): DailySplit {
  const totals = new Map<BusinessDate, number>();
  const add = (date: BusinessDate, amount: number) => {
    if (amount === 0) return;
    totals.set(date, (totals.get(date) ?? 0) + amount);
  };
  const mismatches: DayMismatch[] = [];
  for (const line of input.lines) {
    if (line.kind === "RENT") {
      const dates = rentDates(line, holidays, mismatches);
      for (const [date, part] of spreadEvenly(line.amount, dates)) {
        add(date, part);
      }
    } else if (line.kind === "MINIMUM") {
      if (line.endDate) add(line.endDate, line.amount);
    } else if (line.createdAt) {
      add(adjustmentDay(line.createdAt, input.period), line.amount);
    }
  }
  for (const entry of input.freight) add(entry.date, entry.amount);
  const days = new Map(
    [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => [date, toMoney(amount)] as const),
  );
  const total = toMoney([...totals.values()].reduce((a, b) => a + b, 0));
  return { days, total, mismatches };
}

/** The lines of an open statement (rental-billing) as split lines. */
export function linesOfStatement(statement: Statement): SplitLine[] {
  return statement.lines.map((line) => ({
    kind: line.kind,
    amount: line.amount,
    fromDate: line.fromDate,
    toDate: line.toDate,
    chargedDays: line.chargedDays,
    endDate: line.out?.date ?? null,
    createdAt: line.adjustment?.createdAt ?? null,
  }));
}

/** An open statement of one contract and month, by day. */
export function dailyRevenue(
  statement: Statement,
  holidays: readonly HolidayRange[],
): DailySplit {
  return splitIntoDays(
    {
      period: statement.period,
      lines: linesOfStatement(statement),
      freight: statement.freight,
    },
    holidays,
  );
}

/** One row of billing_period_line as the dashboard reads it. */
export interface ClosedLine {
  lineNo: number;
  kind: "RENT" | "MINIMUM" | "ADJUSTMENT";
  amount: number;
  fromDate: BusinessDate | null;
  toDate: BusinessDate | null;
  chargedDays: number | null;
  outDate: BusinessDate | null;
  /** billing_adjustment.created_at joined through adjustment_id. */
  adjustmentCreatedAt: Date | null;
}

/** A closed period (snapshot) of one contract, by day. */
export function dailyRevenueOfClosed(
  input: {
    period: BillingPeriod;
    contractCode: string;
    lines: readonly ClosedLine[];
    freight: readonly { date: BusinessDate; amount: number }[];
  },
  holidays: readonly HolidayRange[],
): DailySplit {
  return splitIntoDays(
    {
      period: input.period,
      lines: input.lines.map((line) => ({
        kind: line.kind,
        amount: line.amount,
        fromDate: line.fromDate,
        toDate: line.toDate,
        chargedDays: line.chargedDays,
        endDate: line.outDate,
        createdAt: line.adjustmentCreatedAt,
        label: `${input.contractCode} kỳ ${input.period.month} dòng ${line.lineNo}`,
      })),
      freight: input.freight,
    },
    holidays,
  );
}

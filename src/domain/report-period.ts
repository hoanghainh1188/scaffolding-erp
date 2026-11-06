// Periods of D15 (management-reports design D3, D9, D11; spec gross-profit
// "Kỳ báo cáo", spec management-reports "So với kỳ trước ở ô Doanh thu").
// A period is a month, a quarter or a year of Vietnam days; every sum of a
// period is a sum of its months. Pure functions, no clock: `today` is given.
import {
  addDays,
  daysBetween,
  formatBusinessDate,
  monthRange,
  type BusinessDate,
} from "./business-date";

/** The first year D15 offers (design D6: before any data). */
export const REPORT_FIRST_YEAR = 2020;

export const PERIOD_KINDS = ["month", "quarter", "year"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export const REPORT_PERIOD_MESSAGES = {
  invalid: "Kỳ báo cáo không hợp lệ",
} as const;

export interface ReportPeriod {
  kind: PeriodKind;
  /** "2026-10", "2026-Q3" or "2026": the URL value. */
  value: string;
  /** First and last day of the whole period. */
  from: BusinessDate;
  to: BusinessDate;
}

export interface DateRange {
  from: BusinessDate;
  to: BusinessDate;
}

const pad = (value: number) => String(value).padStart(2, "0");

const dateOf = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}` as BusinessDate;

const lastDayOf = (year: number, month: number): BusinessDate =>
  monthRange(dateOf(year, month, 1)).to;

function build(kind: PeriodKind, year: number, index: number): ReportPeriod {
  switch (kind) {
    case "month":
      return {
        kind,
        value: `${year}-${pad(index)}`,
        from: dateOf(year, index, 1),
        to: lastDayOf(year, index),
      };
    case "quarter": {
      const first = (index - 1) * 3 + 1;
      return {
        kind,
        value: `${year}-Q${index}`,
        from: dateOf(year, first, 1),
        to: lastDayOf(year, first + 2),
      };
    }
    case "year":
      return {
        kind,
        value: String(year),
        from: dateOf(year, 1, 1),
        to: dateOf(year, 12, 31),
      };
  }
}

const PATTERNS: Readonly<Record<PeriodKind, RegExp>> = {
  month: /^(\d{4})-(0[1-9]|1[0-2])$/,
  quarter: /^(\d{4})-Q([1-4])$/,
  year: /^(\d{4})$/,
};

/** The period of the URL, or null when it is not one D15 offers. */
export function readPeriod(
  kind: string | undefined,
  value: string | undefined,
  today: BusinessDate,
): ReportPeriod | null {
  if (!kind || !value) return null;
  if (!(PERIOD_KINDS as readonly string[]).includes(kind)) return null;
  const typed = kind as PeriodKind;
  const match = PATTERNS[typed].exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const index = typed === "year" ? 1 : Number(match[2]);
  if (year < REPORT_FIRST_YEAR) return null;
  const period = build(typed, year, index);
  return period.from > today ? null : period;
}

/** This month: what D15 opens by default. */
export function currentMonth(today: BusinessDate): ReportPeriod {
  const [year, month] = today.split("-").map(Number) as [number, number];
  return build("month", year, month);
}

/** The page reads a wrong or future period as this month (spec). */
export function parsePeriod(
  kind: string | undefined,
  value: string | undefined,
  today: BusinessDate,
): ReportPeriod {
  return readPeriod(kind, value, today) ?? currentMonth(today);
}

/** The days of the period counted so far: up to today at the latest. */
export function periodRange(
  period: ReportPeriod,
  today: BusinessDate,
): DateRange {
  return { from: period.from, to: period.to < today ? period.to : today };
}

/** The period has not ended: today is one of its days. */
export const isRunning = (period: ReportPeriod, today: BusinessDate): boolean =>
  period.to >= today;

function yearAndIndex(period: ReportPeriod): [number, number] {
  const year = Number(period.value.slice(0, 4));
  if (period.kind === "year") return [year, 1];
  if (period.kind === "quarter") return [year, Number(period.value.slice(6))];
  return [year, Number(period.value.slice(5, 7))];
}

/** The whole period just before, of the same kind. */
export function previousPeriod(period: ReportPeriod): ReportPeriod {
  const [year, index] = yearAndIndex(period);
  if (period.kind === "year") return build("year", year - 1, 1);
  const last = period.kind === "month" ? 12 : 4;
  return index === 1
    ? build(period.kind, year - 1, last)
    : build(period.kind, year, index - 1);
}

/** 01/01 of the period's year to its last counted day. */
export function yearToDate(
  period: ReportPeriod,
  today: BusinessDate,
): DateRange {
  const [year] = yearAndIndex(period);
  return { from: dateOf(year, 1, 1), to: periodRange(period, today).to };
}

/** "Tháng 10/2026", "Quý 3/2026", "Năm 2026". */
export function periodLabel(period: ReportPeriod): string {
  const [year, index] = yearAndIndex(period);
  switch (period.kind) {
    case "month":
      return `Tháng ${pad(index)}/${year}`;
    case "quarter":
      return `Quý ${index}/${year}`;
    case "year":
      return `Năm ${year}`;
  }
}

/** "tháng 9", "quý 2/2026", "năm 2025": a whole previous period. */
function shortLabel(period: ReportPeriod): string {
  const [year, index] = yearAndIndex(period);
  switch (period.kind) {
    case "month":
      return `tháng ${index}`;
    case "quarter":
      return `quý ${index}/${year}`;
    case "year":
      return `năm ${year}`;
  }
}

export interface ComparableRange extends DateRange {
  /** "tháng 9" or "01/10 – 06/10" (spec, design D11). */
  label: string;
}

/**
 * What the revenue tile compares with: the whole previous period when this
 * one has ended, else the same number of first days of it, never past its
 * last day (design D11).
 */
export function comparableRange(
  period: ReportPeriod,
  today: BusinessDate,
): ComparableRange {
  const previous = previousPeriod(period);
  if (!isRunning(period, today)) {
    return {
      from: previous.from,
      to: previous.to,
      label: shortLabel(previous),
    };
  }
  const days = daysBetween(period.from, today) + 1;
  const end = addDays(previous.from, days - 1);
  const to = end < previous.to ? end : previous.to;
  const dayMonth = (date: BusinessDate) => formatBusinessDate(date).slice(0, 5);
  const last = period.kind === "year" ? formatBusinessDate(to) : dayMonth(to);
  return {
    from: previous.from,
    to,
    label: `${dayMonth(previous.from)} – ${last}`,
  };
}

/** "2026-01" … "2026-10": the months a range touches, in order. */
export function monthsOf(range: DateRange): string[] {
  const months: string[] = [];
  let [year, month] = range.from.split("-").map(Number) as [number, number];
  const last = range.to.slice(0, 7);
  for (;;) {
    const at = `${year}-${pad(month)}`;
    if (at > last) break;
    months.push(at);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** "số liệu đến hết 31/10/2026". */
export const dataUntilText = (period: ReportPeriod, today: BusinessDate) =>
  `số liệu đến hết ${formatBusinessDate(periodRange(period, today).to)}`;

/** The period of `kind` that holds the first day of `period`. */
export function switchKind(
  period: ReportPeriod,
  kind: PeriodKind,
): ReportPeriod {
  const [year, month] = period.from.split("-").map(Number) as [number, number];
  if (kind === "year") return build("year", year, 1);
  if (kind === "quarter") return build("quarter", year, Math.ceil(month / 3));
  return build("month", year, month);
}

/** Every period of `kind` D15 offers, newest first. */
export function periodOptions(
  kind: PeriodKind,
  today: BusinessDate,
): ReportPeriod[] {
  const options: ReportPeriod[] = [];
  let at: ReportPeriod | null = switchKind(currentMonth(today), kind);
  while (at && Number(at.value.slice(0, 4)) >= REPORT_FIRST_YEAR) {
    options.push(at);
    at = previousPeriod(at);
  }
  return options;
}

// Holidays without rent (0.2 #73, rental-billing design D2): one table for
// every rental contract, each row a closed range of days, never two rows on
// one day. Pure: rental-billing counts the holidays inside a line's range,
// the holiday service checks a row before writing it.
import {
  daysBetween,
  formatBusinessDate,
  isBusinessDate,
  type BusinessDate,
} from "./business-date";
import { DomainValueError } from "./errors";

/** Longest row (design D2): catches a mistyped year. */
export const HOLIDAY_MAX_DAYS = 31;
export const HOLIDAY_NAME_MAX = 100;

export interface HolidayRange {
  id?: string;
  name: string;
  startDate: BusinessDate;
  endDate: BusinessDate;
}

export const HOLIDAY_MESSAGES = {
  nameRequired: "Bạn nhập tên ngày nghỉ.",
  nameTooLong: `Tên ngày nghỉ dài tối đa ${HOLIDAY_NAME_MAX} ký tự.`,
  dateRequired: "Bạn nhập ngày bắt đầu và ngày kết thúc theo dạng dd/mm/yyyy.",
  endBeforeStart: "Ngày kết thúc phải từ ngày bắt đầu trở đi.",
  tooLong: `Một dòng ngày nghỉ dài tối đa ${HOLIDAY_MAX_DAYS} ngày. Bạn tách thành nhiều dòng nếu cần.`,
  overlap: (day: string, name: string) =>
    `Ngày ${formatBusinessDate(day)} đã nằm trong "${name}". Bạn sửa dòng đó hoặc chọn ngày khác.`,
} as const;

/** Days of a row, both ends included. */
export function holidayLength(range: HolidayRange): number {
  return daysBetween(range.startDate, range.endDate) + 1;
}

/** A row to save, trimmed; throws DomainValueError with 0.2 #45 copy. */
export function checkHoliday(input: {
  name: string;
  startDate: string;
  endDate: string;
}): HolidayRange {
  const name = input.name.trim();
  if (!name) throw new DomainValueError(HOLIDAY_MESSAGES.nameRequired);
  if (name.length > HOLIDAY_NAME_MAX) {
    throw new DomainValueError(HOLIDAY_MESSAGES.nameTooLong);
  }
  if (!isBusinessDate(input.startDate) || !isBusinessDate(input.endDate)) {
    throw new DomainValueError(HOLIDAY_MESSAGES.dateRequired);
  }
  const range = { name, startDate: input.startDate, endDate: input.endDate };
  if (range.endDate < range.startDate) {
    throw new DomainValueError(HOLIDAY_MESSAGES.endBeforeStart);
  }
  if (holidayLength(range) > HOLIDAY_MAX_DAYS) {
    throw new DomainValueError(HOLIDAY_MESSAGES.tooLong);
  }
  return range;
}

/** The first day `range` shares with another row, and that row. */
export function firstOverlap(
  range: HolidayRange,
  others: readonly HolidayRange[],
): { day: BusinessDate; holiday: HolidayRange } | null {
  const hits = others
    .filter((other) => other.id === undefined || other.id !== range.id)
    .filter(
      (other) =>
        other.startDate <= range.endDate && other.endDate >= range.startDate,
    )
    .map((other) => ({
      day: (other.startDate > range.startDate
        ? other.startDate
        : range.startDate) as BusinessDate,
      holiday: other,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
  return hits[0] ?? null;
}

/** Holidays in [from, to], both included; 0 when from is after to. */
export function holidayDaysIn(
  from: BusinessDate,
  to: BusinessDate,
  holidays: readonly HolidayRange[],
): number {
  if (from > to) return 0;
  return holidays.reduce((sum, holiday) => {
    const start = holiday.startDate > from ? holiday.startDate : from;
    const end = holiday.endDate < to ? holiday.endDate : to;
    return start > end ? sum : sum + daysBetween(start, end) + 1;
  }, 0);
}

/** The holiday rows that touch [from, to], clipped to it (D7 band). */
export function holidaysIn(
  from: BusinessDate,
  to: BusinessDate,
  holidays: readonly HolidayRange[],
): (HolidayRange & { days: number })[] {
  return holidays
    .filter((holiday) => holiday.startDate <= to && holiday.endDate >= from)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((holiday) => ({
      ...holiday,
      days: holidayDaysIn(from, to, [holiday]),
    }));
}

import { DomainValueError } from "./errors";

/** The business time zone: a "day" is a calendar day in Vietnam. */
export const BUSINESS_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** A calendar day in Vietnam, as "YYYY-MM-DD" (Postgres `date`). */
export type BusinessDate = string & { readonly __brand: "BusinessDate" };

const isoDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function assertValidInstant(instant: Date): void {
  if (Number.isNaN(instant.getTime())) {
    throw new DomainValueError("Thời điểm không hợp lệ");
  }
}

/** The Vietnam calendar day an instant (stored in UTC) falls on. */
export function toBusinessDate(instant: Date): BusinessDate {
  assertValidInstant(instant);
  return isoDayFormatter.format(instant) as BusinessDate;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isBusinessDate(value: string): value is BusinessDate {
  const match = ISO_DAY.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const probe = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() + 1 === month &&
    probe.getUTCDate() === day
  );
}

/** "27/10/2026" */
export function formatBusinessDate(value: string): string {
  if (!isBusinessDate(value)) {
    throw new DomainValueError("Ngày không hợp lệ");
  }
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/** "27/10/2026 00:00" in Vietnam time. */
export function formatDateTime(instant: Date): string {
  assertValidInstant(instant);
  const parts = Object.fromEntries(
    dateTimeFormatter.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

// When a truck is due, as M1 says it (goods-receipt spec mobile-home,
// design D7): late ones first, then today by time, then tomorrow.
import {
  daysBetween,
  formatBusinessDate,
  type BusinessDate,
} from "./business-date";

export type ArrivalDay = "LATE" | "TODAY" | "TOMORROW" | "LATER";

export interface ArrivalLabel {
  day: ArrivalDay;
  /** "09:30", "Trễ 2 ngày", "Mai 14:00", "28/10/2026". */
  text: string;
}

export function arrivalLabel(
  expectedDate: BusinessDate,
  expectedTime: string | null,
  today: BusinessDate,
): ArrivalLabel {
  const ahead = daysBetween(today, expectedDate);
  const time = expectedTime ? expectedTime.slice(0, 5) : null;
  if (ahead < 0) return { day: "LATE", text: `Trễ ${-ahead} ngày` };
  if (ahead === 0) return { day: "TODAY", text: time ?? "Hôm nay" };
  if (ahead === 1) {
    return { day: "TOMORROW", text: time ? `Mai ${time}` : "Mai" };
  }
  return { day: "LATER", text: formatBusinessDate(expectedDate) };
}

/** M1 counts today's and late cards as today's work. */
export function isDueToday(day: ArrivalDay): boolean {
  return day === "LATE" || day === "TODAY";
}

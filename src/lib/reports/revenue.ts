// Revenue of D15 (management-reports design D7; spec gross-profit "Doanh
// thu của kỳ", "Doanh thu tháng khớp Tổng quan"). One call of the D1 book
// for the months read, cut at the last day counted; rent and sale are the
// D1 numbers, compensation and buy-back are shown apart by approval day.
import type { Database } from "@/db/client";
import type { BusinessDate } from "@/domain/business-date";
import type { RevenueParts } from "@/domain/gross-profit";
import { monthsOf, type DateRange } from "@/domain/report-period";
import { revenueBook, type RevenueBook } from "@/lib/dashboard/revenue";

type Reader = Pick<Database, "select">;

export interface ReportRevenue {
  /** The D1 book of the range, nothing after its last day. */
  book: RevenueBook;
  byMonth: Map<string, RevenueParts>;
}

const empty = (): Record<keyof RevenueParts, number> => ({
  rent: 0,
  sale: 0,
  compensation: 0,
  buyBack: 0,
});

/** Revenue by month of `range` (whole months, to its last day). */
export async function reportRevenue(
  db: Reader,
  range: DateRange,
  today: BusinessDate,
): Promise<ReportRevenue> {
  const months = monthsOf(range);
  const whole = await revenueBook(db, months, today);
  const inRange = (date: string) => date >= range.from && date <= range.to;
  const book: RevenueBook = {
    ...whole,
    entries: whole.entries.filter((entry) => inRange(entry.date)),
    separate: whole.separate.filter((entry) => inRange(entry.date)),
  };
  const byMonth = new Map(months.map((month) => [month, empty()]));
  const at = (date: string) => byMonth.get(date.slice(0, 7));
  for (const entry of book.entries) {
    const parts = at(entry.date);
    if (!parts) continue;
    parts.rent += entry.rent;
    parts.sale += entry.sale;
  }
  for (const entry of book.separate) {
    const parts = at(entry.date);
    if (!parts) continue;
    if (entry.kind === "COMPENSATION") parts.compensation += entry.amount;
    else parts.buyBack += entry.amount;
  }
  return { book, byMonth };
}

/** All revenue (four parts) between two days: the tile's comparison. */
export function revenueBetween(
  book: RevenueBook,
  from: BusinessDate,
  to: BusinessDate,
): number {
  const inRange = (date: string) => date >= from && date <= to;
  const flows = book.entries
    .filter((entry) => inRange(entry.date))
    .reduce((sum, entry) => sum + entry.rent + entry.sale, 0);
  const apart = book.separate
    .filter((entry) => inRange(entry.date))
    .reduce((sum, entry) => sum + entry.amount, 0);
  return flows + apart;
}

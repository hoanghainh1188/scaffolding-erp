// D15 in one object (management-reports design D9, D10): the page and the
// Excel file read the same numbers. Every read is grouped and runs in
// parallel; nothing is written or stored.
import type { Database } from "@/db/client";
import type { BusinessDate } from "@/domain/business-date";
import {
  fleetTotals,
  lossTable,
  sumFleet,
  utilizationTable,
  type FleetTotals,
  type LossRow,
  type LossTable,
  type UseRow,
} from "@/domain/fleet-metrics";
import {
  changeText,
  monthlyProfit,
  sumMonths,
  type MonthProfit,
  type ProfitTotals,
} from "@/domain/gross-profit";
import {
  comparableRange,
  dataUntilText,
  monthsOf,
  periodLabel,
  periodRange,
  previousPeriod,
  yearToDate,
  type ComparableRange,
  type DateRange,
  type ReportPeriod,
} from "@/domain/report-period";

import { ledgerSums, productionSums, repairSums } from "./costs";
import { reportFleet } from "./fleet";
import { customerRanking, type CustomerRanking } from "./ranking";
import { reportRevenue, revenueBetween } from "./revenue";

type Reader = Pick<Database, "select">;

export interface Report {
  period: ReportPeriod;
  label: string;
  previousLabel: string;
  /** "số liệu đến hết 31/10/2026". */
  dataUntil: string;
  range: DateRange;
  year: number;
  current: ProfitTotals;
  previous: ProfitTotals;
  yearToDate: ProfitTotals;
  /** Revenue tile: "+ 4,2 %" against `comparable` (design D11). */
  change: { text: string | null; comparable: ComparableRange };
  /** Months of the chart: January to the period's last month. */
  months: MonthProfit[];
  losses: LossTable;
  lossesYear: LossRow;
  uses: UseRow[];
  fleet: FleetTotals;
  ranking: CustomerRanking;
}

const earlier = (a: BusinessDate, b: BusinessDate) => (a < b ? a : b);

/** Every number of D15 for `period`, as of `today`. */
export async function buildReport(
  db: Reader,
  period: ReportPeriod,
  today: BusinessDate,
): Promise<Report> {
  const range = periodRange(period, today);
  const previous = previousPeriod(period);
  const ytd = yearToDate(period, today);
  const year = Number(ytd.from.slice(0, 4));
  // The ranking covers the whole year to today (spec), the rest ends at E.
  const yearEnd = earlier(`${year}-12-31` as BusinessDate, today);
  const read: DateRange = {
    from: earlier(previous.from, ytd.from),
    to: yearEnd,
  };
  const [revenue, ledger, repairs, productions, fleet] = await Promise.all([
    reportRevenue(db, read, today),
    ledgerSums(db, read),
    repairSums(db, read),
    productionSums(db, read),
    reportFleet(db, { from: ytd.from, to: range.to }),
  ]);
  const ranking = await customerRanking(db, revenue.book, ytd.from, yearEnd);
  const rows = monthlyProfit(
    monthsOf(read),
    revenue.byMonth,
    ledger,
    repairs,
    revenue.book.openMonths,
    productions,
  );
  const current = sumMonths(rows, monthsOf(range));
  const comparable = comparableRange(period, today);
  const base = revenueBetween(revenue.book, comparable.from, comparable.to);
  const periodMonths = monthsOf(range);
  const yearMonths = monthsOf(ytd);
  const periodFleet = sumFleet(fleet.months, periodMonths);
  const yearFleet = sumFleet(fleet.months, yearMonths);
  return {
    period,
    label: periodLabel(period),
    previousLabel: periodLabel(previous),
    dataUntil: dataUntilText(period, today),
    range,
    year,
    current,
    previous: sumMonths(rows, monthsOf(previous)),
    yearToDate: sumMonths(rows, yearMonths),
    change: { text: changeText(current.revenueTotal, base), comparable },
    months: rows.filter((row) => yearMonths.includes(row.month)),
    losses: lossTable(fleet.items, periodFleet, fleet.losses, periodMonths),
    lossesYear: lossTable(fleet.items, yearFleet, fleet.losses, yearMonths)
      .total,
    uses: utilizationTable(fleet.items, periodFleet),
    fleet: fleetTotals(fleet.items, periodFleet),
    ranking,
  };
}

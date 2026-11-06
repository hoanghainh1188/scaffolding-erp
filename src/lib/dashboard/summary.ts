// D1 as a whole (dashboard-basic design D1, D2): which blocks a viewer
// gets and the data of each. The page loads blocks one by one (each in its
// own Suspense); dashboardFor loads them all, for tests and the API. Money
// is never read for a viewer without receivables.view.
import type { Database } from "@/db/client";
import { daysBetween, type BusinessDate } from "@/domain/business-date";
import {
  REVENUE_MONTHS,
  blocksFor,
  monthTotals,
  type DayRevenue,
  type MonthRevenue,
  type RankedCustomer,
  type RiskSite,
} from "@/domain/dashboard";
import { datesBetween } from "@/domain/daily-revenue";
import { toMoney, type Money } from "@/domain/money";
import type { ContractUser } from "@/domain/permissions";
import { monthOf, periodOf } from "@/domain/rental-billing";

import { pendingApprovals, type ApprovalRow } from "./approvals";
import { overdueSummary, type OverdueSummary } from "./overdue";
import {
  lastMonths,
  monthsBetween,
  revenueBook,
  type RevenueBook,
} from "./revenue";
import { riskySites } from "./risk";
import {
  onSiteSummary,
  stockByCondition,
  type ConditionRow,
  type OnSiteSummary,
} from "./stock";
import { topByKg, topByRevenue } from "./top";

/** The months one book covers: the chart's six and January of this year. */
export function bookMonths(today: BusinessDate): string[] {
  const chart = lastMonths(today, REVENUE_MONTHS);
  const january = `${today.slice(0, 4)}-01`;
  const first = [chart[0] ?? january, january].sort()[0] ?? january;
  return monthsBetween(first, monthOf(today));
}

export async function readBook(
  db: Database,
  today: BusinessDate,
): Promise<RevenueBook> {
  const book = await revenueBook(db, bookMonths(today), today);
  for (const mismatch of book.mismatches) {
    console.warn(
      `[dashboard] ${mismatch.label}: ${mismatch.recounted} ngày đếm lại, ${mismatch.charged} ngày đã chụp`,
    );
  }
  return book;
}

export interface RevenueSummary {
  month: MonthRevenue;
  months: MonthRevenue[];
  /** Every day of this month up to today, zero days included. */
  days: DayRevenue[];
  today: DayRevenue;
  /** Compensation and buy-back approved this month, apart (0.2 #90). */
  separate: Money;
}

const add = (a: number, b: number) => toMoney(a + b);

/** Revenue of the chart and the day view from one book. */
export function revenueSummary(
  book: RevenueBook,
  today: BusinessDate,
): RevenueSummary {
  const byDay = new Map<string, DayRevenue>();
  for (const entry of book.entries) {
    const seen = byDay.get(entry.date) ?? {
      date: entry.date,
      rent: toMoney(0),
      sale: toMoney(0),
    };
    byDay.set(entry.date, {
      date: entry.date,
      rent: add(seen.rent, entry.rent),
      sale: add(seen.sale, entry.sale),
    });
  }
  const all = [...byDay.values()];
  const months = monthTotals(
    all,
    lastMonths(today, REVENUE_MONTHS),
    book.openMonths,
  );
  const current = monthOf(today);
  const first = periodOf(current).from;
  const days = datesBetween(first, today).map(
    (date) => byDay.get(date) ?? { date, rent: toMoney(0), sale: toMoney(0) },
  );
  const month = months.at(-1) ?? monthTotals([], [current], new Set())[0]!;
  return {
    month: { ...month, provisional: true },
    months: months.map((entry) =>
      entry.month === current ? { ...entry, provisional: true } : entry,
    ),
    days,
    today: days.at(-1) ?? { date: today, rent: toMoney(0), sale: toMoney(0) },
    separate: toMoney(
      book.separate
        .filter(
          (entry) => entry.date >= first && daysBetween(entry.date, today) >= 0,
        )
        .reduce((sum, entry) => sum + entry.amount, 0),
    ),
  };
}

export interface TopCustomers {
  year: string;
  revenue: RankedCustomer[];
  kg: RankedCustomer[];
}

export async function topOfYear(
  db: Database,
  book: RevenueBook,
  today: BusinessDate,
): Promise<TopCustomers> {
  const january = `${today.slice(0, 4)}-01-01` as BusinessDate;
  const [revenue, kg] = await Promise.all([
    topByRevenue(db, book, january),
    topByKg(db, january, today),
  ]);
  return { year: today.slice(0, 4), revenue, kg };
}

export interface DashboardData {
  approvals: ApprovalRow[];
  onSite: OnSiteSummary;
  stock?: ConditionRow[];
  risks?: RiskSite[];
  overdue?: OverdueSummary;
  revenue?: RevenueSummary;
  top?: TopCustomers;
}

/** Every block the viewer may see, and nothing else (design D1). */
export async function dashboardFor(
  db: Database,
  viewer: ContractUser,
  today: BusinessDate,
): Promise<DashboardData> {
  const blocks = blocksFor(viewer);
  const [approvals, onSite, stock, risks] = await Promise.all([
    pendingApprovals(db, viewer),
    onSiteSummary(db),
    blocks.stock ? stockByCondition(db) : undefined,
    blocks.rentals ? riskySites(db, viewer, today) : undefined,
  ]);
  const data: DashboardData = { approvals, onSite };
  if (stock) data.stock = stock;
  if (risks) data.risks = risks;
  if (!blocks.money) return data;
  const book = await readBook(db, today);
  const [overdue, top] = await Promise.all([
    overdueSummary(db, today),
    topOfYear(db, book, today),
  ]);
  return {
    ...data,
    overdue,
    revenue: revenueSummary(book, today),
    top,
  };
}

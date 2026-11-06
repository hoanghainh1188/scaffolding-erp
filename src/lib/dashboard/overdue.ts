// "Công nợ quá hạn" of D1 (dashboard-basic spec dashboard): the D14 numbers
// themselves, from customerBalances, overdue by Vietnamese day.
import type { Database } from "@/db/client";
import type { BusinessDate } from "@/domain/business-date";
import type { Money } from "@/domain/money";
import { customerBalances } from "@/lib/receivables/balances";

export interface OverdueSummary {
  amount: Money;
  customers: number;
  longestDays: number;
}

export async function overdueSummary(
  db: Database,
  today: BusinessDate,
): Promise<OverdueSummary> {
  const { totals } = await customerBalances(db, today, { filter: "overdue" });
  return {
    amount: totals.overdue,
    customers: totals.overdueCount,
    longestDays: totals.longestOverdueDays,
  };
}

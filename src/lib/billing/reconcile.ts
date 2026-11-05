// Closed periods against the ledger (receivables task 6.3, follow-up of
// rental-billing): receivables reads the amounts copied when a period was
// closed, so each closed period is computed again from the ledger and the
// two totals must agree. Nothing is written.
import { asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { billingPeriod, contract } from "@/db/schema";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { formatMoney, toMoney } from "@/domain/money";
import { formatMonth, monthOf } from "@/domain/rental-billing";
import { readHolidays } from "@/lib/holidays/queries";

import { loadBillingSource, statementOf, type BillingSource } from "./compute";

type Reader = Pick<Database, "select">;

/** One line per closed period whose stored total differs from the ledger. */
export async function reconcileBilling(
  db: Reader,
  today: BusinessDate = toBusinessDate(new Date()),
): Promise<string[]> {
  const periods = await db
    .select({
      contractId: billingPeriod.contractId,
      code: contract.code,
      month: billingPeriod.month,
      total: billingPeriod.totalAmount,
    })
    .from(billingPeriod)
    .innerJoin(contract, eq(contract.id, billingPeriod.contractId))
    .orderBy(asc(contract.code), asc(billingPeriod.month));
  const holidays = await readHolidays(db);
  const sources = new Map<string, BillingSource>();
  const problems: string[] = [];
  for (const period of periods) {
    let source = sources.get(period.contractId);
    if (!source) {
      source = await loadBillingSource(db, period.contractId);
      sources.set(period.contractId, source);
    }
    const month = monthOf(period.month);
    const computed = statementOf(source, month, today, holidays).totalAmount;
    if (computed !== period.total) {
      problems.push(
        `${period.code} · kỳ ${formatMonth(month)}: đã chốt ${formatMoney(toMoney(period.total))}, tính lại ${formatMoney(computed)}`,
      );
    }
  }
  return problems;
}

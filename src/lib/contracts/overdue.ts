// Overdue debt of a customer (contracts design D3, 0.2 #15, receivables
// design D8): what is left of debts whose due date is before today, by
// Vietnamese day, and the days of the earliest one. Called inside the
// approval transactions of contracts, amendments, compensation and buy-back
// notes, and by the pages that show the warning. It only reads.
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import type { OverdueDebt } from "@/domain/contract";

import type { Database } from "@/db/client";
import { readLedger } from "@/lib/receivables/balances";

/** Any reader: the transaction of a command or the plain database. */
type Reader = Pick<Database, "select">;

export async function overdueDebt(
  tx: Reader,
  customerId: string,
  today: BusinessDate = toBusinessDate(new Date()),
): Promise<OverdueDebt> {
  const ledger = await readLedger(tx, customerId, today);
  return { amount: ledger.overdue.amount, days: ledger.overdue.days };
}

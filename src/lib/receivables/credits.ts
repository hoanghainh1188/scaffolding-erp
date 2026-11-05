// Prepayment settles later debts at once (0.2 #82, design D3). Every command
// that creates a debt (closing a period, approving a compensation or a
// buy-back, posting a sale delivery) and cancelling a receipt call this in
// their own transaction, after their own locks: it locks the customer, reads
// what is left and writes PREPAYMENT allocations. Afterwards a customer with
// a prepayment owes nothing.
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { formatMoney, toMoney, type Money } from "@/domain/money";
import { applyCredits } from "@/domain/receivables";
import type { ActivityActor } from "@/lib/activity/actor";
import type { Tx } from "@/lib/contracts/common";

import { openDebtOf, readLedger } from "./balances";
import { insertAllocations, lockCustomer } from "./common";

/** What settleCredits took from the prepayment, in ₫ (0 when nothing). */
export async function settleCredits(
  tx: Tx,
  customerId: string,
  actor: ActivityActor,
  today: BusinessDate = toBusinessDate(new Date()),
): Promise<Money> {
  const locked = await lockCustomer(tx, customerId);
  const ledger = await readLedger(tx, customerId, today);
  if (ledger.credits.length === 0) return toMoney(0);
  const open = ledger.debts.filter((debt) => debt.remaining > 0);
  if (open.length === 0) return toMoney(0);
  const rows = applyCredits({
    credits: ledger.credits,
    openDebts: open.map(openDebtOf),
  });
  await insertAllocations(
    tx,
    actor,
    locked,
    rows.map((row) => ({ ...row, mode: "PREPAYMENT" as const })),
  );
  return toMoney(rows.reduce((sum, row) => sum + row.amount, 0));
}

/** " · trừ tiền trả trước x ₫" for the summary of the calling command. */
export function prepaymentSuffix(taken: Money): string {
  return taken > 0 ? ` · trừ tiền trả trước ${formatMoney(taken)}` : "";
}

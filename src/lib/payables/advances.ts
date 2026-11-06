// The advance settles later receipts at once (0.2 số 100, design D3). Posting
// a goods receipt and cancelling a payment call this in their own
// transaction, after their own locks: it locks the supplier, reads what is
// left and writes ADVANCE allocations. Afterwards a seller with an advance
// is owed nothing.
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { formatMoney, toMoney, type Money } from "@/domain/money";
import { applyAdvances } from "@/domain/payables";
import type { ActivityActor } from "@/lib/activity/actor";
import type { Tx } from "@/lib/contracts/common";

import { openPayableOf, readLedger } from "./balances";
import { insertAllocations, lockSupplier } from "./common";

/** What settleAdvances took from the advance, in ₫ (0 when nothing). */
export async function settleAdvances(
  tx: Tx,
  supplierId: string,
  actor: ActivityActor,
  today: BusinessDate = toBusinessDate(new Date()),
  now?: Date,
): Promise<Money> {
  const locked = await lockSupplier(tx, supplierId);
  const ledger = await readLedger(tx, supplierId, today);
  if (ledger.advances.length === 0) return toMoney(0);
  const open = ledger.payables.filter((row) => row.remaining > 0);
  if (open.length === 0) return toMoney(0);
  const rows = applyAdvances({
    advances: ledger.advances,
    openPayables: open.map(openPayableOf),
  });
  await insertAllocations(
    tx,
    actor,
    locked,
    rows.map((row) => ({
      paymentId: row.sourceKey,
      goodsReceiptId: row.debtKey,
      amount: row.amount,
      mode: "ADVANCE" as const,
    })),
    now,
  );
  return toMoney(rows.reduce((sum, row) => sum + row.amount, 0));
}

/** " · trừ tiền ứng trước x ₫" for the summary of the calling command. */
export function advanceSuffix(taken: Money): string {
  return taken > 0 ? ` · trừ tiền ứng trước ${formatMoney(taken)}` : "";
}

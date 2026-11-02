// Overdue debt of a customer (contracts design D3, 0.2 #15). A placeholder
// until the receivables change: it answers "nothing overdue", and that
// change replaces the body only. Called inside the approval transaction.
import type { OverdueDebt } from "@/domain/contract";

import type { Database } from "@/db/client";

/** Any reader: the transaction of a command or the plain database. */
type Reader = Pick<Database, "select">;

export const overdueDebt: (
  tx: Reader,
  customerId: string,
) => Promise<OverdueDebt> = async () => ({ amount: 0, days: 0 });

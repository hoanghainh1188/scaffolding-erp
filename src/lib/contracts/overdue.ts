// Overdue debt of a customer (contracts design D3, 0.2 #15). A placeholder
// until the receivables change: it answers "nothing overdue", and that
// change replaces the body only. Called inside the approval transaction.
import type { OverdueDebt } from "@/domain/contract";

import type { Tx } from "./common";

export const overdueDebt: (
  tx: Tx,
  customerId: string,
) => Promise<OverdueDebt> = async () => ({ amount: 0, days: 0 });

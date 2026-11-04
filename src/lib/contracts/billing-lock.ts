// Last day of the latest closed billing period of a contract (contracts
// design D11, 0.2 #22; rental-billing design D6). Amendments call it after
// locking the contract, and closing a period locks the contract too, so
// the two never pass each other.
import { eq, max } from "drizzle-orm";

import type { Database } from "@/db/client";
import { billingPeriod } from "@/db/schema";

/** Any reader: the transaction of a command or the plain database. */
type Reader = Pick<Database, "select">;

export async function lastClosedPeriodEnd(
  tx: Reader,
  contractId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ end: max(billingPeriod.periodEnd) })
    .from(billingPeriod)
    .where(eq(billingPeriod.contractId, contractId));
  return row?.end ?? null;
}

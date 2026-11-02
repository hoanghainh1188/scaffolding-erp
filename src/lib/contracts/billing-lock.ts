// Last day of the latest closed billing period of a contract (contracts
// design D11, 0.2 #22). A placeholder until the rental-billing change: no
// period is ever closed yet, so it answers null; that change replaces the
// body only.
import type { Database } from "@/db/client";

/** Any reader: the transaction of a command or the plain database. */
type Reader = Pick<Database, "select">;

export const lastClosedPeriodEnd: (
  tx: Reader,
  contractId: string,
) => Promise<string | null> = async () => null;

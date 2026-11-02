// Whether a contract has a posted delivery note (contracts design D1). A
// placeholder until the deliveries change, which replaces the body only.
import type { Database } from "@/db/client";

/** Any reader: the transaction of a command or the plain database. */
type Reader = Pick<Database, "select">;

export const hasDeliveries: (
  tx: Reader,
  contractId: string,
) => Promise<boolean> = async () => false;

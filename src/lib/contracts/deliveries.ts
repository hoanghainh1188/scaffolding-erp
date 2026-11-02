// Whether a contract has a posted delivery note (contracts design D1). A
// placeholder until the deliveries change, which replaces the body only.
import type { Tx } from "./common";

export const hasDeliveries: (
  tx: Tx,
  contractId: string,
) => Promise<boolean> = async () => false;

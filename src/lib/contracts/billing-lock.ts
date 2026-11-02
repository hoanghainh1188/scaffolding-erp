// Last day of the latest closed billing period of a contract (contracts
// design D11, 0.2 #22). A placeholder until the rental-billing change: no
// period is ever closed yet, so it answers null; that change replaces the
// body only.
import type { Tx } from "./common";

export const lastClosedPeriodEnd: (
  tx: Tx,
  contractId: string,
) => Promise<string | null> = async () => null;

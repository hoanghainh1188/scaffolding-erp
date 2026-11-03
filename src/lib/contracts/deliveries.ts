// Delivery notes seen from a contract (contracts design D1, deliveries
// design D10): a posted note blocks cancelling, and so does one not finished.
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import { deliveryNote } from "@/db/schema";
import { OPEN_DELIVERY_STATUSES } from "@/domain/delivery-note";

/** Any reader: the transaction of a command or the plain database. */
type Reader = Pick<Database, "select">;

/** Whether the contract has a posted delivery note. */
export async function hasDeliveries(
  tx: Reader,
  contractId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: deliveryNote.id })
    .from(deliveryNote)
    .where(
      and(
        eq(deliveryNote.contractId, contractId),
        eq(deliveryNote.status, "POSTED"),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Codes of the notes still waiting or being picked, oldest first. */
export async function openDeliveries(
  tx: Reader,
  contractId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ code: deliveryNote.code })
    .from(deliveryNote)
    .where(
      and(
        eq(deliveryNote.contractId, contractId),
        inArray(deliveryNote.status, [...OPEN_DELIVERY_STATUSES]),
      ),
    )
    .orderBy(asc(deliveryNote.batchNo));
  return rows.map((row) => row.code);
}

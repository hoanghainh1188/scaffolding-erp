// Open purchase orders that still name a supplier or an item, so the
// catalog can refuse to archive them (purchase-orders design D8). Order
// writers hold the supplier and item rows FOR SHARE; an archive holds them
// FOR UPDATE, so the answer is final while the archive runs.
import { and, asc, eq, exists } from "drizzle-orm";

import type { Database } from "@/db/client";
import { purchaseOrder, purchaseOrderLine } from "@/db/schema";

type Reader = Pick<Database, "select">;

const SHOWN = 3;

/** "PO-2026-051, PO-2026-055, PO-2026-056…": at most three codes. */
export function describeOrderCodes(codes: readonly string[]): string {
  const shown = codes.slice(0, SHOWN).join(", ");
  return codes.length > SHOWN ? `${shown}…` : shown;
}

export async function openOrderCodesForSupplier(
  tx: Reader,
  supplierId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ code: purchaseOrder.code })
    .from(purchaseOrder)
    .where(
      and(
        eq(purchaseOrder.supplierId, supplierId),
        eq(purchaseOrder.status, "IN_PROGRESS"),
      ),
    )
    .orderBy(asc(purchaseOrder.code))
    .limit(SHOWN + 1);
  return rows.map((row) => row.code);
}

export async function openOrderCodesForItem(
  tx: Reader,
  itemId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ code: purchaseOrder.code })
    .from(purchaseOrder)
    .where(
      and(
        eq(purchaseOrder.status, "IN_PROGRESS"),
        exists(
          tx
            .select({ id: purchaseOrderLine.id })
            .from(purchaseOrderLine)
            .where(
              and(
                eq(purchaseOrderLine.orderId, purchaseOrder.id),
                eq(purchaseOrderLine.itemId, itemId),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(purchaseOrder.code))
    .limit(SHOWN + 1);
  return rows.map((row) => row.code);
}

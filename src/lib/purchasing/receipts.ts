// What the goods receipts of an order say (purchase-orders design D9). The
// goods-receipt change replaces these bodies with reads of its own tables;
// every rule that depends on "has goods come in yet" goes through here.
import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";

export interface ReceiptSummary {
  /** Goods receipts posted for the order. */
  trips: number;
  /** Quantity received so far by item id, in thousandths of the line unit. */
  receivedByItem: ReadonlyMap<string, number>;
}

const NONE: ReceiptSummary = { trips: 0, receivedByItem: new Map() };

export async function receiptSummaries(
  tx: Pick<Database, "select">,
  orderIds: readonly string[],
): Promise<Map<string, ReceiptSummary>> {
  void tx; // goods-receipt reads its tables through this transaction
  return new Map(orderIds.map((id) => [id, NONE]));
}

export async function receiptSummary(
  tx: Pick<Database, "select">,
  orderId: string,
): Promise<ReceiptSummary> {
  return (await receiptSummaries(tx, [orderId])).get(orderId) ?? NONE;
}

/** SQL for "the order has a goods receipt", for list filters and counts. */
export function hasReceiptsSql(orderId: PgColumn): SQL<boolean> {
  // No goods receipts exist before goods-receipt; keep the column in the SQL
  // so the call sites read the same once the real query lands.
  return sql<boolean>`(${orderId} is null and false)`;
}

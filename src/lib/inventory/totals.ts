// Stock totals that block archiving (inventory-ledger: item-catalog and
// sites-and-locations deltas). Called by the catalog services inside the
// transaction that holds the item or location row FOR UPDATE; postings hold
// those rows FOR SHARE, so the total cannot change underneath.
import { eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { inventoryLedger, item } from "@/db/schema";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  quantityFromDb,
  toQuantity,
} from "@/domain/quantity";

type Executor = Pick<Database, "select">;

export interface StockTotal {
  pieceMilli: number;
  kgMilli: number;
}

async function totals(
  tx: Executor,
  where: ReturnType<typeof eq>,
): Promise<StockTotal> {
  const rows = await tx
    .select({
      unit: item.unit,
      total: sql<string>`coalesce(sum(${inventoryLedger.quantity}), 0)`,
    })
    .from(inventoryLedger)
    .innerJoin(item, eq(item.id, inventoryLedger.itemId))
    .where(where)
    .groupBy(item.unit);
  const total: StockTotal = { pieceMilli: 0, kgMilli: 0 };
  for (const row of rows) {
    const milli = quantityFromDb(row.total, "KG").milli;
    if (row.unit === "KG") total.kgMilli += milli;
    else total.pieceMilli += milli;
  }
  return total;
}

/** Stock of one item, every condition and location. */
export function itemStock(tx: Executor, itemId: string): Promise<StockTotal> {
  return totals(tx, eq(inventoryLedger.itemId, itemId));
}

/** Stock at one location, every item and condition. */
export function locationStock(
  tx: Executor,
  locationId: string,
): Promise<StockTotal> {
  return totals(tx, eq(inventoryLedger.locationId, locationId));
}

export function isEmpty(total: StockTotal): boolean {
  return total.pieceMilli === 0 && total.kgMilli === 0;
}

/** "1.840 cái", "12.850,5 kg", "60 cái và 12,5 kg". */
export function describeStock(total: StockTotal): string {
  const parts: string[] = [];
  if (total.pieceMilli !== 0) {
    parts.push(
      `${formatQuantity(toQuantity(total.pieceMilli, "PIECE"))} ${QUANTITY_UNIT_LABELS.PIECE}`,
    );
  }
  if (total.kgMilli !== 0) {
    parts.push(
      `${formatQuantity(toQuantity(total.kgMilli, "KG"))} ${QUANTITY_UNIT_LABELS.KG}`,
    );
  }
  return parts.join(" và ");
}

// Stock totals that block archiving (inventory-ledger: item-catalog and
// sites-and-locations deltas). Called by the catalog services inside the
// transaction that holds the item or location row FOR UPDATE; postings hold
// those rows FOR SHARE, so the total cannot change underneath.
import { eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { inventoryLedger, item } from "@/db/schema";
import {
  QUANTITY_UNIT_LABELS,
  QUANTITY_UNITS,
  formatQuantity,
  quantityFromDb,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";

import { unitFromDb } from "./unit";

type Executor = Pick<Database, "select">;

/**
 * Stock in thousandths per unit, non-zero units only: cái, bó, m and kg are
 * never added together.
 */
export type StockTotal = Readonly<Partial<Record<QuantityUnit, number>>>;

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
  const entries = rows
    .map((row) => {
      const unit = unitFromDb(row.unit);
      return [unit, quantityFromDb(row.total, unit).milli] as const;
    })
    .filter(([, milli]) => milli !== 0);
  return Object.fromEntries(entries);
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
  return QUANTITY_UNITS.every((unit) => (total[unit] ?? 0) === 0);
}

/** "1.840 cái", "12.850,5 kg", "60 cái và 12,5 kg", "60 cái, 5 bó và 12 m". */
export function describeStock(total: StockTotal): string {
  const parts = QUANTITY_UNITS.flatMap((unit) => {
    const milli = total[unit] ?? 0;
    return milli === 0
      ? []
      : [
          `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`,
        ];
  });
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} và ${parts.at(-1)}`;
}

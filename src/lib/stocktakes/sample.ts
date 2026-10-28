// Sample stocktake for `npm run db:seed:dev` (stocktake design D16): a
// session waiting for approval at the first yard, off the book like D13.
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { inventoryLedger, item, itemGroup, stocktake } from "@/db/schema";
import type { Condition } from "@/domain/condition";
import { quantityFromDb, quantityToDb, toQuantity } from "@/domain/quantity";
import type { Actor } from "@/lib/catalog/common";
import { defaultRepairLocation } from "@/lib/repairs/orders";

import { startStocktake, submitStocktake } from "./sessions";

/** The D13 differences, in pieces. */
const OFF_BOOK: Readonly<Record<string, number>> = {
  "GG-CH|GOOD": -30,
  "GG-CH|NEEDS_REPAIR": 10,
  "GG-K15|GOOD": -8,
  "GG-K17|GOOD": -4,
  "PK-KU|GOOD": 2,
};

const SAMPLE_START_ID = "5a1e0000-0000-4000-8000-00000000c0de";
const SAMPLE_SUBMIT_ID = "5a1e0000-0000-4000-8000-00000000c0df";

/** Seeds once; returns the number of sessions added. */
export async function seedStocktakes(
  db: Database,
  counter: Actor,
): Promise<number> {
  const [any] = await db.select({ id: stocktake.id }).from(stocktake).limit(1);
  if (any) return 0;
  const yard = await defaultRepairLocation(db);
  const groups = await db
    .select({ id: itemGroup.id })
    .from(itemGroup)
    .where(inArray(itemGroup.name, ["Giàn giáo", "Phụ kiện"]));
  if (!yard || groups.length === 0) return 0;
  const started = await startStocktake(db, counter, {
    clientStartId: SAMPLE_START_ID,
    locationId: yard.id,
    groupIds: groups.map((group) => group.id),
  });
  if (!started.ok) return 0;
  const stock = await db
    .select({
      itemId: inventoryLedger.itemId,
      code: item.code,
      condition: inventoryLedger.condition,
      total: sql<string>`sum(${inventoryLedger.quantity})::text`,
    })
    .from(inventoryLedger)
    .innerJoin(item, eq(item.id, inventoryLedger.itemId))
    .where(
      and(
        eq(inventoryLedger.locationId, yard.id),
        inArray(
          item.groupId,
          groups.map((group) => group.id),
        ),
        eq(item.status, "ACTIVE"),
      ),
    )
    .groupBy(inventoryLedger.itemId, item.code, inventoryLedger.condition)
    .having(sql`sum(${inventoryLedger.quantity}) <> 0`)
    .orderBy(asc(item.code));
  const byItem = new Map<
    string,
    { condition: Condition; quantity: string }[]
  >();
  for (const row of stock) {
    const off = OFF_BOOK[`${row.code}|${row.condition}`] ?? 0;
    const milli = Math.max(
      0,
      quantityFromDb(row.total, "KG").milli + off * 1000,
    );
    const lines = byItem.get(row.itemId) ?? [];
    lines.push({
      condition: row.condition as Condition,
      quantity: quantityToDb(toQuantity(milli, "KG")),
    });
    byItem.set(row.itemId, lines);
  }
  const now = new Date().toISOString();
  const sent = await submitStocktake(db, counter, started.data.code, {
    submissionId: SAMPLE_SUBMIT_ID,
    deviceNow: now,
    items: [...byItem].map(([itemId, lines]) => ({
      itemId,
      startedAt: now,
      countedAt: now,
      lines,
    })),
  });
  return sent.ok ? 1 : 0;
}

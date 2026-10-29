// D11 stock card of one item, read straight from the ledger
// (inventory-ledger spec stock-views, design D6).
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  inventoryCost,
  inventoryLedger,
  item,
  location,
  site,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import type { LocationType } from "@/domain/location-type";
import { quantityFromDb, type QuantityUnit } from "@/domain/quantity";

export const CARD_PLACES = ["yard", "workshop", "sites"] as const;
export type CardPlace = (typeof CARD_PLACES)[number];

const PLACE_TYPES: Readonly<Record<CardPlace, LocationType>> = {
  yard: "YARD",
  workshop: "WORKSHOP",
  sites: "SITE",
};

export interface CardFilter {
  /** null: every condition (prices are then not shown). */
  condition: Condition | null;
  place: CardPlace;
  /** With place "sites": one site only. */
  siteCode?: string;
  from: BusinessDate;
  to: BusinessDate;
}

export interface CardLine {
  id: number;
  date: string;
  documentType: string;
  documentId: string | null;
  documentCode: string;
  description: string;
  movement: string;
  /** Thousandths of the item's unit; one of in / out is 0. */
  in: number;
  out: number;
  balance: number;
  unitCost: number | null;
  avgAfter: number | null;
}

export interface StockCard {
  item: {
    id: string;
    code: string;
    name: string;
    unit: QuantityUnit;
    standardWeightKg: string | null;
  };
  site: { code: string; name: string } | null;
  opening: number;
  inflow: number;
  outflow: number;
  closing: number;
  /** Current average of the chosen condition; null for "Tất cả". */
  currentAvg: number | null;
  /** Average at the start of the period (the "Tồn đầu kỳ" row). */
  openingAvg: number | null;
  lines: CardLine[];
}

const milli = (value: string | null | undefined) =>
  quantityFromDb(value ?? "0", "KG").milli;

/** The card, or null when the item or the site does not exist. */
export async function getStockCard(
  db: Database,
  itemCode: string,
  filter: CardFilter,
): Promise<StockCard | null> {
  const [found] = await db
    .select({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      standardWeightKg: item.standardWeightKg,
    })
    .from(item)
    .where(eq(item.code, itemCode));
  if (!found) return null;

  let chosenSite: { code: string; name: string; locationId: string } | null =
    null;
  if (filter.place === "sites" && filter.siteCode) {
    const [row] = await db
      .select({ code: site.code, name: site.name, locationId: site.locationId })
      .from(site)
      .where(eq(site.code, filter.siteCode));
    if (!row) return null;
    chosenSite = row;
  }

  const places = chosenSite
    ? [chosenSite.locationId]
    : (
        await db
          .select({ id: location.id })
          .from(location)
          .where(eq(location.type, PLACE_TYPES[filter.place]))
      ).map((row) => row.id);

  const scope: SQL[] = [eq(inventoryLedger.itemId, found.id)];
  if (filter.condition) {
    scope.push(eq(inventoryLedger.condition, filter.condition));
  }
  // REVALUE lines have no location: the average is company-wide, so they
  // show under every place filter (0.2 #35).
  scope.push(
    places.length > 0
      ? or(
          inArray(inventoryLedger.locationId, places),
          isNull(inventoryLedger.locationId),
        )!
      : isNull(inventoryLedger.locationId),
  );

  const [before] = await db
    .select({
      total: sql<string>`coalesce(sum(${inventoryLedger.quantity}), 0)`,
    })
    .from(inventoryLedger)
    .where(and(...scope, lt(inventoryLedger.businessDate, filter.from)));
  const rows = await db
    .select({
      id: inventoryLedger.id,
      date: inventoryLedger.businessDate,
      documentType: inventoryLedger.documentType,
      documentId: inventoryLedger.documentId,
      documentCode: inventoryLedger.documentCode,
      description: inventoryLedger.description,
      movement: inventoryLedger.movement,
      quantity: inventoryLedger.quantity,
      unitCost: inventoryLedger.unitCost,
      avgAfter: inventoryLedger.avgCostAfter,
    })
    .from(inventoryLedger)
    .where(
      and(
        ...scope,
        gte(inventoryLedger.businessDate, filter.from),
        lte(inventoryLedger.businessDate, filter.to),
      ),
    )
    .orderBy(asc(inventoryLedger.businessDate), asc(inventoryLedger.id));

  const opening = milli(before?.total);
  let balance = opening;
  let inflow = 0;
  let outflow = 0;
  const priced = filter.condition !== null;
  const lines = rows.map((row): CardLine => {
    const quantity = milli(row.quantity);
    balance += quantity;
    if (quantity > 0) inflow += quantity;
    else outflow -= quantity;
    return {
      id: row.id,
      date: row.date,
      documentType: row.documentType,
      documentId: row.documentId,
      documentCode: row.documentCode,
      description: row.description,
      movement: row.movement,
      in: Math.max(quantity, 0),
      out: Math.max(-quantity, 0),
      balance,
      unitCost: priced && row.movement !== "REVALUE" ? row.unitCost : null,
      avgAfter: priced ? row.avgAfter : null,
    };
  });

  let currentAvg: number | null = null;
  let openingAvg: number | null = null;
  if (filter.condition) {
    // The average is per (item + condition), whatever the location filter.
    const [last] = await db
      .select({ avg: inventoryLedger.avgCostAfter })
      .from(inventoryLedger)
      .where(
        and(
          eq(inventoryLedger.itemId, found.id),
          eq(inventoryLedger.condition, filter.condition),
          lt(inventoryLedger.businessDate, filter.from),
        ),
      )
      .orderBy(desc(inventoryLedger.id))
      .limit(1);
    openingAvg = last?.avg ?? null;
    const [cost] = await db
      .select({ avg: inventoryCost.avgCost })
      .from(inventoryCost)
      .where(
        and(
          eq(inventoryCost.itemId, found.id),
          eq(inventoryCost.condition, filter.condition),
        ),
      );
    currentAvg = cost?.avg ?? null;
  }

  return {
    item: { ...found, unit: found.unit as QuantityUnit },
    site: chosenSite ? { code: chosenSite.code, name: chosenSite.name } : null,
    opening,
    inflow,
    outflow,
    closing: balance,
    currentAvg,
    openingAvg,
    lines,
  };
}

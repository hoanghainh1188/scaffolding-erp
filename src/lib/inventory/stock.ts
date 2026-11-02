// D10 stock overview, read straight from the ledger (inventory-ledger
// spec stock-views, design D5, D6). Averages come from inventory_cost.
import { and, asc, eq, ilike, ne, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  inventoryCost,
  inventoryLedger,
  item,
  itemGroup,
  location,
  site,
} from "@/db/schema";
import { lineAmount } from "@/domain/average-cost";
import { CONDITIONS, type Condition } from "@/domain/condition";
import { toMoney } from "@/domain/money";
import {
  hasStandardWeight,
  quantityFromDb,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { toSearchText } from "@/domain/search-text";
import { unitsToKg } from "@/domain/weight-conversion";
import { escapeLike } from "@/lib/catalog/items";

import { unitFromDb } from "./unit";

/** Every quantity in thousandths of the item's unit. */
export interface StockRow {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  groupId: string;
  groupName: string;
  /** Yard stock (all yards) split by condition. */
  yard: Record<Condition, number>;
  workshop: number;
  sites: number;
  total: number;
  /** Σ quantity × current average per condition, in đồng. */
  value: number;
}

/** Thousandths per unit; cái, bó and m are never added together. */
export type QuantityByUnit = Partial<Record<QuantityUnit, number>>;

export interface StockCards {
  totalValue: number;
  /** Chờ sửa at yards and workshops, items with a standard weight, by unit. */
  needsRepair: QuantityByUnit;
  /** Scrap at yards in kg: kg items plus quantity × standard weight. */
  scrapKgMilli: number;
  convertedKgMilli: number;
  /** Scrap counted in its own unit that was converted to kg, by unit. */
  converted: QuantityByUnit;
}

function addTo(target: QuantityByUnit, unit: QuantityUnit, milli: number) {
  target[unit] = (target[unit] ?? 0) + milli;
}

export interface StockFilter {
  q?: string;
  groupId?: string;
}

const emptyYard = (): Record<Condition, number> => ({
  NEW: 0,
  GOOD: 0,
  NEEDS_REPAIR: 0,
  SCRAP: 0,
});

interface Bucket {
  itemId: string;
  condition: Condition;
  type: "YARD" | "WORKSHOP" | "SITE";
  milli: number;
}

async function buckets(db: Database): Promise<Bucket[]> {
  const rows = await db
    .select({
      itemId: inventoryLedger.itemId,
      condition: inventoryLedger.condition,
      type: location.type,
      total: sql<string>`sum(${inventoryLedger.quantity})`,
    })
    .from(inventoryLedger)
    .innerJoin(location, eq(location.id, inventoryLedger.locationId))
    .groupBy(inventoryLedger.itemId, inventoryLedger.condition, location.type);
  return rows.map((row) => ({
    itemId: row.itemId,
    condition: row.condition as Condition,
    type: row.type as Bucket["type"],
    milli: quantityFromDb(row.total, "KG").milli,
  }));
}

/** The D10 table (active items, filtered) and its cards (every item). */
export async function getStockOverview(
  db: Database,
  filter: StockFilter = {},
): Promise<{ rows: StockRow[]; cards: StockCards }> {
  const conditions: SQL[] = [eq(item.status, "ACTIVE")];
  if (filter.groupId) conditions.push(eq(item.groupId, filter.groupId));
  const q = toSearchText(filter.q);
  if (q) conditions.push(ilike(item.searchText, `%${escapeLike(q)}%`));

  const [items, allItems, costs, stock] = await Promise.all([
    db
      .select({
        id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        groupId: item.groupId,
        groupName: itemGroup.name,
      })
      .from(item)
      .innerJoin(itemGroup, eq(itemGroup.id, item.groupId))
      .where(and(...conditions))
      .orderBy(asc(itemGroup.sortOrder), asc(itemGroup.name), asc(item.name)),
    db
      .select({
        id: item.id,
        unit: item.unit,
        weight: item.standardWeightKg,
      })
      .from(item),
    db
      .select({
        itemId: inventoryCost.itemId,
        condition: inventoryCost.condition,
        avg: inventoryCost.avgCost,
      })
      .from(inventoryCost),
    buckets(db),
  ]);

  const avg = new Map(
    costs.map((c) => [`${c.itemId}|${c.condition}`, c.avg ?? 0]),
  );
  const valueOf = (bucket: Bucket) =>
    lineAmount(
      bucket.milli,
      toMoney(avg.get(`${bucket.itemId}|${bucket.condition}`) ?? 0),
    );

  const byItem = new Map<string, Bucket[]>();
  for (const bucket of stock) {
    byItem.set(bucket.itemId, [...(byItem.get(bucket.itemId) ?? []), bucket]);
  }

  const rows = items.map((row): StockRow => {
    const yard = emptyYard();
    let workshop = 0;
    let sites = 0;
    let value = 0;
    for (const bucket of byItem.get(row.id) ?? []) {
      if (bucket.type === "YARD") yard[bucket.condition] += bucket.milli;
      else if (bucket.type === "WORKSHOP") workshop += bucket.milli;
      else sites += bucket.milli;
      value += valueOf(bucket);
    }
    const total =
      CONDITIONS.reduce((sum, condition) => sum + yard[condition], 0) +
      workshop +
      sites;
    return {
      itemId: row.id,
      code: row.code,
      name: row.name,
      unit: unitFromDb(row.unit),
      groupId: row.groupId,
      groupName: row.groupName,
      yard,
      workshop,
      sites,
      total,
      value,
    };
  });

  const info = new Map(allItems.map((row) => [row.id, row]));
  const cards: StockCards = {
    totalValue: 0,
    needsRepair: {},
    scrapKgMilli: 0,
    convertedKgMilli: 0,
    converted: {},
  };
  for (const bucket of stock) {
    cards.totalValue += valueOf(bucket);
    const meta = info.get(bucket.itemId);
    if (!meta) continue;
    const unit = unitFromDb(meta.unit);
    if (
      bucket.condition === "NEEDS_REPAIR" &&
      bucket.type !== "SITE" &&
      hasStandardWeight(unit)
    ) {
      addTo(cards.needsRepair, unit, bucket.milli);
    }
    if (bucket.condition === "SCRAP" && bucket.type === "YARD") {
      if (!hasStandardWeight(unit)) {
        cards.scrapKgMilli += bucket.milli;
      } else if (meta.weight) {
        const kg = unitsToKg(
          toQuantity(bucket.milli, unit),
          quantityFromDb(meta.weight, "KG"),
        ).milli;
        cards.scrapKgMilli += kg;
        cards.convertedKgMilli += kg;
        addTo(cards.converted, unit, bucket.milli);
      }
    }
  }
  return { rows, cards };
}

export interface SiteStock {
  locationId: string;
  siteCode: string;
  siteName: string;
  /** Thousandths of the item's unit, every condition. */
  quantity: number;
}

/** Where an item is at sites (D10 "Tại công trình" popover). */
export async function getItemSites(
  db: Database,
  itemId: string,
): Promise<SiteStock[]> {
  const rows = await db
    .select({
      locationId: site.locationId,
      siteCode: site.code,
      siteName: site.name,
      total: sql<string>`sum(${inventoryLedger.quantity})`,
    })
    .from(inventoryLedger)
    .innerJoin(site, eq(site.locationId, inventoryLedger.locationId))
    .where(eq(inventoryLedger.itemId, itemId))
    .groupBy(site.locationId, site.code, site.name)
    .having(ne(sql`sum(${inventoryLedger.quantity})`, 0))
    .orderBy(asc(site.code));
  return rows.map((row) => ({
    locationId: row.locationId,
    siteCode: row.siteCode,
    siteName: row.siteName,
    quantity: quantityFromDb(row.total, "KG").milli,
  }));
}

/** Every item's sites in one query, for the whole D10 table. */
export async function getSiteBreakdown(
  db: Database,
): Promise<Map<string, SiteStock[]>> {
  const rows = await db
    .select({
      itemId: inventoryLedger.itemId,
      locationId: site.locationId,
      siteCode: site.code,
      siteName: site.name,
      total: sql<string>`sum(${inventoryLedger.quantity})`,
    })
    .from(inventoryLedger)
    .innerJoin(site, eq(site.locationId, inventoryLedger.locationId))
    .groupBy(inventoryLedger.itemId, site.locationId, site.code, site.name)
    .having(ne(sql`sum(${inventoryLedger.quantity})`, 0))
    .orderBy(asc(site.code));
  const byItem = new Map<string, SiteStock[]>();
  for (const row of rows) {
    const list = byItem.get(row.itemId) ?? [];
    list.push({
      locationId: row.locationId,
      siteCode: row.siteCode,
      siteName: row.siteName,
      quantity: quantityFromDb(row.total, "KG").milli,
    });
    byItem.set(row.itemId, list);
  }
  return byItem;
}

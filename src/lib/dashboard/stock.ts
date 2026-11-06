// Stock on D1 (dashboard-basic design D8, spec dashboard): goods on site
// in pieces and tons by site and region, and stock by condition with yards
// and workshops together. Read from the ledger, as D10 does.
import { and, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { inventoryLedger, item, location, site } from "@/db/schema";
import { CONDITIONS, type Condition } from "@/domain/condition";
import {
  DASHBOARD_LIST_LIMITS,
  onSiteTotals,
  regionTotals,
  type OnSiteLine,
  type RegionRow,
  type SiteTotals,
} from "@/domain/dashboard";
import { lineWeightKgMilli } from "@/domain/landed-cost";
import { quantityFromDb, type QuantityUnit } from "@/domain/quantity";
import { stockBuckets } from "@/lib/inventory/stock";
import { unitFromDb } from "@/lib/inventory/unit";

type Reader = Pick<Database, "select">;

/** One item held at one site (every contract there together). */
export interface SiteItemLine extends OnSiteLine {
  siteId: string;
  itemId: string;
}

/** What every site holds now, by item, from the ledger. */
export async function siteItemLines(
  db: Reader,
  siteIds?: readonly string[],
): Promise<SiteItemLine[]> {
  const where = [eq(location.type, "SITE")];
  if (siteIds) {
    if (siteIds.length === 0) return [];
    where.push(inArray(site.id, [...siteIds]));
  }
  const rows = await db
    .select({
      siteId: site.id,
      itemId: inventoryLedger.itemId,
      unit: item.unit,
      standardWeightKg: item.standardWeightKg,
      total: sql<string>`sum(${inventoryLedger.quantity})`,
    })
    .from(inventoryLedger)
    .innerJoin(location, eq(location.id, inventoryLedger.locationId))
    .innerJoin(site, eq(site.locationId, location.id))
    .innerJoin(item, eq(item.id, inventoryLedger.itemId))
    .where(and(...where))
    .groupBy(site.id, inventoryLedger.itemId, item.unit, item.standardWeightKg);
  return rows
    .map((row) => {
      const unit = unitFromDb(row.unit);
      return {
        siteId: row.siteId,
        itemId: row.itemId,
        unit,
        milli: quantityFromDb(row.total, unit).milli,
        standardWeightKg: row.standardWeightKg,
      };
    })
    .filter((row) => row.milli !== 0);
}

export interface OnSiteSummary {
  total: RegionRow;
  regions: RegionRow[];
}

/** Hàng ở ngoài: pieces, tons and sites, by region (0.2 #97). */
export async function onSiteSummary(db: Reader): Promise<OnSiteSummary> {
  const [lines, sites] = await Promise.all([
    siteItemLines(db),
    db.select({ id: site.id, province: site.province }).from(site),
  ]);
  const provinceOf = new Map(sites.map((row) => [row.id, row.province]));
  const bySite = new Map<string, SiteItemLine[]>();
  for (const line of lines) {
    bySite.set(line.siteId, [...(bySite.get(line.siteId) ?? []), line]);
  }
  const totals: SiteTotals[] = [...bySite].map(([siteId, own]) => ({
    siteId,
    province: provinceOf.get(siteId) ?? null,
    ...onSiteTotals(own),
  }));
  const { rows, total } = regionTotals(totals);
  return { total, regions: rows };
}

/** One item of the "Tồn kho theo tình trạng" block. */
export interface ConditionRow {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  /** Yards and workshops together, by condition. */
  stock: Record<Condition, number>;
  onSite: number;
}

const emptyStock = (): Record<Condition, number> => ({
  NEW: 0,
  GOOD: 0,
  NEEDS_REPAIR: 0,
  SCRAP: 0,
});

/** Items with stock, the heaviest first, at most `limit` (design D8). */
export async function stockByCondition(
  db: Database,
  limit: number = DASHBOARD_LIST_LIMITS.stock,
): Promise<ConditionRow[]> {
  const [buckets, items] = await Promise.all([
    stockBuckets(db),
    db
      .select({
        id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        weight: item.standardWeightKg,
      })
      .from(item),
  ]);
  const info = new Map(items.map((row) => [row.id, row]));
  const rows = new Map<string, ConditionRow & { kg: number }>();
  for (const bucket of buckets) {
    const meta = info.get(bucket.itemId);
    if (!meta) continue;
    const unit = unitFromDb(meta.unit);
    const seen = rows.get(bucket.itemId) ?? {
      itemId: bucket.itemId,
      code: meta.code,
      name: meta.name,
      unit,
      stock: emptyStock(),
      onSite: 0,
      kg: 0,
    };
    const stock =
      bucket.type === "SITE"
        ? seen.stock
        : {
            ...seen.stock,
            [bucket.condition]: seen.stock[bucket.condition] + bucket.milli,
          };
    rows.set(bucket.itemId, {
      ...seen,
      stock,
      onSite: seen.onSite + (bucket.type === "SITE" ? bucket.milli : 0),
      kg: seen.kg + lineWeightKgMilli(unit, bucket.milli, meta.weight),
    });
  }
  return [...rows.values()]
    .filter(
      (row) =>
        row.onSite !== 0 ||
        CONDITIONS.some((condition) => row.stock[condition] !== 0),
    )
    .sort((a, b) => b.kg - a.kg || a.code.localeCompare(b.code))
    .slice(0, limit)
    .map((row) => ({
      itemId: row.itemId,
      code: row.code,
      name: row.name,
      unit: row.unit,
      stock: row.stock,
      onSite: row.onSite,
    }));
}

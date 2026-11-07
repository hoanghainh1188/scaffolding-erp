// Rental stock of D15 from the ledger (management-reports design D4; spec
// fleet-metrics; 0.2 số 108, số 109, số 114). Three grouped reads: the New and
// Good stock before the range, its change by Vietnam day in the range, and
// what return notes brought back lost, as scrap or for repair. Lines are
// joined to their location, so REVALUE lines (no location, 0.2 số 35) never
// count. Only equipment items: supplies are not rental stock
// (repair-work-orders, 0.2 số 125). Nothing is stored.
import { and, between, eq, inArray, lt, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { inventoryLedger, item, itemGroup, location } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import {
  dailyFleet,
  type FleetBalance,
  type FleetDelta,
  type FleetItem,
  type FleetMonth,
  type LossKind,
  type LossSum,
} from "@/domain/fleet-metrics";
import { LEDGER_DOCUMENTS } from "@/domain/gross-profit";
import { quantityFromDb } from "@/domain/quantity";
import type { DateRange } from "@/domain/report-period";
import { unitFromDb } from "@/lib/inventory/unit";

type Reader = Pick<Database, "select">;

const RENTAL = ["NEW", "GOOD"];
const onSite = sql<boolean>`${location.type} = 'SITE'`;

export interface ReportFleet {
  items: FleetItem[];
  months: FleetMonth[];
  losses: LossSum[];
}

async function fleetItems(db: Reader): Promise<FleetItem[]> {
  const rows = await db
    .select({
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      standardWeightKg: item.standardWeightKg,
    })
    .from(item)
    .innerJoin(itemGroup, eq(itemGroup.id, item.groupId))
    // Supplies (que hàn, sơn…) are not rental stock (0.2 số 125).
    .where(eq(itemGroup.category, "EQUIPMENT"))
    .orderBy(item.code);
  return rows.map((row) => ({ ...row, unit: unitFromDb(row.unit) }));
}

async function openingStock(
  db: Reader,
  before: BusinessDate,
  units: ReadonlyMap<string, FleetItem>,
): Promise<FleetBalance[]> {
  const rows = await db
    .select({
      itemId: inventoryLedger.itemId,
      onSite,
      quantity: sql<string>`sum(${inventoryLedger.quantity})`,
    })
    .from(inventoryLedger)
    .innerJoin(location, eq(location.id, inventoryLedger.locationId))
    .where(
      and(
        lt(inventoryLedger.businessDate, before),
        inArray(inventoryLedger.condition, RENTAL),
      ),
    )
    .groupBy(inventoryLedger.itemId, location.type);
  return rows
    .filter((row) => units.has(row.itemId))
    .map((row) => toBalance(row, units));
}

function toBalance(
  row: { itemId: string; onSite: boolean; quantity: string },
  units: ReadonlyMap<string, FleetItem>,
): FleetBalance {
  const unit = units.get(row.itemId)?.unit ?? "KG";
  return {
    itemId: row.itemId,
    onSite: row.onSite,
    milli: quantityFromDb(row.quantity, unit).milli,
  };
}

async function dailyChanges(
  db: Reader,
  range: DateRange,
  units: ReadonlyMap<string, FleetItem>,
): Promise<FleetDelta[]> {
  const rows = await db
    .select({
      date: inventoryLedger.businessDate,
      itemId: inventoryLedger.itemId,
      onSite,
      quantity: sql<string>`sum(${inventoryLedger.quantity})`,
    })
    .from(inventoryLedger)
    .innerJoin(location, eq(location.id, inventoryLedger.locationId))
    .where(
      and(
        between(inventoryLedger.businessDate, range.from, range.to),
        inArray(inventoryLedger.condition, RENTAL),
      ),
    )
    .groupBy(
      inventoryLedger.businessDate,
      inventoryLedger.itemId,
      location.type,
    );
  return rows
    .filter((row) => units.has(row.itemId))
    .map((row) => ({
      date: row.date as BusinessDate,
      ...toBalance(row, units),
    }));
}

/** What return notes brought back lost, as scrap or for repair. */
async function returnLosses(
  db: Reader,
  range: DateRange,
  units: ReadonlyMap<string, FleetItem>,
): Promise<LossSum[]> {
  const month = sql<string>`to_char(${inventoryLedger.businessDate}, 'YYYY-MM')`;
  const kind = sql<LossKind>`case when ${inventoryLedger.movement} = 'LOSS_OUT' then 'loss' when ${inventoryLedger.condition} = 'SCRAP' then 'scrap' else 'repair' end`;
  const rows = await db
    .select({
      month,
      itemId: inventoryLedger.itemId,
      kind,
      quantity: sql<string>`sum(abs(${inventoryLedger.quantity}))`,
    })
    .from(inventoryLedger)
    .innerJoin(location, eq(location.id, inventoryLedger.locationId))
    .where(
      and(
        eq(inventoryLedger.documentType, LEDGER_DOCUMENTS.return),
        between(inventoryLedger.businessDate, range.from, range.to),
        sql`(${inventoryLedger.movement} = 'LOSS_OUT' or (${inventoryLedger.movement} = 'RETURN_IN' and ${inventoryLedger.condition} in ('SCRAP', 'NEEDS_REPAIR')))`,
      ),
    )
    .groupBy(month, inventoryLedger.itemId, kind);
  return rows
    .filter((row) => units.has(row.itemId))
    .map((row) => ({
      month: row.month,
      itemId: row.itemId,
      kind: row.kind,
      milli: quantityFromDb(row.quantity, units.get(row.itemId)?.unit ?? "KG")
        .milli,
    }));
}

/** Day sums by month and returned losses of `range`. */
export async function reportFleet(
  db: Reader,
  range: DateRange,
): Promise<ReportFleet> {
  const items = await fleetItems(db);
  const units = new Map(items.map((entry) => [entry.itemId, entry]));
  const [opening, deltas, losses] = await Promise.all([
    openingStock(db, range.from, units),
    dailyChanges(db, range, units),
    returnLosses(db, range, units),
  ]);
  return {
    items,
    months: dailyFleet(opening, deltas, range.from, range.to),
    losses,
  };
}

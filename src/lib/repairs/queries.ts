// Reading repair slips (simple-repair design D10, D11): the list, one slip
// with its ledger figures once posted, and the needs-repair stock D12 adds
// lines from.
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  inventoryCost,
  inventoryLedger,
  item,
  location,
  repairOrder,
  repairOrderLine,
  user,
} from "@/db/schema";
import type { Condition } from "@/domain/condition";
import { toMoney, type Money } from "@/domain/money";
import { quantityFromDb, type QuantityUnit } from "@/domain/quantity";
import { REPAIRABLE_UNITS } from "@/domain/repair-order";
import { unitFromDb } from "@/lib/inventory/unit";
import { currentScrapPrice } from "@/lib/receiving/scrap-price";

import type { RepairStatus } from "./labels";

export type { RepairStatus } from "./labels";

const milli = (value: string | null) =>
  value === null ? 0 : quantityFromDb(value, "KG").milli;

const fromPlace = alias(location, "from_place");
const toPlace = alias(location, "to_place");
const creator = alias(user, "creator");
const poster = alias(user, "poster");

export interface RepairSummary {
  code: string;
  status: RepairStatus;
  repairDate: string;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  lineCount: number;
  goodMilli: number;
  scrapMilli: number;
  cost: Money;
  loss: Money;
  createdAt: Date;
}

/** Newest first (spec "Danh sách phiếu sửa chữa"). */
export async function listRepairOrders(
  db: Database,
  filter: { status?: RepairStatus } = {},
): Promise<RepairSummary[]> {
  const where: SQL[] = [];
  if (filter.status) where.push(eq(repairOrder.status, filter.status));
  const totals = db
    .select({
      orderId: repairOrderLine.orderId,
      lineCount: sql<number>`count(*)::int`.as("line_count"),
      good: sql<string>`sum(${repairOrderLine.quantityGood})`.as("good"),
      scrap: sql<string>`sum(${repairOrderLine.quantityScrap})`.as("scrap"),
      cost: sql<string>`sum(${repairOrderLine.repairCost})`.as("cost"),
      loss: sql<string>`coalesce(sum(${repairOrderLine.lossAmount}), 0)`.as(
        "loss",
      ),
    })
    .from(repairOrderLine)
    .groupBy(repairOrderLine.orderId)
    .as("totals");
  const rows = await db
    .select({
      code: repairOrder.code,
      status: repairOrder.status,
      repairDate: repairOrder.repairDate,
      fromCode: fromPlace.code,
      fromName: fromPlace.name,
      toCode: toPlace.code,
      toName: toPlace.name,
      lineCount: totals.lineCount,
      good: totals.good,
      scrap: totals.scrap,
      cost: totals.cost,
      loss: totals.loss,
      createdAt: repairOrder.createdAt,
    })
    .from(repairOrder)
    .innerJoin(fromPlace, eq(fromPlace.id, repairOrder.fromLocationId))
    .innerJoin(toPlace, eq(toPlace.id, repairOrder.toLocationId))
    .leftJoin(totals, eq(totals.orderId, repairOrder.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(repairOrder.createdAt), desc(repairOrder.code));
  return rows.map((row) => ({
    code: row.code,
    status: row.status as RepairStatus,
    repairDate: row.repairDate,
    fromCode: row.fromCode,
    fromName: row.fromName,
    toCode: row.toCode,
    toName: row.toName,
    lineCount: row.lineCount ?? 0,
    goodMilli: milli(row.good),
    scrapMilli: milli(row.scrap),
    cost: toMoney(Number(row.cost ?? 0)),
    loss: toMoney(Number(row.loss ?? 0)),
    createdAt: row.createdAt,
  }));
}

export interface RepairLineRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  standardWeightKg: string | null;
  takenMilli: number;
  goodMilli: number;
  scrapMilli: number;
  repairCost: Money;
  loss: Money | null;
}

/** What the ledger booked for one line of a posted slip. */
export interface PostedLineFigures {
  itemId: string;
  /** B: the unit cost of the REPAIR_OUT line. */
  needsRepairAvg: Money;
  goodAmount: Money | null;
  goodUnitCost: Money | null;
  goodAvgBefore: Money | null;
  goodAvgAfter: Money | null;
  scrapAmount: Money | null;
  scrapAvgAfter: Money | null;
}

export interface RepairDetail {
  id: string;
  code: string;
  status: RepairStatus;
  repairDate: string;
  repairedBy: string | null;
  note: string | null;
  fromLocationId: string;
  fromCode: string;
  fromName: string;
  toLocationId: string;
  toCode: string;
  toName: string;
  scrapPriceUsed: Money | null;
  confirmedNote: string | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  postedByName: string | null;
  postedAt: Date | null;
  lines: RepairLineRow[];
  posted: PostedLineFigures[];
}

const money = (value: number | null) =>
  value === null ? null : toMoney(value);

/** The average of (item, condition) just before a ledger line. */
async function averageBefore(
  db: Database,
  itemId: string,
  condition: Condition,
  ledgerId: number,
): Promise<Money | null> {
  const [row] = await db
    .select({ avg: inventoryLedger.avgCostAfter })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, itemId),
        eq(inventoryLedger.condition, condition),
        lt(inventoryLedger.id, ledgerId),
      ),
    )
    .orderBy(desc(inventoryLedger.id))
    .limit(1);
  return money(row?.avg ?? null);
}

async function postedFigures(
  db: Database,
  postingId: string,
): Promise<PostedLineFigures[]> {
  const rows = await db
    .select({
      id: inventoryLedger.id,
      itemId: inventoryLedger.itemId,
      condition: inventoryLedger.condition,
      movement: inventoryLedger.movement,
      unitCost: inventoryLedger.unitCost,
      amount: inventoryLedger.amount,
      avgAfter: inventoryLedger.avgCostAfter,
    })
    .from(inventoryLedger)
    .where(eq(inventoryLedger.postingId, postingId))
    .orderBy(asc(inventoryLedger.id));
  const byItem = new Map<string, PostedLineFigures>();
  for (const row of rows) {
    const figures: PostedLineFigures = byItem.get(row.itemId) ?? {
      itemId: row.itemId,
      needsRepairAvg: toMoney(0),
      goodAmount: null,
      goodUnitCost: null,
      goodAvgBefore: null,
      goodAvgAfter: null,
      scrapAmount: null,
      scrapAvgAfter: null,
    };
    if (row.movement === "REPAIR_OUT") {
      byItem.set(row.itemId, {
        ...figures,
        needsRepairAvg: toMoney(row.unitCost),
      });
    } else if (row.condition === "GOOD") {
      byItem.set(row.itemId, {
        ...figures,
        goodAmount: toMoney(row.amount),
        goodUnitCost: toMoney(row.unitCost),
        goodAvgBefore: await averageBefore(db, row.itemId, "GOOD", row.id),
        goodAvgAfter: toMoney(row.avgAfter),
      });
    } else {
      byItem.set(row.itemId, {
        ...figures,
        scrapAmount: toMoney(row.amount),
        scrapAvgAfter: toMoney(row.avgAfter),
      });
    }
  }
  return [...byItem.values()];
}

export async function getRepairOrder(
  db: Database,
  code: string,
): Promise<RepairDetail | null> {
  const [head] = await db
    .select({
      id: repairOrder.id,
      code: repairOrder.code,
      status: repairOrder.status,
      repairDate: repairOrder.repairDate,
      repairedBy: repairOrder.repairedBy,
      note: repairOrder.note,
      fromLocationId: repairOrder.fromLocationId,
      fromCode: fromPlace.code,
      fromName: fromPlace.name,
      toLocationId: repairOrder.toLocationId,
      toCode: toPlace.code,
      toName: toPlace.name,
      scrapPriceUsed: repairOrder.scrapPriceUsed,
      confirmedNote: repairOrder.confirmedNote,
      postingId: repairOrder.postingId,
      createdByName: creator.name,
      createdAt: repairOrder.createdAt,
      updatedAt: repairOrder.updatedAt,
      postedByName: poster.name,
      postedAt: repairOrder.postedAt,
    })
    .from(repairOrder)
    .innerJoin(fromPlace, eq(fromPlace.id, repairOrder.fromLocationId))
    .innerJoin(toPlace, eq(toPlace.id, repairOrder.toLocationId))
    .innerJoin(creator, eq(creator.id, repairOrder.createdBy))
    .leftJoin(poster, eq(poster.id, repairOrder.postedBy))
    .where(eq(repairOrder.code, code));
  if (!head) return null;
  const lines = await db
    .select({
      itemId: repairOrderLine.itemId,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      standardWeightKg: item.standardWeightKg,
      taken: repairOrderLine.quantityTaken,
      good: repairOrderLine.quantityGood,
      scrap: repairOrderLine.quantityScrap,
      repairCost: repairOrderLine.repairCost,
      loss: repairOrderLine.lossAmount,
    })
    .from(repairOrderLine)
    .innerJoin(item, eq(item.id, repairOrderLine.itemId))
    .where(eq(repairOrderLine.orderId, head.id))
    .orderBy(asc(repairOrderLine.position));
  const { postingId, ...rest } = head;
  return {
    ...rest,
    status: head.status as RepairStatus,
    scrapPriceUsed: money(head.scrapPriceUsed),
    lines: lines.map((line) => ({
      itemId: line.itemId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      unit: unitFromDb(line.unit),
      standardWeightKg: line.standardWeightKg,
      takenMilli: milli(line.taken),
      goodMilli: milli(line.good),
      scrapMilli: milli(line.scrap),
      repairCost: toMoney(line.repairCost),
      loss: money(line.loss),
    })),
    posted: postingId ? await postedFigures(db, postingId) : [],
  };
}

export interface AwaitingItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  standardWeightKg: string | null;
  /** Chờ sửa at the chosen place, in thousandths of its unit. */
  onHandMilli: number;
  needsRepairAvg: Money | null;
  goodPoolMilli: number;
  goodAvg: Money | null;
  scrapPoolMilli: number;
  scrapAvg: Money | null;
}

export interface AwaitingRepair {
  items: AwaitingItem[];
  /** Reference scrap price (₫/kg) now; null when none was entered yet. */
  scrapPricePerKg: Money | null;
}

/**
 * Items waiting for repair at one place (D12 right column), plus the
 * figures to preview a line: averages and pools of Chờ sửa, Tốt, Phế liệu.
 * `alsoItemIds` adds lines already on a draft even when none are left.
 */
export async function awaitingRepair(
  db: Database,
  locationId: string,
  alsoItemIds: readonly string[] = [],
): Promise<AwaitingRepair> {
  const onHand = db
    .select({
      itemId: inventoryLedger.itemId,
      quantity: sql<string>`sum(${inventoryLedger.quantity})`.as("quantity"),
    })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.condition, "NEEDS_REPAIR"),
        eq(inventoryLedger.locationId, locationId),
      ),
    )
    .groupBy(inventoryLedger.itemId)
    .as("on_hand");
  const rows = await db
    .select({
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      standardWeightKg: item.standardWeightKg,
      quantity: onHand.quantity,
    })
    .from(item)
    .leftJoin(onHand, eq(onHand.itemId, item.id))
    .where(
      and(
        inArray(item.unit, [...REPAIRABLE_UNITS]),
        or(
          sql`${onHand.quantity} > 0`,
          alsoItemIds.length ? inArray(item.id, [...alsoItemIds]) : sql`false`,
        ),
      ),
    )
    .orderBy(asc(item.code));
  const ids = rows.map((row) => row.itemId);
  const costs = ids.length
    ? await db
        .select({
          itemId: inventoryCost.itemId,
          condition: inventoryCost.condition,
          avgCost: inventoryCost.avgCost,
          poolQuantity: inventoryCost.poolQuantity,
        })
        .from(inventoryCost)
        .where(
          and(
            inArray(inventoryCost.itemId, ids),
            inArray(inventoryCost.condition, ["NEEDS_REPAIR", "GOOD", "SCRAP"]),
          ),
        )
    : [];
  const cost = (itemId: string, condition: Condition) =>
    costs.find((row) => row.itemId === itemId && row.condition === condition);
  const price = await currentScrapPrice(db);
  return {
    items: rows.map((row) => ({
      itemId: row.itemId,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unit: unitFromDb(row.unit),
      standardWeightKg: row.standardWeightKg,
      onHandMilli: milli(row.quantity),
      needsRepairAvg: money(cost(row.itemId, "NEEDS_REPAIR")?.avgCost ?? null),
      goodPoolMilli: milli(cost(row.itemId, "GOOD")?.poolQuantity ?? null),
      goodAvg: money(cost(row.itemId, "GOOD")?.avgCost ?? null),
      scrapPoolMilli: milli(cost(row.itemId, "SCRAP")?.poolQuantity ?? null),
      scrapAvg: money(cost(row.itemId, "SCRAP")?.avgCost ?? null),
    })),
    scrapPricePerKg: price ? toMoney(price.pricePerKg) : null,
  };
}

export interface RepairPlace {
  id: string;
  code: string;
  name: string;
  type: "YARD" | "WORKSHOP";
}

/** Active yards and workshops: where repairs take from and book into. */
export async function repairPlaces(db: Database): Promise<RepairPlace[]> {
  const rows = await db
    .select({
      id: location.id,
      code: location.code,
      name: location.name,
      type: location.type,
    })
    .from(location)
    .where(
      and(
        inArray(location.type, ["YARD", "WORKSHOP"]),
        eq(location.status, "ACTIVE"),
      ),
    )
    .orderBy(asc(location.type), asc(location.code));
  return rows.map((row) => ({
    ...row,
    type: row.type === "WORKSHOP" ? "WORKSHOP" : "YARD",
  }));
}

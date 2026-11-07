// Reading one repair work order for D12 (repair-work-orders spec "Màn D12
// lệnh sửa chữa", "Số tiền trên D12 trước và sau ghi sổ"): the steps and
// who took them, the lines with what was reported, counted and used, the
// figures fixed when posted, and the averages and supply stock of now for
// the preview of an order not yet posted.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  inventoryCost,
  inventoryLedger,
  item,
  itemGroup,
  location,
  repairOrder,
  repairOrderLine,
  repairOrderMaterial,
  user,
} from "@/db/schema";
import type { Condition } from "@/domain/condition";
import { toMoney, type Money } from "@/domain/money";
import { quantityFromDb, type QuantityUnit } from "@/domain/quantity";
import type { WorkOrderStatus } from "@/domain/repair-work-order";
import { unitFromDb } from "@/lib/inventory/unit";
import { currentScrapPrice } from "@/lib/receiving/scrap-price";

const from = alias(location, "wo_from");
const workshop = alias(location, "wo_workshop");
const people = alias(user, "wo_people");

const milli = (value: string | null) =>
  value === null ? null : quantityFromDb(value, "KG").milli;

export interface WorkStep {
  by: string | null;
  at: Date | null;
}

export interface WorkMaterial {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  quantityMilli: number;
  /** Fixed when posted; null before. */
  amount: Money | null;
}

export interface WorkLine {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  standardWeightKg: string | null;
  takenMilli: number;
  goodMilli: number;
  scrapMilli: number;
  reportedGoodMilli: number | null;
  reportedScrapMilli: number | null;
  /** Taken on assignment; the catalog rate of now for a draft. */
  laborRate: Money | null;
  materials: WorkMaterial[];
  /** Fixed when posted (null before). */
  laborAmount: Money | null;
  materialAmount: Money;
  repairCost: Money;
  lossAmount: Money | null;
  /** The posted Good and Scrap ledger lines. */
  postedGood: { amount: Money; unitCost: Money } | null;
  postedScrap: { amount: Money } | null;
  /** B of the posting: the unit cost of the Chờ sửa line out. */
  postedNeedsRepairCost: Money | null;
}

export interface SupplyStock {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  newMilli: number;
  goodMilli: number;
  newAvg: Money | null;
  goodAvg: Money | null;
}

export interface WorkOrderDetail {
  code: string;
  status: WorkOrderStatus;
  updatedAt: Date;
  repairedBy: string | null;
  note: string | null;
  from: { id: string; code: string; name: string; type: string };
  workshop: { id: string; code: string; name: string };
  steps: {
    created: WorkStep;
    assigned: WorkStep;
    received: WorkStep;
    reported: WorkStep;
    counted: WorkStep;
    posted: WorkStep;
    cancelled: WorkStep;
  };
  returnNote: string | null;
  cancelReason: string | null;
  scrapPriceUsed: Money | null;
  confirmedNote: string | null;
  lines: WorkLine[];
  /** Averages of now per (item, condition): B, Good, supplies. */
  averages: Record<string, Money | null>;
  /** Supply stock at the workshop (New, Good), for the side block. */
  supplies: SupplyStock[];
  scrapPricePerKg: Money | null;
}

export const averageKey = (itemId: string, condition: Condition) =>
  `${itemId}|${condition}`;

async function nameOf(
  db: Pick<Database, "select">,
  id: string | null,
): Promise<string | null> {
  if (!id) return null;
  const [row] = await db
    .select({ name: people.name })
    .from(people)
    .where(eq(people.id, id));
  return row?.name ?? null;
}

/** The stock of every supply item at a workshop, with today's averages. */
export async function workshopSupplies(
  db: Pick<Database, "select">,
  workshopId: string,
): Promise<SupplyStock[]> {
  const rows = await db
    .select({
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      condition: inventoryLedger.condition,
      total: sql<string>`coalesce(sum(${inventoryLedger.quantity}), 0)`,
    })
    .from(inventoryLedger)
    .innerJoin(item, eq(item.id, inventoryLedger.itemId))
    .innerJoin(itemGroup, eq(itemGroup.id, item.groupId))
    .where(
      and(
        eq(itemGroup.category, "MATERIAL"),
        eq(inventoryLedger.locationId, workshopId),
        inArray(inventoryLedger.condition, ["NEW", "GOOD"]),
      ),
    )
    .groupBy(
      item.id,
      item.code,
      item.name,
      item.unit,
      inventoryLedger.condition,
    )
    .orderBy(asc(item.code));
  const ids = [...new Set(rows.map((row) => row.itemId))];
  const costs = ids.length
    ? await db
        .select({
          itemId: inventoryCost.itemId,
          condition: inventoryCost.condition,
          avg: inventoryCost.avgCost,
        })
        .from(inventoryCost)
        .where(inArray(inventoryCost.itemId, ids))
    : [];
  const avg = (itemId: string, condition: string) => {
    const found = costs.find(
      (row) => row.itemId === itemId && row.condition === condition,
    )?.avg;
    return found == null ? null : toMoney(found);
  };
  const byItem = new Map<string, SupplyStock>();
  for (const row of rows) {
    const entry = byItem.get(row.itemId) ?? {
      itemId: row.itemId,
      code: row.code,
      name: row.name,
      unit: unitFromDb(row.unit),
      newMilli: 0,
      goodMilli: 0,
      newAvg: avg(row.itemId, "NEW"),
      goodAvg: avg(row.itemId, "GOOD"),
    };
    const amount = quantityFromDb(row.total, "KG").milli;
    if (row.condition === "NEW") entry.newMilli += amount;
    else entry.goodMilli += amount;
    byItem.set(row.itemId, entry);
  }
  return [...byItem.values()].filter(
    (entry) => entry.newMilli + entry.goodMilli > 0,
  );
}

export async function getWorkOrder(
  db: Database,
  code: string,
): Promise<WorkOrderDetail | null> {
  const [order] = await db
    .select({
      order: repairOrder,
      fromCode: from.code,
      fromName: from.name,
      fromType: from.type,
      workshopCode: workshop.code,
      workshopName: workshop.name,
    })
    .from(repairOrder)
    .innerJoin(from, eq(from.id, repairOrder.fromLocationId))
    .innerJoin(workshop, eq(workshop.id, repairOrder.toLocationId))
    .where(eq(repairOrder.code, code));
  if (!order || order.order.kind !== "WORK_ORDER") return null;
  const head = order.order;
  const status = head.status as WorkOrderStatus;
  const rows = await db
    .select({
      id: repairOrderLine.id,
      itemId: repairOrderLine.itemId,
      code: item.code,
      name: item.name,
      unit: item.unit,
      standardWeightKg: item.standardWeightKg,
      catalogRate: item.repairLaborRate,
      line: repairOrderLine,
    })
    .from(repairOrderLine)
    .innerJoin(item, eq(item.id, repairOrderLine.itemId))
    .where(eq(repairOrderLine.orderId, head.id))
    .orderBy(asc(repairOrderLine.position));
  const materials = rows.length
    ? await db
        .select({
          lineId: repairOrderMaterial.lineId,
          itemId: repairOrderMaterial.itemId,
          code: item.code,
          name: item.name,
          unit: item.unit,
          quantity: repairOrderMaterial.quantity,
          amount: repairOrderMaterial.amount,
        })
        .from(repairOrderMaterial)
        .innerJoin(item, eq(item.id, repairOrderMaterial.itemId))
        .where(
          inArray(
            repairOrderMaterial.lineId,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(asc(item.code))
    : [];
  const posted =
    status === "POSTED" && head.postingId
      ? await db
          .select({
            itemId: inventoryLedger.itemId,
            condition: inventoryLedger.condition,
            movement: inventoryLedger.movement,
            amount: inventoryLedger.amount,
            unitCost: inventoryLedger.unitCost,
          })
          .from(inventoryLedger)
          .where(eq(inventoryLedger.postingId, head.postingId))
      : [];
  const itemIds = [
    ...new Set([
      ...rows.map((row) => row.itemId),
      ...materials.map((row) => row.itemId),
    ]),
  ];
  const costs = itemIds.length
    ? await db
        .select({
          itemId: inventoryCost.itemId,
          condition: inventoryCost.condition,
          avg: inventoryCost.avgCost,
        })
        .from(inventoryCost)
        .where(inArray(inventoryCost.itemId, itemIds))
    : [];
  const averages: Record<string, Money | null> = {};
  for (const row of costs) {
    averages[averageKey(row.itemId, row.condition as Condition)] =
      row.avg == null ? null : toMoney(row.avg);
  }
  const [price, supplies] = await Promise.all([
    currentScrapPrice(db),
    workshopSupplies(db, head.toLocationId),
  ]);
  const step = async (
    by: string | null,
    at: Date | null,
  ): Promise<WorkStep> => ({
    by: await nameOf(db, by),
    at,
  });
  const inflow = (itemId: string, condition: Condition) =>
    posted.find(
      (row) =>
        row.itemId === itemId &&
        row.condition === condition &&
        row.movement === "REPAIR_IN",
    );
  return {
    code: head.code,
    status,
    updatedAt: head.updatedAt,
    repairedBy: head.repairedBy,
    note: head.note,
    from: {
      id: head.fromLocationId,
      code: order.fromCode,
      name: order.fromName,
      type: order.fromType,
    },
    workshop: {
      id: head.toLocationId,
      code: order.workshopCode,
      name: order.workshopName,
    },
    steps: {
      created: await step(head.createdBy, head.createdAt),
      assigned: await step(head.assignedBy, head.assignedAt),
      received: await step(head.receivedBy, head.receivedAt),
      reported: await step(head.reportedBy, head.reportedAt),
      counted: await step(head.countedBy, head.countedAt),
      posted: await step(head.postedBy, head.postedAt),
      cancelled: await step(head.cancelledBy, head.cancelledAt),
    },
    returnNote: head.returnNote,
    cancelReason: head.cancelReason,
    scrapPriceUsed:
      head.scrapPriceUsed == null ? null : toMoney(head.scrapPriceUsed),
    confirmedNote: head.confirmedNote,
    lines: rows.map((row) => {
      const unit = unitFromDb(row.unit);
      const good = inflow(row.itemId, "GOOD");
      const scrap = inflow(row.itemId, "SCRAP");
      const out = posted.find(
        (entry) =>
          entry.itemId === row.itemId &&
          entry.condition === "NEEDS_REPAIR" &&
          entry.movement === "REPAIR_OUT",
      );
      const rate =
        row.line.laborRate ?? (status === "DRAFT" ? row.catalogRate : null);
      return {
        itemId: row.itemId,
        code: row.code,
        name: row.name,
        unit,
        standardWeightKg: row.standardWeightKg,
        takenMilli: milli(row.line.quantityTaken) ?? 0,
        goodMilli: milli(row.line.quantityGood) ?? 0,
        scrapMilli: milli(row.line.quantityScrap) ?? 0,
        reportedGoodMilli: milli(row.line.reportedGood),
        reportedScrapMilli: milli(row.line.reportedScrap),
        laborRate: rate == null ? null : toMoney(rate),
        materials: materials
          .filter((material) => material.lineId === row.id)
          .map((material) => ({
            itemId: material.itemId,
            code: material.code,
            name: material.name,
            unit: unitFromDb(material.unit),
            quantityMilli: milli(material.quantity) ?? 0,
            amount: material.amount == null ? null : toMoney(material.amount),
          })),
        laborAmount:
          row.line.laborAmount == null ? null : toMoney(row.line.laborAmount),
        materialAmount: toMoney(row.line.materialAmount),
        repairCost: toMoney(row.line.repairCost),
        lossAmount:
          row.line.lossAmount == null ? null : toMoney(row.line.lossAmount),
        postedGood: good
          ? { amount: toMoney(good.amount), unitCost: toMoney(good.unitCost) }
          : null,
        postedScrap: scrap ? { amount: toMoney(scrap.amount) } : null,
        postedNeedsRepairCost: out ? toMoney(out.unitCost) : null,
      };
    }),
    averages,
    supplies,
    scrapPricePerKg: price ? toMoney(price.pricePerKg) : null,
  };
}

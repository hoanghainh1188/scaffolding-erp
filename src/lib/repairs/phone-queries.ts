// What the phone reads of a repair work order (repair-work-orders design
// D6; spec repair-mobile): numbers and supplies, never a price. Columns are
// listed one by one so no money column can slip into a reply.
import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  item,
  itemGroup,
  location,
  repairOrder,
  repairOrderLine,
  repairOrderMaterial,
} from "@/db/schema";
import {
  quantityFromDb,
  quantityToDb,
  sumByUnit,
  toQuantity,
  type QuantityUnit,
  type UnitAmount,
} from "@/domain/quantity";
import type { WorkOrderStatus } from "@/domain/repair-work-order";
import { unitFromDb } from "@/lib/inventory/unit";

const fromPlace = alias(location, "phone_from");
const workshop = alias(location, "phone_workshop");

export interface PhoneOrderCard {
  code: string;
  status: WorkOrderStatus;
  repairedBy: string | null;
  fromCode: string;
  workshopCode: string;
  workshopName: string;
  lineCount: number;
  taken: UnitAmount[];
  /** The office sent it back; shown as "Văn phòng trả lại". */
  returnNote: string | null;
}

/** The statuses a role works on: workshop, storekeeper (both for the director). */
export function phoneStatuses(scope: {
  work: boolean;
  count: boolean;
}): WorkOrderStatus[] {
  return [
    ...(scope.work ? (["ASSIGNED", "IN_PROGRESS"] as const) : []),
    ...(scope.count ? (["AWAITING_CHECK"] as const) : []),
  ];
}

/** Cards of /m/repairs and M1, oldest first (the work waiting longest). */
export async function phoneOrders(
  db: Pick<Database, "select">,
  statuses: readonly WorkOrderStatus[],
): Promise<PhoneOrderCard[]> {
  if (statuses.length === 0) return [];
  const orders = await db
    .select({
      id: repairOrder.id,
      code: repairOrder.code,
      status: repairOrder.status,
      repairedBy: repairOrder.repairedBy,
      fromCode: fromPlace.code,
      workshopCode: workshop.code,
      workshopName: workshop.name,
      returnNote: repairOrder.returnNote,
      returnedAt: repairOrder.returnedAt,
      reportedAt: repairOrder.reportedAt,
    })
    .from(repairOrder)
    .innerJoin(fromPlace, eq(fromPlace.id, repairOrder.fromLocationId))
    .innerJoin(workshop, eq(workshop.id, repairOrder.toLocationId))
    .where(
      and(
        eq(repairOrder.kind, "WORK_ORDER"),
        inArray(repairOrder.status, [...statuses]),
      ),
    )
    .orderBy(asc(repairOrder.createdAt), asc(repairOrder.code));
  if (orders.length === 0) return [];
  const lines = await db
    .select({
      orderId: repairOrderLine.orderId,
      unit: item.unit,
      taken: repairOrderLine.quantityTaken,
    })
    .from(repairOrderLine)
    .innerJoin(item, eq(item.id, repairOrderLine.itemId))
    .where(
      inArray(
        repairOrderLine.orderId,
        orders.map((order) => order.id),
      ),
    );
  return orders.map((order) => {
    const own = lines.filter((line) => line.orderId === order.id);
    const status = order.status as WorkOrderStatus;
    return {
      code: order.code,
      status,
      repairedBy: order.repairedBy,
      fromCode: order.fromCode,
      workshopCode: order.workshopCode,
      workshopName: order.workshopName,
      lineCount: own.length,
      taken: sumByUnit(
        own.map((line) => {
          const unit = unitFromDb(line.unit);
          return { unit, milli: quantityFromDb(line.taken, unit).milli };
        }),
      ),
      // Only while the order waits on the workshop again.
      returnNote: status === "IN_PROGRESS" ? order.returnNote : null,
    };
  });
}

export interface PhoneMaterial {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  /** "6", "0.5": the quantity as the inputs take it. */
  quantity: string;
}

export interface PhoneLine {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  taken: string;
  good: string;
  scrap: string;
  /** What the workshop reported, for the storekeeper; null before. */
  reportedGood: string | null;
  reportedScrap: string | null;
  materials: PhoneMaterial[];
}

export interface PhoneOrder {
  code: string;
  status: WorkOrderStatus;
  repairedBy: string | null;
  fromCode: string;
  workshopCode: string;
  workshopName: string;
  receivedAt: string | null;
  returnNote: string | null;
  /** The updatedAt every step sends back (design D5). */
  updatedAt: string;
  lines: PhoneLine[];
}

const text = (value: string | null, unit: QuantityUnit) =>
  value === null ? null : quantityToDb(quantityFromDb(value, unit));

/** One order for M8; null when it is not a work order. */
export async function phoneOrder(
  db: Pick<Database, "select">,
  code: string,
): Promise<PhoneOrder | null> {
  const [order] = await db
    .select({
      id: repairOrder.id,
      code: repairOrder.code,
      kind: repairOrder.kind,
      status: repairOrder.status,
      repairedBy: repairOrder.repairedBy,
      fromCode: fromPlace.code,
      workshopCode: workshop.code,
      workshopName: workshop.name,
      receivedAt: repairOrder.receivedAt,
      returnNote: repairOrder.returnNote,
      updatedAt: repairOrder.updatedAt,
    })
    .from(repairOrder)
    .innerJoin(fromPlace, eq(fromPlace.id, repairOrder.fromLocationId))
    .innerJoin(workshop, eq(workshop.id, repairOrder.toLocationId))
    .where(eq(repairOrder.code, code));
  if (!order || order.kind !== "WORK_ORDER") return null;
  const lines = await db
    .select({
      id: repairOrderLine.id,
      itemId: repairOrderLine.itemId,
      code: item.code,
      name: item.name,
      unit: item.unit,
      taken: repairOrderLine.quantityTaken,
      good: repairOrderLine.quantityGood,
      scrap: repairOrderLine.quantityScrap,
      reportedGood: repairOrderLine.reportedGood,
      reportedScrap: repairOrderLine.reportedScrap,
    })
    .from(repairOrderLine)
    .innerJoin(item, eq(item.id, repairOrderLine.itemId))
    .where(eq(repairOrderLine.orderId, order.id))
    .orderBy(asc(repairOrderLine.position));
  const materials = lines.length
    ? await db
        .select({
          lineId: repairOrderMaterial.lineId,
          itemId: repairOrderMaterial.itemId,
          code: item.code,
          name: item.name,
          unit: item.unit,
          quantity: repairOrderMaterial.quantity,
        })
        .from(repairOrderMaterial)
        .innerJoin(item, eq(item.id, repairOrderMaterial.itemId))
        .where(
          inArray(
            repairOrderMaterial.lineId,
            lines.map((line) => line.id),
          ),
        )
        .orderBy(asc(item.code))
    : [];
  const status = order.status as WorkOrderStatus;
  return {
    code: order.code,
    status,
    repairedBy: order.repairedBy,
    fromCode: order.fromCode,
    workshopCode: order.workshopCode,
    workshopName: order.workshopName,
    receivedAt: order.receivedAt?.toISOString() ?? null,
    returnNote: status === "IN_PROGRESS" ? order.returnNote : null,
    updatedAt: order.updatedAt.toISOString(),
    lines: lines.map((line) => {
      const unit = unitFromDb(line.unit);
      return {
        itemId: line.itemId,
        code: line.code,
        name: line.name,
        unit,
        taken: quantityToDb(quantityFromDb(line.taken, unit)),
        good: quantityToDb(quantityFromDb(line.good, unit)),
        scrap: quantityToDb(quantityFromDb(line.scrap, unit)),
        reportedGood: text(line.reportedGood, unit),
        reportedScrap: text(line.reportedScrap, unit),
        materials: materials
          .filter((row) => row.lineId === line.id)
          .map((row) => {
            const materialUnit = unitFromDb(row.unit);
            return {
              itemId: row.itemId,
              code: row.code,
              name: row.name,
              unit: materialUnit,
              quantity: quantityToDb(
                toQuantity(
                  quantityFromDb(row.quantity, materialUnit).milli,
                  materialUnit,
                ),
              ),
            };
          }),
      };
    }),
  };
}

export interface PhoneSupply {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
}

/** Active supply items for "+ Thêm vật tư" (0.2 số 118). */
export async function phoneSupplies(
  db: Pick<Database, "select">,
): Promise<PhoneSupply[]> {
  const rows = await db
    .select({
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
    })
    .from(item)
    .innerJoin(itemGroup, eq(itemGroup.id, item.groupId))
    .where(and(eq(itemGroup.category, "MATERIAL"), eq(item.status, "ACTIVE")))
    .orderBy(asc(item.code));
  return rows.map((row) => ({ ...row, unit: unitFromDb(row.unit) }));
}

// What the phone reads of a production order (spec production-mobile):
// numbers and materials, never a price. Columns are listed one by one so no
// money column can slip into a reply.
import { asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  item,
  location,
  productionOrder,
  productionOrderLine,
  productionOrderMaterial,
} from "@/db/schema";
import type { ProductionStatus } from "@/domain/production-order";
import {
  quantityFromDb,
  quantityToDb,
  sumByUnit,
  type QuantityUnit,
  type UnitAmount,
} from "@/domain/quantity";
import { unitFromDb } from "@/lib/inventory/unit";

const workshop = alias(location, "phone_workshop");
const yard = alias(location, "phone_yard");

type Reader = Pick<Database, "select">;

export interface ProductionPhoneCard {
  code: string;
  status: ProductionStatus;
  team: string | null;
  workshopCode: string;
  toCode: string;
  lineCount: number;
  planned: UnitAmount[];
  /** The office sent it back; shown as "Văn phòng trả lại". */
  returnNote: string | null;
}

/** The statuses a role works on (both for the director). */
export function productionPhoneStatuses(scope: {
  work: boolean;
  count: boolean;
}): ProductionStatus[] {
  return [
    ...(scope.work ? (["ASSIGNED", "IN_PROGRESS"] as const) : []),
    ...(scope.count ? (["AWAITING_CHECK"] as const) : []),
  ];
}

/** Cards of /m/production and M1, oldest first. */
export async function productionPhoneOrders(
  db: Reader,
  statuses: readonly ProductionStatus[],
): Promise<ProductionPhoneCard[]> {
  if (statuses.length === 0) return [];
  const orders = await db
    .select({
      id: productionOrder.id,
      code: productionOrder.code,
      status: productionOrder.status,
      team: productionOrder.team,
      workshopCode: workshop.code,
      toCode: yard.code,
      returnNote: productionOrder.returnNote,
    })
    .from(productionOrder)
    .innerJoin(workshop, eq(workshop.id, productionOrder.workshopId))
    .innerJoin(yard, eq(yard.id, productionOrder.toLocationId))
    .where(inArray(productionOrder.status, [...statuses]))
    .orderBy(asc(productionOrder.createdAt), asc(productionOrder.code));
  if (orders.length === 0) return [];
  const lines = await db
    .select({
      orderId: productionOrderLine.orderId,
      unit: item.unit,
      planned: productionOrderLine.quantityPlanned,
    })
    .from(productionOrderLine)
    .innerJoin(item, eq(item.id, productionOrderLine.itemId))
    .where(
      inArray(
        productionOrderLine.orderId,
        orders.map((order) => order.id),
      ),
    );
  return orders.map((order) => {
    const own = lines.filter((line) => line.orderId === order.id);
    const status = order.status as ProductionStatus;
    return {
      code: order.code,
      status,
      team: order.team,
      workshopCode: order.workshopCode,
      toCode: order.toCode,
      lineCount: own.length,
      planned: sumByUnit(
        own.map((line) => {
          const unit = unitFromDb(line.unit);
          return { unit, milli: quantityFromDb(line.planned, unit).milli };
        }),
      ),
      // Only while the order waits on the workshop again.
      returnNote: status === "IN_PROGRESS" ? order.returnNote : null,
    };
  });
}

export interface ProductionPhoneMaterial {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  /** Per finished piece as taken; null: added by the workshop. */
  normPerUnit: string | null;
  /** What the workshop reported, or null before. */
  reported: string | null;
}

export interface ProductionPhoneLine {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  planned: string;
  reportedFinished: string | null;
  reportedOffcutKg: string | null;
  materials: ProductionPhoneMaterial[];
}

export interface ProductionPhoneOrder {
  code: string;
  status: ProductionStatus;
  team: string | null;
  workshopCode: string;
  toCode: string;
  receivedAt: string | null;
  returnNote: string | null;
  /** The updatedAt every step sends back. */
  updatedAt: string;
  lines: ProductionPhoneLine[];
}

const text = (value: string | null, unit: QuantityUnit) =>
  value === null ? null : quantityToDb(quantityFromDb(value, unit));

/** One order for M10; null when missing. */
export async function productionPhoneOrder(
  db: Reader,
  code: string,
): Promise<ProductionPhoneOrder | null> {
  const [order] = await db
    .select({
      id: productionOrder.id,
      code: productionOrder.code,
      status: productionOrder.status,
      team: productionOrder.team,
      workshopCode: workshop.code,
      toCode: yard.code,
      receivedAt: productionOrder.receivedAt,
      returnNote: productionOrder.returnNote,
      updatedAt: productionOrder.updatedAt,
    })
    .from(productionOrder)
    .innerJoin(workshop, eq(workshop.id, productionOrder.workshopId))
    .innerJoin(yard, eq(yard.id, productionOrder.toLocationId))
    .where(eq(productionOrder.code, code));
  if (!order) return null;
  const lines = await db
    .select({
      id: productionOrderLine.id,
      itemId: productionOrderLine.itemId,
      code: item.code,
      name: item.name,
      unit: item.unit,
      planned: productionOrderLine.quantityPlanned,
      reportedFinished: productionOrderLine.reportedFinished,
      reportedOffcutKg: productionOrderLine.reportedOffcutKg,
    })
    .from(productionOrderLine)
    .innerJoin(item, eq(item.id, productionOrderLine.itemId))
    .where(eq(productionOrderLine.orderId, order.id))
    .orderBy(asc(productionOrderLine.position));
  const materials = lines.length
    ? await db
        .select({
          lineId: productionOrderMaterial.lineId,
          itemId: productionOrderMaterial.itemId,
          code: item.code,
          name: item.name,
          unit: item.unit,
          norm: productionOrderMaterial.normPerUnit,
          reported: productionOrderMaterial.reportedQuantity,
        })
        .from(productionOrderMaterial)
        .innerJoin(item, eq(item.id, productionOrderMaterial.itemId))
        .where(
          inArray(
            productionOrderMaterial.lineId,
            lines.map((line) => line.id),
          ),
        )
        .orderBy(asc(item.code))
    : [];
  const status = order.status as ProductionStatus;
  return {
    code: order.code,
    status,
    team: order.team,
    workshopCode: order.workshopCode,
    toCode: order.toCode,
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
        planned: quantityToDb(quantityFromDb(line.planned, unit)),
        reportedFinished: text(line.reportedFinished, unit),
        reportedOffcutKg: text(line.reportedOffcutKg, "KG"),
        materials: materials
          .filter((row) => row.lineId === line.id)
          .map((row) => {
            const materialUnit = unitFromDb(row.unit);
            return {
              itemId: row.itemId,
              code: row.code,
              name: row.name,
              unit: materialUnit,
              // A norm may be part of a count unit (0,5 cây).
              normPerUnit: text(row.norm, "KG"),
              reported: text(row.reported, materialUnit),
            };
          }),
      };
    }),
  };
}

// The stored lines of an order in the shape the pure rules take.
import { asc, eq, inArray } from "drizzle-orm";

import {
  item,
  productionOrderLine,
  productionOrderMaterial,
} from "@/db/schema";
import { toMoney } from "@/domain/money";
import type { PostingLine } from "@/domain/production-order";
import { quantityFromDb } from "@/domain/quantity";
import type { Tx } from "@/lib/inventory/post";
import { unitFromDb } from "@/lib/inventory/unit";

export const milliOf = (value: string | null): number =>
  value === null ? 0 : quantityFromDb(value, "KG").milli;

/** What the storekeeper counted, line by line, in order. */
export async function readPostingLines(
  tx: Tx,
  orderId: string,
): Promise<PostingLine[]> {
  const lines = await tx
    .select({
      id: productionOrderLine.id,
      itemId: productionOrderLine.itemId,
      code: item.code,
      unit: item.unit,
      finished: productionOrderLine.quantityFinished,
      offcut: productionOrderLine.offcutKg,
      laborRate: productionOrderLine.laborRate,
    })
    .from(productionOrderLine)
    .innerJoin(item, eq(item.id, productionOrderLine.itemId))
    .where(eq(productionOrderLine.orderId, orderId))
    .orderBy(asc(productionOrderLine.position));
  const materials = lines.length
    ? await tx
        .select({
          rowId: productionOrderMaterial.id,
          lineId: productionOrderMaterial.lineId,
          itemId: productionOrderMaterial.itemId,
          code: item.code,
          unit: item.unit,
          standardWeightKg: item.standardWeightKg,
          quantity: productionOrderMaterial.quantity,
          norm: productionOrderMaterial.normPerUnit,
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
  return lines.map((line) => ({
    lineId: line.id,
    itemId: line.itemId,
    itemCode: line.code,
    unit: unitFromDb(line.unit),
    finishedMilli: milliOf(line.finished),
    offcutMilli: milliOf(line.offcut),
    laborRate: line.laborRate === null ? null : toMoney(line.laborRate),
    materials: materials
      .filter((row) => row.lineId === line.id)
      .map((row) => ({
        rowId: row.rowId,
        itemId: row.itemId,
        itemCode: row.code,
        unit: unitFromDb(row.unit),
        standardWeightKg: row.standardWeightKg,
        quantityMilli: milliOf(row.quantity),
        normPerUnitMilli: row.norm === null ? null : milliOf(row.norm),
      })),
  }));
}

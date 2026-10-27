// What the goods receipts of an order say (purchase-orders design D9,
// goods-receipt design D10). Every rule that depends on "has goods come in
// yet" or "which lines are still open" reads the receipt tables through here.
import { asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  goodsReceipt,
  goodsReceiptLine,
  item,
  purchaseOrderLine,
} from "@/db/schema";
import {
  isOpenLine,
  receivedInLineUnit,
  type ReceiptLineStatus,
  type ReceivingLine,
} from "@/domain/goods-receipt";
import { quantityFromDb, type QuantityUnit } from "@/domain/quantity";

export interface ReceiptSummary {
  /** Goods receipts posted for the order. */
  trips: number;
  /** Quantity received so far by item id, in thousandths of the line unit. */
  receivedByItem: ReadonlyMap<string, number>;
  /** Every order line with what came in and whether it is still open (D6). */
  lines: readonly ReceivingLine[];
}

type Reader = Pick<Database, "select">;

const milli = (value: string | null) =>
  value === null ? null : quantityFromDb(value, "KG").milli;

/** The order lines of some orders as receiving sees them, in line order. */
async function orderLines(tx: Reader, orderIds: readonly string[]) {
  return tx
    .select({
      orderId: purchaseOrderLine.orderId,
      orderLineId: purchaseOrderLine.id,
      itemId: purchaseOrderLine.itemId,
      itemCode: item.code,
      itemUnit: item.unit,
      lineUnit: purchaseOrderLine.unit,
      standardWeightKg: item.standardWeightKg,
      quantity: purchaseOrderLine.quantity,
    })
    .from(purchaseOrderLine)
    .innerJoin(item, eq(item.id, purchaseOrderLine.itemId))
    .where(inArray(purchaseOrderLine.orderId, [...orderIds]))
    .orderBy(asc(purchaseOrderLine.orderId), asc(purchaseOrderLine.lineNo));
}

/** Receipt lines of some orders, oldest trip first. */
async function receiptLines(tx: Reader, orderIds: readonly string[]) {
  return tx
    .select({
      orderId: goodsReceipt.orderId,
      receiptId: goodsReceipt.id,
      orderLineId: goodsReceiptLine.orderLineId,
      status: goodsReceiptLine.status,
      quantity: goodsReceiptLine.quantity,
      weighedKg: goodsReceiptLine.weighedKg,
      awaitsRest: goodsReceiptLine.awaitsRest,
    })
    .from(goodsReceiptLine)
    .innerJoin(goodsReceipt, eq(goodsReceipt.id, goodsReceiptLine.receiptId))
    .where(inArray(goodsReceipt.orderId, [...orderIds]))
    .orderBy(asc(goodsReceipt.tripNo), asc(goodsReceiptLine.lineNo));
}

export async function receiptSummaries(
  tx: Reader,
  orderIds: readonly string[],
): Promise<Map<string, ReceiptSummary>> {
  const result = new Map<string, ReceiptSummary>();
  if (orderIds.length === 0) return result;
  const [lines, received] = await Promise.all([
    orderLines(tx, orderIds),
    receiptLines(tx, orderIds),
  ]);
  for (const orderId of orderIds) {
    const ofOrder = received.filter((row) => row.orderId === orderId);
    const trips = new Set(ofOrder.map((row) => row.receiptId)).size;
    const byItem = new Map<string, number>();
    const receiving = lines
      .filter((line) => line.orderId === orderId)
      .map((line): ReceivingLine => {
        const info = {
          itemUnit: line.itemUnit as QuantityUnit,
          lineUnit: line.lineUnit as QuantityUnit,
        };
        let got = 0;
        let last: boolean | null = null;
        for (const row of ofOrder) {
          if (row.orderLineId !== line.orderLineId) continue;
          got += receivedInLineUnit(info, {
            status: row.status as ReceiptLineStatus,
            quantityMilli: milli(row.quantity) ?? 0,
            weighedKgMilli: milli(row.weighedKg),
          });
          last = row.awaitsRest;
        }
        byItem.set(line.itemId, got);
        return {
          orderLineId: line.orderLineId,
          itemCode: line.itemCode,
          ...info,
          standardWeightKg: line.standardWeightKg,
          orderedMilli: milli(line.quantity) ?? 0,
          receivedMilli: got,
          lastAwaitsRest: last,
        };
      });
    result.set(orderId, { trips, receivedByItem: byItem, lines: receiving });
  }
  return result;
}

export async function receiptSummary(
  tx: Reader,
  orderId: string,
): Promise<ReceiptSummary> {
  return (
    (await receiptSummaries(tx, [orderId])).get(orderId) ?? {
      trips: 0,
      receivedByItem: new Map(),
      lines: [],
    }
  );
}

/** The lines a new trip must count or mark (design D6). */
export function openLinesOf(summary: ReceiptSummary): ReceivingLine[] {
  return summary.lines.filter(isOpenLine);
}

/** SQL for "the order has a goods receipt", for list filters and counts. */
export function hasReceiptsSql(orderId: PgColumn): SQL<boolean> {
  return sql<boolean>`exists (select 1 from ${goodsReceipt} where ${goodsReceipt.orderId} = ${orderId})`;
}

/** Number of receipts of one order, read inside a writing transaction. */
export async function tripCount(tx: Reader, orderId: string): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(goodsReceipt)
    .where(eq(goodsReceipt.orderId, orderId));
  return row?.count ?? 0;
}

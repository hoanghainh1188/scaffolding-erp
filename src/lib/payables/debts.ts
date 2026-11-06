// What each seller is owed, read from posted goods receipts (payables design
// D2, 0.2 #13, #26, #99): one debt per receipt, worth receiptPayable of its
// lines at the order line price, due on the date stored when it was posted.
// Never stored, never touched by trip costs or value adjustments. One query
// for every receipt in scope, so the number of queries does not grow.
import { asc, eq, inArray } from "drizzle-orm";

import {
  goodsReceipt,
  goodsReceiptLine,
  item,
  purchaseOrder,
  purchaseOrderLine,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { needsWeighing, type ReceiptLineStatus } from "@/domain/goods-receipt";
import { toMoney, type Money } from "@/domain/money";
import { goodsSummary, type GoodsLine } from "@/domain/payables";
import {
  hasStandardWeight,
  quantityFromDb,
  type QuantityUnit,
} from "@/domain/quantity";
import { receiptPayable, type PayableLine } from "@/domain/receipt-cost";
import type { Reader } from "@/lib/receivables/debts";

export type { Reader };

/** One posted goods receipt as a debt to its seller. */
export interface Payable {
  /** goods_receipt.id */
  key: string;
  code: string;
  label: string;
  supplierId: string;
  orderId: string;
  orderCode: string;
  tripNo: number;
  issuedDate: BusinessDate;
  dueDate: BusinessDate;
  total: Money;
  /** "650 chéo 1,7m cũ, 120 khung 1,7m cũ và 2 mã khác" */
  goods: string;
}

export interface PayableScope {
  supplierIds?: readonly string[];
}

interface Row {
  id: string;
  code: string;
  supplierId: string;
  orderId: string;
  orderCode: string;
  tripNo: number;
  businessDate: string;
  dueDate: string;
  status: string;
  quantity: string;
  weighedKg: string | null;
  lineUnit: string;
  itemUnit: string;
  itemName: string;
  unitPrice: number;
}

function payableOf(rows: readonly Row[]): Payable | null {
  const [first] = rows;
  if (!first) return null;
  const lines: PayableLine[] = [];
  const goods: GoodsLine[] = [];
  for (const row of rows) {
    const itemUnit = row.itemUnit as QuantityUnit;
    const lineUnit = row.lineUnit as QuantityUnit;
    const open = { itemUnit, lineUnit };
    const quantityMilli = quantityFromDb(row.quantity, itemUnit).milli;
    const weighedKgMilli =
      row.weighedKg === null ? null : quantityFromDb(row.weighedKg, "KG").milli;
    lines.push({
      open,
      line: {
        status: row.status as ReceiptLineStatus,
        quantityMilli,
        weighedKgMilli,
      },
      unitPrice: toMoney(row.unitPrice),
    });
    if (row.status !== "COUNTED") continue;
    const byKg = needsWeighing(open) || !hasStandardWeight(lineUnit);
    goods.push({
      quantityMilli: needsWeighing(open)
        ? (weighedKgMilli ?? 0)
        : quantityMilli,
      unit: needsWeighing(open) ? "KG" : itemUnit,
      name: row.itemName,
      weighed: byKg,
    });
  }
  return {
    key: first.id,
    code: first.code,
    label: first.code,
    supplierId: first.supplierId,
    orderId: first.orderId,
    orderCode: first.orderCode,
    tripNo: first.tripNo,
    issuedDate: first.businessDate as BusinessDate,
    dueDate: first.dueDate as BusinessDate,
    total: receiptPayable(lines),
    goods: goodsSummary(goods),
  };
}

/**
 * Debts of the sellers in scope (every seller when none), oldest receipt
 * first. A receipt worth 0 ₫ is not a debt (spec payables).
 */
export async function readPayables(
  db: Reader,
  scope: PayableScope = {},
): Promise<Payable[]> {
  if (scope.supplierIds?.length === 0) return [];
  const rows = await db
    .select({
      id: goodsReceipt.id,
      code: goodsReceipt.code,
      supplierId: purchaseOrder.supplierId,
      orderId: purchaseOrder.id,
      orderCode: purchaseOrder.code,
      tripNo: goodsReceipt.tripNo,
      businessDate: goodsReceipt.businessDate,
      dueDate: goodsReceipt.dueDate,
      status: goodsReceiptLine.status,
      quantity: goodsReceiptLine.quantity,
      weighedKg: goodsReceiptLine.weighedKg,
      lineUnit: purchaseOrderLine.unit,
      itemUnit: item.unit,
      itemName: item.name,
      unitPrice: purchaseOrderLine.unitPrice,
    })
    .from(goodsReceiptLine)
    .innerJoin(goodsReceipt, eq(goodsReceipt.id, goodsReceiptLine.receiptId))
    .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.orderId))
    .innerJoin(
      purchaseOrderLine,
      eq(purchaseOrderLine.id, goodsReceiptLine.orderLineId),
    )
    .innerJoin(item, eq(item.id, goodsReceiptLine.itemId))
    .where(
      scope.supplierIds
        ? inArray(purchaseOrder.supplierId, [...scope.supplierIds])
        : undefined,
    )
    .orderBy(
      asc(goodsReceipt.businessDate),
      asc(goodsReceipt.code),
      asc(goodsReceiptLine.lineNo),
    );
  const byReceipt = new Map<string, Row[]>();
  for (const row of rows) {
    byReceipt.set(row.id, [...(byReceipt.get(row.id) ?? []), row]);
  }
  const result: Payable[] = [];
  for (const receiptRows of byReceipt.values()) {
    const payable = payableOf(receiptRows);
    if (payable && payable.total > 0) result.push(payable);
  }
  return result;
}

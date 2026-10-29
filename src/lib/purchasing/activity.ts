// A purchase order as the activity log sees it (activity-log design D6):
// read inside the write's transaction before and after, then compared.
import { asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  item,
  purchaseOrder,
  purchaseOrderCost,
  purchaseOrderLine,
  supplier,
} from "@/db/schema";
import {
  diffFields,
  diffLines,
  withTotal,
  type FieldChange,
  type FieldSpec,
  type LineSpec,
} from "@/domain/activity-changes";
import { countText, joinParts } from "@/domain/activity-summary";
import { formatBusinessDate } from "@/domain/business-date";
import { ALLOCATION_METHOD_LABELS } from "@/domain/landed-cost";
import { toMoney } from "@/domain/money";
import {
  orderTotals,
  PURCHASE_KIND_LABELS,
  type PurchaseKind,
} from "@/domain/purchase-order";
import {
  formatQuantity,
  quantityFromDb,
  QUANTITY_UNIT_LABELS,
  type QuantityUnit,
} from "@/domain/quantity";
import { moneyText } from "@/lib/activity/fields";

type Executor = Pick<Database, "select">;

export interface OrderLineView {
  code: string;
  unit: QuantityUnit;
  quantity: string;
  unitPrice: number;
}

export interface OrderView {
  supplierName: string;
  kind: string;
  expectedDate: string | null;
  expectedTime: string | null;
  vehicle: string | null;
  note: string | null;
  allocationMethod: string;
  lines: OrderLineView[];
  costs: { label: string; amount: number }[];
}

const quantityText = (line: Pick<OrderLineView, "quantity" | "unit">) =>
  `${formatQuantity(quantityFromDb(line.quantity, line.unit))} ${QUANTITY_UNIT_LABELS[line.unit]}`;

const HEAD_FIELDS: readonly FieldSpec<OrderView>[] = [
  { field: "supplier", label: "Nhà cung cấp", value: (o) => o.supplierName },
  {
    field: "kind",
    label: "Loại hàng",
    value: (o) => PURCHASE_KIND_LABELS[o.kind as PurchaseKind] ?? o.kind,
  },
  {
    field: "expectedDate",
    label: "Ngày dự kiến",
    value: (o) => (o.expectedDate ? formatBusinessDate(o.expectedDate) : null),
  },
  { field: "expectedTime", label: "Giờ dự kiến", value: (o) => o.expectedTime },
  { field: "vehicle", label: "Phương tiện", value: (o) => o.vehicle },
  { field: "note", label: "Ghi chú", value: (o) => o.note },
  {
    field: "allocationMethod",
    label: "Cách chia chi phí",
    value: (o) =>
      ALLOCATION_METHOD_LABELS[
        o.allocationMethod as keyof typeof ALLOCATION_METHOD_LABELS
      ] ?? o.allocationMethod,
  },
];

const LINES: LineSpec<OrderLineView> = {
  field: "lines",
  key: (line) => line.code,
  whole: (line) => `${quantityText(line)} × ${moneyText(line.unitPrice)}`,
  columns: [
    { field: "quantity", label: "Số lượng", value: quantityText },
    {
      field: "unitPrice",
      label: "Đơn giá",
      value: (line) => moneyText(line.unitPrice),
    },
  ],
};

const COSTS: LineSpec<{ label: string; amount: number }> = {
  field: "costs",
  key: (cost) => cost.label,
  whole: (cost) => moneyText(cost.amount) ?? "",
  columns: [
    {
      field: "amount",
      label: "Chi phí",
      value: (cost) => moneyText(cost.amount),
    },
  ],
};

/** The goods total of the lines (quantity × unit price, 0.2 #10). */
export function goodsTotal(view: Pick<OrderView, "lines">): number {
  return orderTotals(
    view.lines.map((line) => ({
      quantityMilli: quantityFromDb(line.quantity, "KG").milli,
      unitPrice: toMoney(line.unitPrice),
    })),
    [],
  ).goods;
}

/** The order as stored now, lines in order. */
export async function orderView(
  tx: Executor,
  orderId: string,
): Promise<OrderView> {
  const [[head], lines, costs] = await Promise.all([
    tx
      .select({
        supplierName: supplier.name,
        kind: purchaseOrder.kind,
        expectedDate: purchaseOrder.expectedDate,
        expectedTime: purchaseOrder.expectedTime,
        vehicle: purchaseOrder.vehicle,
        note: purchaseOrder.note,
        allocationMethod: purchaseOrder.allocationMethod,
      })
      .from(purchaseOrder)
      .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
      .where(eq(purchaseOrder.id, orderId)),
    tx
      .select({
        code: item.code,
        unit: purchaseOrderLine.unit,
        quantity: purchaseOrderLine.quantity,
        unitPrice: purchaseOrderLine.unitPrice,
      })
      .from(purchaseOrderLine)
      .innerJoin(item, eq(item.id, purchaseOrderLine.itemId))
      .where(eq(purchaseOrderLine.orderId, orderId))
      .orderBy(asc(purchaseOrderLine.lineNo)),
    tx
      .select({
        label: purchaseOrderCost.label,
        amount: purchaseOrderCost.amount,
      })
      .from(purchaseOrderCost)
      .where(eq(purchaseOrderCost.orderId, orderId))
      .orderBy(asc(purchaseOrderCost.lineNo)),
  ]);
  if (!head) throw new Error(`purchase order ${orderId} not found`);
  return {
    ...head,
    lines: lines.map((line) => ({
      ...line,
      unit: line.unit as QuantityUnit,
    })),
    costs,
  };
}

/** What an edit changed, with the goods total when it moved. */
export function orderChanges(
  before: OrderView,
  after: OrderView,
): FieldChange[] {
  return withTotal(
    [
      ...diffFields(HEAD_FIELDS, before, after),
      ...diffLines(LINES, before.lines, after.lines),
      ...diffLines(COSTS, before.costs, after.costs),
    ],
    {
      field: "goodsTotal",
      label: "Tổng tiền hàng của đơn",
      before: moneyText(goodsTotal(before)) ?? "",
      after: moneyText(goodsTotal(after)) ?? "",
    },
  );
}

/** "Hòa Phát mẫu · 5 mã hàng · 52.942.500 ₫". */
export function orderSummary(view: OrderView): string {
  return joinParts(
    view.supplierName,
    countText(view.lines.length, "mã hàng"),
    moneyText(goodsTotal(view)),
  );
}

/** "Dự kiến về 30/10/2026". */
export function placedSummary(view: OrderView): string {
  return view.expectedDate
    ? `Dự kiến về ${formatBusinessDate(view.expectedDate)}`
    : "Đặt đơn";
}

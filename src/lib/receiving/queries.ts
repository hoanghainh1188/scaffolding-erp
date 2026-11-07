// What the phone reads (goods-receipt design D7, D11): M1 arrivals, the M3
// order, the M7 list, a receipt, and the M2 stock of one item. The phone
// never gets order prices or average costs.
import { and, asc, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  goodsReceipt,
  goodsReceiptCost,
  goodsReceiptLine,
  inventoryLedger,
  item,
  location,
  purchaseOrder,
  purchaseOrderCost,
  purchaseOrderLine,
  supplier,
  user,
} from "@/db/schema";
import { arrivalLabel, type ArrivalLabel } from "@/domain/arrival";
import { addDays, type BusinessDate } from "@/domain/business-date";
import { CONDITIONS, type Condition } from "@/domain/condition";
import {
  isOpenLine,
  type ReceiptLineStatus,
  type ReceivingLine,
} from "@/domain/goods-receipt";
import type { AllocationMethod } from "@/domain/landed-cost";
import { toMoney, type Money } from "@/domain/money";
import type { PurchaseKind, PurchaseStatus } from "@/domain/purchase-order";
import { quantityFromDb, type QuantityUnit } from "@/domain/quantity";
import { receiptSummaries, receiptSummary } from "@/lib/purchasing/receipts";

import { orderIsMaterialsOnly, waitingText } from "./post";
import { currentScrapPrice } from "./scrap-price";

const milli = (value: string | null) =>
  value === null ? null : quantityFromDb(value, "KG").milli;

async function lineNames(db: Database, orderIds: readonly string[]) {
  if (orderIds.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: purchaseOrderLine.id, name: item.name })
    .from(purchaseOrderLine)
    .innerJoin(item, eq(item.id, purchaseOrderLine.itemId))
    .where(inArray(purchaseOrderLine.orderId, [...orderIds]));
  return new Map(rows.map((row) => [row.id, row.name]));
}

// ----------------------------------------------------------------- M1

export interface ArrivalCard {
  code: string;
  supplierName: string;
  kind: PurchaseKind;
  vehicle: string | null;
  label: ArrivalLabel;
  /** Lines still to count. */
  openLines: number;
  hasReceipts: boolean;
  /** "40 mâm giàn giáo 1,6m" while waiting for a backorder, else null. */
  waiting: string | null;
}

export interface Arrivals {
  cards: ArrivalCard[];
  /** Cards due today or late (the M1 greeting). */
  dueToday: number;
  /** Orders expected after tomorrow ("Xem N đơn ngày sau"). */
  later: number;
}

/** Every order in progress up to tomorrow, late and today first (D7). */
export async function arrivals(
  db: Database,
  today: BusinessDate,
  options: { includeLater?: boolean } = {},
): Promise<Arrivals> {
  const tomorrow = addDays(today, 1);
  const until = options.includeLater
    ? sql`true`
    : lte(purchaseOrder.expectedDate, tomorrow);
  const rows = await db
    .select({
      id: purchaseOrder.id,
      code: purchaseOrder.code,
      supplierName: supplier.name,
      kind: purchaseOrder.kind,
      vehicle: purchaseOrder.vehicle,
      expectedDate: purchaseOrder.expectedDate,
      expectedTime: purchaseOrder.expectedTime,
    })
    .from(purchaseOrder)
    .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .where(and(eq(purchaseOrder.status, "IN_PROGRESS"), until))
    .orderBy(
      asc(purchaseOrder.expectedDate),
      sql`${purchaseOrder.expectedTime} asc nulls last`,
      asc(purchaseOrder.code),
    );
  const [laterRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrder)
    .where(
      and(
        eq(purchaseOrder.status, "IN_PROGRESS"),
        sql`${purchaseOrder.expectedDate} > ${tomorrow}`,
      ),
    );
  const ids = rows.map((row) => row.id);
  const [summaries, names] = await Promise.all([
    receiptSummaries(db, ids),
    lineNames(db, ids),
  ]);
  const cards = rows.map((row): ArrivalCard => {
    const summary = summaries.get(row.id);
    const lines = summary?.lines ?? [];
    const hasReceipts = (summary?.trips ?? 0) > 0;
    return {
      code: row.code,
      supplierName: row.supplierName,
      kind: row.kind as PurchaseKind,
      vehicle: row.vehicle,
      label: arrivalLabel(
        row.expectedDate as BusinessDate,
        row.expectedTime,
        today,
      ),
      openLines: lines.filter(isOpenLine).length,
      hasReceipts,
      waiting: hasReceipts ? waitingText(lines, names) || null : null,
    };
  });
  return {
    cards,
    dueToday: cards.filter(
      (card) => card.label.day === "LATE" || card.label.day === "TODAY",
    ).length,
    later: options.includeLater ? 0 : (laterRow?.count ?? 0),
  };
}

// ----------------------------------------------------------------- M3

export interface ReceivingLineView extends ReceivingLine {
  itemName: string;
}

export interface OrderForReceiving {
  code: string;
  supplierName: string;
  kind: PurchaseKind;
  status: PurchaseStatus;
  allocationMethod: AllocationMethod;
  vehicle: string | null;
  /** The trip this receipt would be. */
  tripNo: number;
  /** Lines still to count or mark, without prices. */
  lines: ReceivingLineView[];
  /** First trip: the order's expected costs; later trips: none (0.2 #28). */
  prefilledCosts: { label: string; amount: Money }[];
  /** For the "chi phí cao" question (design D5b). */
  expectedCosts: Money;
  /** Places the trip may go into: active yards, plus workshops when
   * every line is a supply item (0.2 số 131). */
  yards: { id: string; code: string; name: string }[];
  /** Every order line is a supply item: a workshop may be chosen. */
  materialsOnly: boolean;
  scrapPrice: { pricePerKg: Money; createdAt: Date } | null;
}

export async function orderForReceiving(
  db: Database,
  code: string,
): Promise<OrderForReceiving | null> {
  const [order] = await db
    .select({
      id: purchaseOrder.id,
      code: purchaseOrder.code,
      supplierName: supplier.name,
      kind: purchaseOrder.kind,
      status: purchaseOrder.status,
      allocationMethod: purchaseOrder.allocationMethod,
      vehicle: purchaseOrder.vehicle,
    })
    .from(purchaseOrder)
    .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .where(eq(purchaseOrder.code, code));
  if (!order) return null;
  const materialsOnly = await orderIsMaterialsOnly(db, order.id);
  const [summary, names, costs, yards, price] = await Promise.all([
    receiptSummary(db, order.id),
    lineNames(db, [order.id]),
    db
      .select({
        label: purchaseOrderCost.label,
        amount: purchaseOrderCost.amount,
      })
      .from(purchaseOrderCost)
      .where(eq(purchaseOrderCost.orderId, order.id))
      .orderBy(asc(purchaseOrderCost.lineNo)),
    db
      .select({ id: location.id, code: location.code, name: location.name })
      .from(location)
      .where(
        and(
          inArray(
            location.type,
            materialsOnly ? ["YARD", "WORKSHOP"] : ["YARD"],
          ),
          eq(location.status, "ACTIVE"),
        ),
      )
      .orderBy(asc(location.code)),
    currentScrapPrice(db),
  ]);
  const expected = costs.map((cost) => ({
    label: cost.label,
    amount: toMoney(cost.amount),
  }));
  return {
    code: order.code,
    supplierName: order.supplierName,
    kind: order.kind as PurchaseKind,
    status: order.status as PurchaseStatus,
    allocationMethod: order.allocationMethod as AllocationMethod,
    vehicle: order.vehicle,
    tripNo: summary.trips + 1,
    lines: summary.lines.filter(isOpenLine).map((line) => ({
      ...line,
      itemName: names.get(line.orderLineId) ?? line.itemCode,
    })),
    prefilledCosts: summary.trips === 0 ? expected : [],
    expectedCosts: toMoney(
      expected.reduce((sum, cost) => sum + cost.amount, 0),
    ),
    yards,
    materialsOnly,
    scrapPrice: price
      ? { pricePerKg: price.pricePerKg, createdAt: price.createdAt }
      : null,
  };
}

// ----------------------------------------------------------------- M7

export interface ReceiptListRow {
  code: string;
  orderCode: string;
  supplierName: string;
  kind: PurchaseKind;
  /** Lines counted on the trip ("2 mã"). */
  countedItems: number;
  createdAt: Date;
}

export interface ReceiptDay {
  date: BusinessDate;
  receipts: ReceiptListRow[];
}

export interface ReceiptsByDay {
  days: ReceiptDay[];
  /** Receipts exist before the oldest day shown. */
  hasMore: boolean;
}

/** The `days` latest business days with receipts, before `before` if set. */
export async function receiptsByDay(
  db: Database,
  options: { before?: BusinessDate; days?: number } = {},
): Promise<ReceiptsByDay> {
  const count = options.days ?? 2;
  const dates = await db
    .selectDistinct({ date: goodsReceipt.businessDate })
    .from(goodsReceipt)
    .where(
      options.before
        ? lt(goodsReceipt.businessDate, options.before)
        : undefined,
    )
    .orderBy(desc(goodsReceipt.businessDate))
    .limit(count + 1);
  const shown = dates.slice(0, count).map((row) => row.date);
  if (shown.length === 0) return { days: [], hasMore: false };
  const rows = await db
    .select({
      code: goodsReceipt.code,
      date: goodsReceipt.businessDate,
      orderCode: purchaseOrder.code,
      supplierName: supplier.name,
      kind: purchaseOrder.kind,
      countedItems: sql<number>`(select count(*)::int from ${goodsReceiptLine} where ${goodsReceiptLine.receiptId} = ${goodsReceipt.id} and ${goodsReceiptLine.status} = 'COUNTED')`,
      createdAt: goodsReceipt.createdAt,
    })
    .from(goodsReceipt)
    .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.orderId))
    .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .where(inArray(goodsReceipt.businessDate, shown))
    .orderBy(desc(goodsReceipt.businessDate), desc(goodsReceipt.createdAt));
  return {
    days: shown.map((date) => ({
      date: date as BusinessDate,
      receipts: rows
        .filter((row) => row.date === date)
        .map((row) => ({
          code: row.code,
          orderCode: row.orderCode,
          supplierName: row.supplierName,
          kind: row.kind as PurchaseKind,
          countedItems: row.countedItems,
          createdAt: row.createdAt,
        })),
    })),
    hasMore: dates.length > count,
  };
}

// ------------------------------------------------------- receipt view

export interface ReceiptViewLine {
  itemCode: string;
  itemName: string;
  itemUnit: QuantityUnit;
  lineUnit: QuantityUnit;
  status: ReceiptLineStatus;
  quantityMilli: number;
  weighedKgMilli: number | null;
  split: Record<Condition, number>;
  awaitsRest: boolean;
}

export interface ReceiptView {
  id: string;
  code: string;
  orderCode: string;
  supplierName: string;
  kind: PurchaseKind;
  tripNo: number;
  businessDate: BusinessDate;
  arrivedAt: Date | null;
  createdAt: Date;
  vehicle: string | null;
  createdByName: string;
  locationName: string;
  scrapPricePerKg: Money | null;
  lines: ReceiptViewLine[];
  costs: { label: string; amount: Money }[];
  totalCosts: Money;
}

async function viewsOf(
  db: Database,
  where: ReturnType<typeof eq>,
): Promise<ReceiptView[]> {
  const heads = await db
    .select({
      id: goodsReceipt.id,
      code: goodsReceipt.code,
      orderCode: purchaseOrder.code,
      supplierName: supplier.name,
      kind: purchaseOrder.kind,
      tripNo: goodsReceipt.tripNo,
      businessDate: goodsReceipt.businessDate,
      arrivedAt: goodsReceipt.arrivedAt,
      createdAt: goodsReceipt.createdAt,
      vehicle: goodsReceipt.vehicle,
      createdByName: user.name,
      locationName: location.name,
      scrapPricePerKg: goodsReceipt.scrapPricePerKg,
    })
    .from(goodsReceipt)
    .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.orderId))
    .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .innerJoin(user, eq(user.id, goodsReceipt.createdBy))
    .innerJoin(location, eq(location.id, goodsReceipt.locationId))
    .where(where)
    .orderBy(asc(goodsReceipt.tripNo));
  if (heads.length === 0) return [];
  const ids = heads.map((head) => head.id);
  const [lines, costs] = await Promise.all([
    db
      .select({
        receiptId: goodsReceiptLine.receiptId,
        itemCode: item.code,
        itemName: item.name,
        itemUnit: item.unit,
        lineUnit: purchaseOrderLine.unit,
        status: goodsReceiptLine.status,
        quantity: goodsReceiptLine.quantity,
        weighedKg: goodsReceiptLine.weighedKg,
        qtyNew: goodsReceiptLine.qtyNew,
        qtyGood: goodsReceiptLine.qtyGood,
        qtyNeedsRepair: goodsReceiptLine.qtyNeedsRepair,
        qtyScrap: goodsReceiptLine.qtyScrap,
        awaitsRest: goodsReceiptLine.awaitsRest,
      })
      .from(goodsReceiptLine)
      .innerJoin(item, eq(item.id, goodsReceiptLine.itemId))
      .innerJoin(
        purchaseOrderLine,
        eq(purchaseOrderLine.id, goodsReceiptLine.orderLineId),
      )
      .where(inArray(goodsReceiptLine.receiptId, ids))
      .orderBy(asc(goodsReceiptLine.lineNo)),
    db
      .select({
        receiptId: goodsReceiptCost.receiptId,
        label: goodsReceiptCost.label,
        amount: goodsReceiptCost.amount,
      })
      .from(goodsReceiptCost)
      .where(inArray(goodsReceiptCost.receiptId, ids))
      .orderBy(asc(goodsReceiptCost.lineNo)),
  ]);
  return heads.map((head) => {
    const own = costs
      .filter((cost) => cost.receiptId === head.id)
      .map((cost) => ({ label: cost.label, amount: toMoney(cost.amount) }));
    return {
      ...head,
      kind: head.kind as PurchaseKind,
      businessDate: head.businessDate as BusinessDate,
      scrapPricePerKg:
        head.scrapPricePerKg === null ? null : toMoney(head.scrapPricePerKg),
      lines: lines
        .filter((line) => line.receiptId === head.id)
        .map((line) => ({
          itemCode: line.itemCode,
          itemName: line.itemName,
          itemUnit: line.itemUnit as QuantityUnit,
          lineUnit: line.lineUnit as QuantityUnit,
          status: line.status as ReceiptLineStatus,
          quantityMilli: milli(line.quantity) ?? 0,
          weighedKgMilli: milli(line.weighedKg),
          split: {
            NEW: milli(line.qtyNew) ?? 0,
            GOOD: milli(line.qtyGood) ?? 0,
            NEEDS_REPAIR: milli(line.qtyNeedsRepair) ?? 0,
            SCRAP: milli(line.qtyScrap) ?? 0,
          },
          awaitsRest: line.awaitsRest,
        })),
      costs: own,
      totalCosts: toMoney(own.reduce((sum, cost) => sum + cost.amount, 0)),
    };
  });
}

export async function receiptByCode(
  db: Database,
  code: string,
): Promise<ReceiptView | null> {
  return (await viewsOf(db, eq(goodsReceipt.code, code)))[0] ?? null;
}

/** Every receipt of an order, oldest trip first (D3b "Các chuyến nhập"). */
export function receiptsOfOrder(
  db: Database,
  orderId: string,
): Promise<ReceiptView[]> {
  return viewsOf(db, eq(goodsReceipt.orderId, orderId));
}

// ----------------------------------------------------------------- M2

export interface StockLookup {
  code: string;
  name: string;
  unit: QuantityUnit;
  standardWeightKg: string | null;
  /** Yard stock by condition, in thousandths of the unit. */
  yard: Record<Condition, number>;
  workshop: number;
  sites: number;
}

/** One item's stock by place and condition; no cost (design D13). */
export async function stockLookup(
  db: Database,
  code: string,
): Promise<StockLookup | null> {
  const [found] = await db
    .select({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      standardWeightKg: item.standardWeightKg,
    })
    .from(item)
    .where(eq(item.code, code));
  if (!found) return null;
  const rows = await db
    .select({
      condition: inventoryLedger.condition,
      type: location.type,
      total: sql<string>`sum(${inventoryLedger.quantity})`,
    })
    .from(inventoryLedger)
    .innerJoin(location, eq(location.id, inventoryLedger.locationId))
    .where(eq(inventoryLedger.itemId, found.id))
    .groupBy(inventoryLedger.condition, location.type);
  const yard = Object.fromEntries(CONDITIONS.map((c) => [c, 0])) as Record<
    Condition,
    number
  >;
  let workshop = 0;
  let sites = 0;
  for (const row of rows) {
    const amount = milli(row.total) ?? 0;
    if (row.type === "YARD") yard[row.condition as Condition] += amount;
    else if (row.type === "WORKSHOP") workshop += amount;
    else sites += amount;
  }
  return {
    code: found.code,
    name: found.name,
    unit: found.unit as QuantityUnit,
    standardWeightKg: found.standardWeightKg,
    yard,
    workshop,
    sites,
  };
}

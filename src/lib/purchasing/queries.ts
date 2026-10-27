// Reading purchase orders for D2, D3 and D3b (purchase-orders design D8).
// Totals come from the lines every time; nothing derived is stored.
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  item,
  purchaseOrder,
  purchaseOrderCost,
  purchaseOrderEvent,
  purchaseOrderLine,
  supplier,
  user,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { AllocationMethod } from "@/domain/landed-cost";
import { toMoney, type Money } from "@/domain/money";
import {
  editableFields,
  orderLineAmount,
  orderTotals,
  type EditableFields,
  type OrderTotals,
  type PurchaseKind,
  type PurchaseOutcome,
  type PurchaseStatus,
} from "@/domain/purchase-order";
import { quantityFromDb, type QuantityUnit } from "@/domain/quantity";
import { toSearchText } from "@/domain/search-text";
import { escapeLike } from "@/lib/catalog/items";

import { hasReceiptsSql, receiptSummary } from "./receipts";

export const ORDER_TABS = [
  "all",
  "draft",
  "waiting",
  "receiving",
  "done",
] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export const ORDER_TAB_LABELS: Readonly<Record<OrderTab, string>> = {
  all: "Tất cả",
  draft: "Nháp",
  waiting: "Chờ xe về",
  receiving: "Đang nhận",
  done: "Đã nhập",
};

export const PAGE_SIZE = 20;

export interface OrderFilter {
  tab?: OrderTab;
  q?: string;
  kind?: PurchaseKind;
  page?: number;
}

export interface OrderListRow {
  id: string;
  code: string;
  supplierName: string;
  kind: PurchaseKind;
  expectedDate: string | null;
  expectedTime: string | null;
  lineCount: number;
  total: Money;
  status: PurchaseStatus;
  outcome: PurchaseOutcome | null;
  hasReceipts: boolean;
}

export interface OrderList {
  rows: OrderListRow[];
  counts: Record<OrderTab, number>;
  /** Orders of the current tab, for paging. */
  total: number;
  page: number;
  pageCount: number;
  arrivingToday: number;
}

const received = hasReceiptsSql(purchaseOrder.id);

function tabCondition(tab: OrderTab): SQL | undefined {
  switch (tab) {
    case "all":
      return undefined;
    case "draft":
      return eq(purchaseOrder.status, "DRAFT");
    case "waiting":
      return sql`${purchaseOrder.status} = 'IN_PROGRESS' and not ${received}`;
    case "receiving":
      return sql`${purchaseOrder.status} = 'IN_PROGRESS' and ${received}`;
    case "done":
      return sql`${purchaseOrder.status} = 'DONE' and ${purchaseOrder.outcome} <> 'CANCELLED'`;
  }
}

function filterConditions(filter: OrderFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.kind) conditions.push(eq(purchaseOrder.kind, filter.kind));
  const q = toSearchText(filter.q);
  if (q) {
    const term = `%${escapeLike(q)}%`;
    const found = or(
      ilike(supplier.searchText, term),
      ilike(purchaseOrder.code, term),
    );
    if (found) conditions.push(found);
  }
  return conditions;
}

const goodsSql = sql<string>`coalesce((select sum(round(${purchaseOrderLine.quantity} * ${purchaseOrderLine.unitPrice})) from ${purchaseOrderLine} where ${purchaseOrderLine.orderId} = ${purchaseOrder.id}), 0)`;
const costsSql = sql<string>`coalesce((select sum(${purchaseOrderCost.amount}) from ${purchaseOrderCost} where ${purchaseOrderCost.orderId} = ${purchaseOrder.id}), 0)`;

/**
 * D2: the tab's orders, open ones first (nearest expected date first), then
 * drafts, then finished ones (newest first); counts of every tab.
 */
export async function listOrders(
  db: Database,
  filter: OrderFilter,
  today: BusinessDate,
): Promise<OrderList> {
  const tab = filter.tab ?? "all";
  const base = filterConditions(filter);
  const countRows = await db
    .select({
      all: sql<number>`count(*)::int`,
      draft: sql<number>`(count(*) filter (where ${tabCondition("draft")}))::int`,
      waiting: sql<number>`(count(*) filter (where ${tabCondition("waiting")}))::int`,
      receiving: sql<number>`(count(*) filter (where ${tabCondition("receiving")}))::int`,
      done: sql<number>`(count(*) filter (where ${tabCondition("done")}))::int`,
    })
    .from(purchaseOrder)
    .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .where(base.length ? and(...base) : undefined);
  const counts = countRows[0] ?? {
    all: 0,
    draft: 0,
    waiting: 0,
    receiving: 0,
    done: 0,
  };
  const total = counts[tab];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filter.page ?? 1), pageCount);
  const where = [...base];
  const tabWhere = tabCondition(tab);
  if (tabWhere) where.push(tabWhere);
  const rows = await db
    .select({
      id: purchaseOrder.id,
      code: purchaseOrder.code,
      supplierName: supplier.name,
      kind: purchaseOrder.kind,
      expectedDate: purchaseOrder.expectedDate,
      expectedTime: purchaseOrder.expectedTime,
      status: purchaseOrder.status,
      outcome: purchaseOrder.outcome,
      lineCount: sql<number>`(select count(*)::int from ${purchaseOrderLine} where ${purchaseOrderLine.orderId} = ${purchaseOrder.id})`,
      goods: goodsSql,
      costs: costsSql,
      hasReceipts: received,
    })
    .from(purchaseOrder)
    .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(
      sql`case ${purchaseOrder.status} when 'IN_PROGRESS' then 0 when 'DRAFT' then 1 else 2 end`,
      sql`case when ${purchaseOrder.status} = 'IN_PROGRESS' then ${purchaseOrder.expectedDate} end asc nulls last`,
      sql`case when ${purchaseOrder.status} = 'IN_PROGRESS' then ${purchaseOrder.expectedTime} end asc nulls last`,
      desc(purchaseOrder.createdAt),
      desc(purchaseOrder.code),
    )
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const [arriving] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrder)
    .where(
      and(
        eq(purchaseOrder.status, "IN_PROGRESS"),
        eq(purchaseOrder.expectedDate, today),
      ),
    );
  return {
    rows: rows.map((row) => ({
      id: row.id,
      code: row.code,
      supplierName: row.supplierName,
      kind: row.kind as PurchaseKind,
      expectedDate: row.expectedDate,
      expectedTime: row.expectedTime?.slice(0, 5) ?? null,
      lineCount: row.lineCount,
      total: toMoney(Number(row.goods) + Number(row.costs)),
      status: row.status as PurchaseStatus,
      outcome: row.outcome as PurchaseOutcome | null,
      hasReceipts: Boolean(row.hasReceipts),
    })),
    counts,
    total,
    page,
    pageCount,
    arrivingToday: arriving?.count ?? 0,
  };
}

export interface OrderLineRow {
  lineNo: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemUnit: QuantityUnit;
  standardWeightKg: string | null;
  unit: QuantityUnit;
  /** Thousandths of the line unit. */
  quantity: number;
  unitPrice: Money;
  amount: Money;
  /** Received so far, thousandths of the line unit; null before receipts. */
  received: number | null;
}

export interface OrderEventRow {
  id: number;
  kind: string;
  actorName: string;
  note: string | null;
  createdAt: Date;
}

export interface OrderDetail {
  id: string;
  code: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  kind: PurchaseKind;
  status: PurchaseStatus;
  outcome: PurchaseOutcome | null;
  expectedDate: string | null;
  expectedTime: string | null;
  vehicle: string | null;
  note: string | null;
  allocationMethod: AllocationMethod;
  endReason: string | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  lines: OrderLineRow[];
  costs: { label: string; amount: Money }[];
  events: OrderEventRow[];
  totals: OrderTotals;
  trips: number;
  hasReceipts: boolean;
  editable: EditableFields;
}

const creator = alias(user, "creator");

export async function getOrderByCode(
  db: Database,
  code: string,
): Promise<OrderDetail | null> {
  const [head] = await db
    .select({
      id: purchaseOrder.id,
      code: purchaseOrder.code,
      supplierId: purchaseOrder.supplierId,
      supplierCode: supplier.code,
      supplierName: supplier.name,
      kind: purchaseOrder.kind,
      status: purchaseOrder.status,
      outcome: purchaseOrder.outcome,
      expectedDate: purchaseOrder.expectedDate,
      expectedTime: purchaseOrder.expectedTime,
      vehicle: purchaseOrder.vehicle,
      note: purchaseOrder.note,
      allocationMethod: purchaseOrder.allocationMethod,
      endReason: purchaseOrder.endReason,
      createdByName: creator.name,
      createdAt: purchaseOrder.createdAt,
      updatedAt: purchaseOrder.updatedAt,
    })
    .from(purchaseOrder)
    .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .innerJoin(creator, eq(creator.id, purchaseOrder.createdBy))
    .where(eq(purchaseOrder.code, code));
  if (!head) return null;
  const [lineRows, costRows, eventRows, receipts] = await Promise.all([
    db
      .select({
        lineNo: purchaseOrderLine.lineNo,
        itemId: purchaseOrderLine.itemId,
        itemCode: item.code,
        itemName: item.name,
        itemUnit: item.unit,
        standardWeightKg: item.standardWeightKg,
        unit: purchaseOrderLine.unit,
        quantity: purchaseOrderLine.quantity,
        unitPrice: purchaseOrderLine.unitPrice,
      })
      .from(purchaseOrderLine)
      .innerJoin(item, eq(item.id, purchaseOrderLine.itemId))
      .where(eq(purchaseOrderLine.orderId, head.id))
      .orderBy(asc(purchaseOrderLine.lineNo)),
    db
      .select({
        label: purchaseOrderCost.label,
        amount: purchaseOrderCost.amount,
      })
      .from(purchaseOrderCost)
      .where(eq(purchaseOrderCost.orderId, head.id))
      .orderBy(asc(purchaseOrderCost.lineNo)),
    db
      .select({
        id: purchaseOrderEvent.id,
        kind: purchaseOrderEvent.kind,
        actorName: user.name,
        note: purchaseOrderEvent.note,
        createdAt: purchaseOrderEvent.createdAt,
      })
      .from(purchaseOrderEvent)
      .innerJoin(user, eq(user.id, purchaseOrderEvent.actorId))
      .where(eq(purchaseOrderEvent.orderId, head.id))
      .orderBy(desc(purchaseOrderEvent.id)),
    receiptSummary(db, head.id),
  ]);
  const lines = lineRows.map((line): OrderLineRow => {
    const quantity = quantityFromDb(line.quantity, "KG").milli;
    const unitPrice = toMoney(line.unitPrice);
    return {
      lineNo: line.lineNo,
      itemId: line.itemId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      itemUnit: line.itemUnit as QuantityUnit,
      standardWeightKg: line.standardWeightKg,
      unit: line.unit as QuantityUnit,
      quantity,
      unitPrice,
      amount: orderLineAmount(quantity, unitPrice),
      received:
        receipts.trips > 0
          ? (receipts.receivedByItem.get(line.itemId) ?? 0)
          : null,
    };
  });
  const costs = costRows.map((cost) => ({
    label: cost.label,
    amount: toMoney(cost.amount),
  }));
  const status = head.status as PurchaseStatus;
  const hasReceipts = receipts.trips > 0;
  return {
    ...head,
    kind: head.kind as PurchaseKind,
    status,
    outcome: head.outcome as PurchaseOutcome | null,
    expectedTime: head.expectedTime?.slice(0, 5) ?? null,
    allocationMethod: head.allocationMethod as AllocationMethod,
    lines,
    costs,
    events: eventRows,
    totals: orderTotals(
      lines.map((line) => ({
        quantityMilli: line.quantity,
        unitPrice: line.unitPrice,
      })),
      costs,
    ),
    trips: receipts.trips,
    hasReceipts,
    editable: editableFields({ status, hasReceipts }),
  };
}

export interface OrderFormOptions {
  suppliers: { id: string; code: string; name: string }[];
  items: {
    id: string;
    code: string;
    name: string;
    unit: QuantityUnit;
    standardWeightKg: string | null;
  }[];
}

/** Active suppliers and items for the D3 pickers. */
export async function orderFormOptions(
  db: Database,
): Promise<OrderFormOptions> {
  const [suppliers, items] = await Promise.all([
    db
      .select({ id: supplier.id, code: supplier.code, name: supplier.name })
      .from(supplier)
      .where(eq(supplier.status, "ACTIVE"))
      .orderBy(asc(supplier.name)),
    db
      .select({
        id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        standardWeightKg: item.standardWeightKg,
      })
      .from(item)
      .where(eq(item.status, "ACTIVE"))
      .orderBy(asc(item.code)),
  ]);
  return {
    suppliers,
    items: items.map((row) => ({ ...row, unit: row.unit as QuantityUnit })),
  };
}

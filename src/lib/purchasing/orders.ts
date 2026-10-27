// Purchase orders (purchase-orders spec, design D2, D6, D8). Every write is
// one transaction: the order row FOR UPDATE, the supplier and the items it
// names FOR SHARE. Orders never touch the inventory ledger (D1).
import { asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  item,
  purchaseOrder,
  purchaseOrderCost,
  purchaseOrderEvent,
  purchaseOrderLine,
  supplier,
} from "@/db/schema";
import { isBusinessDate, toBusinessDate } from "@/domain/business-date";
import { DomainValueError } from "@/domain/errors";
import {
  ALLOCATION_METHODS,
  type AllocationMethod,
} from "@/domain/landed-cost";
import {
  checkOrderCosts,
  checkOrderLines,
  editableFields,
  endReason,
  PURCHASE_KINDS,
  PURCHASE_MESSAGES,
  PURCHASE_PREFIX,
  PurchaseFieldError,
  transition,
  type OrderState,
  type PurchaseCommand,
  type PurchaseKind,
  type PurchaseOutcome,
  type PurchaseStatus,
} from "@/domain/purchase-order";
import {
  quantityFromDb,
  quantityToDb,
  type QuantityUnit,
} from "@/domain/quantity";
import {
  conflict,
  notFound,
  ok,
  optionalText,
  ServiceFailure,
  type Actor,
  type ServiceResult,
} from "@/lib/catalog/common";
import { nextDocumentCode } from "@/lib/inventory/counter";

import { receiptSummary } from "./receipts";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const ORDER_SERVICE_MESSAGES = {
  kind: "Chọn loại hàng",
  date: "Ngày dự kiến không hợp lệ",
  time: "Giờ dự kiến không hợp lệ (VD 14:00)",
  allocation: "Chọn cách chia chi phí",
  vehicleTooLong: "Phương tiện dài tối đa 100 ký tự",
  noteTooLong: "Ghi chú dài tối đa 1000 ký tự",
  tooManyLines: "Đơn tối đa 100 dòng hàng",
  tooManyCosts: "Đơn tối đa 20 khoản chi phí",
  unit: "Chọn đơn vị cái hoặc kg",
  quantity: "Số lượng không hợp lệ",
} as const;

const MAX_LINES = 100;
const MAX_COSTS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface OrderLineBody {
  itemId?: string;
  unit?: string;
  /** numeric(14,3) text: "200", "1250.5". */
  quantity?: string;
  unitPrice?: number;
}

export interface OrderCostBody {
  label?: string;
  amount?: number;
}

export interface OrderBody {
  supplierId?: string;
  kind?: string;
  expectedDate?: string | null;
  expectedTime?: string | null;
  vehicle?: string | null;
  note?: string | null;
  allocationMethod?: string;
  lines?: OrderLineBody[];
  costs?: OrderCostBody[];
  /** The order's updatedAt the form was opened with (edits only). */
  updatedAt?: string;
}

export interface WriteOptions {
  /** Clock for the yearly code; tests pass a fixed instant. */
  now?: Date;
}

/** A field error answers 422 with the field; other rule breaks 409. */
async function run<T>(
  body: () => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  try {
    return await body();
  } catch (error: unknown) {
    if (error instanceof ServiceFailure) return error.result;
    if (error instanceof PurchaseFieldError) {
      return {
        ok: false,
        status: 422,
        error: error.message,
        field: error.field,
      };
    }
    if (error instanceof DomainValueError) return conflict(error.message);
    throw error;
  }
}

const fieldError = (message: string, field: string) =>
  new PurchaseFieldError(message, field);

// ----------------------------------------------------------- checking

interface CheckedLine {
  itemId: string;
  unit: QuantityUnit;
  quantity: string;
  unitPrice: number;
}

interface CheckedOrder {
  supplierId: string;
  kind: PurchaseKind;
  expectedDate: string | null;
  expectedTime: string | null;
  vehicle: string | null;
  note: string | null;
  allocationMethod: AllocationMethod;
  lines: CheckedLine[];
  costs: { label: string; amount: number }[];
}

function limited(
  value: string | null | undefined,
  max: number,
  message: string,
  field: string,
) {
  const text = optionalText(value);
  if (text && text.length > max) throw fieldError(message, field);
  return text;
}

/** Supplier, still active, held FOR SHARE until the transaction ends. */
async function lockSupplier(tx: Tx, supplierId: string | undefined) {
  if (!supplierId || !UUID.test(supplierId)) {
    throw fieldError(PURCHASE_MESSAGES.supplier, "supplierId");
  }
  const [row] = await tx
    .select({ id: supplier.id, code: supplier.code, status: supplier.status })
    .from(supplier)
    .where(eq(supplier.id, supplierId))
    .for("share");
  if (!row) throw fieldError(PURCHASE_MESSAGES.supplier, "supplierId");
  if (row.status !== "ACTIVE") {
    throw new ServiceFailure({
      ...conflict(PURCHASE_MESSAGES.supplierArchived(row.code)),
      field: "supplierId",
    });
  }
}

/** Items of the lines, active, held FOR SHARE in id order (no deadlock). */
async function lockItems(tx: Tx, ids: readonly string[]) {
  const unique = [...new Set(ids)].sort();
  const rows = unique.length
    ? await tx
        .select({
          id: item.id,
          code: item.code,
          unit: item.unit,
          status: item.status,
        })
        .from(item)
        .where(inArray(item.id, unique))
        .orderBy(asc(item.id))
        .for("share")
    : [];
  return new Map(rows.map((row) => [row.id, row]));
}

async function checkOrder(tx: Tx, body: OrderBody): Promise<CheckedOrder> {
  await lockSupplier(tx, body.supplierId);
  if (!(PURCHASE_KINDS as readonly string[]).includes(body.kind ?? "")) {
    throw fieldError(ORDER_SERVICE_MESSAGES.kind, "kind");
  }
  const expectedDate = optionalText(body.expectedDate);
  if (expectedDate && !isBusinessDate(expectedDate)) {
    throw fieldError(ORDER_SERVICE_MESSAGES.date, "expectedDate");
  }
  const expectedTime = optionalText(body.expectedTime);
  if (expectedTime && !TIME.test(expectedTime)) {
    throw fieldError(ORDER_SERVICE_MESSAGES.time, "expectedTime");
  }
  const method = body.allocationMethod ?? "VALUE";
  if (!(ALLOCATION_METHODS as readonly string[]).includes(method)) {
    throw fieldError(ORDER_SERVICE_MESSAGES.allocation, "allocationMethod");
  }
  const rawLines = body.lines ?? [];
  if (rawLines.length > MAX_LINES) {
    throw fieldError(ORDER_SERVICE_MESSAGES.tooManyLines, "lines");
  }
  const rawCosts = body.costs ?? [];
  if (rawCosts.length > MAX_COSTS) {
    throw fieldError(ORDER_SERVICE_MESSAGES.tooManyCosts, "costs");
  }
  rawLines.forEach((line, index) => {
    if (!line.itemId || !UUID.test(line.itemId)) {
      throw fieldError(PURCHASE_MESSAGES.itemMissing, `lines.${index}.itemId`);
    }
  });
  const items = await lockItems(
    tx,
    rawLines.map((line) => line.itemId ?? ""),
  );
  const lines = rawLines.map((line, index) => {
    const found = items.get(line.itemId ?? "");
    if (!found) {
      throw fieldError(PURCHASE_MESSAGES.itemMissing, `lines.${index}.itemId`);
    }
    if (found.status !== "ACTIVE") {
      throw new ServiceFailure({
        ...conflict(PURCHASE_MESSAGES.itemArchived(found.code)),
        field: `lines.${index}.itemId`,
      });
    }
    if (line.unit !== "PIECE" && line.unit !== "KG") {
      throw fieldError(ORDER_SERVICE_MESSAGES.unit, `lines.${index}.unit`);
    }
    let quantityMilli: number;
    try {
      // KG keeps three decimals; whole pieces are checked by the domain.
      quantityMilli = quantityFromDb((line.quantity ?? "").trim(), "KG").milli;
    } catch {
      throw fieldError(
        ORDER_SERVICE_MESSAGES.quantity,
        `lines.${index}.quantity`,
      );
    }
    return {
      itemCode: found.code,
      itemUnit: found.unit as QuantityUnit,
      unit: line.unit as QuantityUnit,
      quantityMilli,
      unitPrice: line.unitPrice ?? -1,
      itemId: found.id,
    };
  });
  checkOrderLines(lines);
  const costs = checkOrderCosts(
    rawCosts.map((cost) => ({
      label: cost.label ?? "",
      amount: cost.amount ?? 0,
    })),
  );
  return {
    supplierId: body.supplierId ?? "",
    kind: body.kind as PurchaseKind,
    expectedDate,
    expectedTime,
    vehicle: limited(
      body.vehicle,
      100,
      ORDER_SERVICE_MESSAGES.vehicleTooLong,
      "vehicle",
    ),
    note: limited(body.note, 1000, ORDER_SERVICE_MESSAGES.noteTooLong, "note"),
    allocationMethod: method as AllocationMethod,
    lines: lines.map((line) => ({
      itemId: line.itemId,
      unit: line.unit,
      quantity: quantityToDb({ unit: "KG", milli: line.quantityMilli }),
      unitPrice: line.unitPrice,
    })),
    costs,
  };
}

/** The purchase_order columns of a checked body. */
function headOf(order: CheckedOrder) {
  return {
    supplierId: order.supplierId,
    kind: order.kind,
    expectedDate: order.expectedDate,
    expectedTime: order.expectedTime,
    vehicle: order.vehicle,
    note: order.note,
    allocationMethod: order.allocationMethod,
  };
}

async function writeLines(tx: Tx, orderId: string, order: CheckedOrder) {
  await tx
    .delete(purchaseOrderLine)
    .where(eq(purchaseOrderLine.orderId, orderId));
  await tx
    .delete(purchaseOrderCost)
    .where(eq(purchaseOrderCost.orderId, orderId));
  if (order.lines.length) {
    await tx.insert(purchaseOrderLine).values(
      order.lines.map((line, index) => ({
        ...line,
        orderId,
        lineNo: index + 1,
      })),
    );
  }
  if (order.costs.length) {
    await tx.insert(purchaseOrderCost).values(
      order.costs.map((cost, index) => ({
        ...cost,
        orderId,
        lineNo: index + 1,
      })),
    );
  }
}

async function addEvent(
  tx: Tx,
  orderId: string,
  kind: "CREATED" | "PLACED" | "UPDATED" | "CANCELLED" | "CLOSED",
  actor: Actor,
  note: string | null = null,
) {
  await tx
    .insert(purchaseOrderEvent)
    .values({ orderId, kind, actorId: actor.id, note });
}

// ----------------------------------------------------------- state

interface LockedOrder {
  id: string;
  code: string;
  status: PurchaseStatus;
  outcome: PurchaseOutcome | null;
  supplierId: string;
  kind: string;
  allocationMethod: string;
  expectedDate: string | null;
  updatedAt: Date;
}

async function lockOrder(tx: Tx, code: string): Promise<LockedOrder> {
  const [row] = await tx
    .select({
      id: purchaseOrder.id,
      code: purchaseOrder.code,
      status: purchaseOrder.status,
      outcome: purchaseOrder.outcome,
      supplierId: purchaseOrder.supplierId,
      kind: purchaseOrder.kind,
      allocationMethod: purchaseOrder.allocationMethod,
      expectedDate: purchaseOrder.expectedDate,
      updatedAt: purchaseOrder.updatedAt,
    })
    .from(purchaseOrder)
    .where(eq(purchaseOrder.code, code))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return {
    ...row,
    status: row.status as PurchaseStatus,
    outcome: row.outcome as PurchaseOutcome | null,
  };
}

async function stateOf(tx: Tx, order: LockedOrder): Promise<OrderState> {
  const [lines, receipts] = await Promise.all([
    tx
      .select({ id: purchaseOrderLine.id })
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.orderId, order.id)),
    receiptSummary(tx, order.id),
  ]);
  return {
    code: order.code,
    status: order.status,
    outcome: order.outcome,
    hasReceipts: receipts.trips > 0,
    lineCount: lines.length,
    expectedDate: order.expectedDate,
  };
}

/** Places a locked draft: supplier and items checked again (spec). */
async function placeLocked(tx: Tx, actor: Actor, order: LockedOrder) {
  const state = await stateOf(tx, order);
  const next = transition(state, "PLACE");
  await lockSupplier(tx, order.supplierId);
  const lines = await tx
    .select({ itemId: purchaseOrderLine.itemId })
    .from(purchaseOrderLine)
    .where(eq(purchaseOrderLine.orderId, order.id));
  const items = await lockItems(
    tx,
    lines.map((line) => line.itemId),
  );
  for (const found of items.values()) {
    if (found.status !== "ACTIVE") {
      throw new ServiceFailure(
        conflict(PURCHASE_MESSAGES.itemArchived(found.code)),
      );
    }
  }
  const now = new Date();
  await tx
    .update(purchaseOrder)
    .set({
      status: next.status,
      placedBy: actor.id,
      placedAt: now,
      updatedAt: now,
    })
    .where(eq(purchaseOrder.id, order.id));
  await addEvent(tx, order.id, "PLACED", actor);
}

// ----------------------------------------------------------- writing

export interface CreatedOrder {
  id: string;
  code: string;
}

/** "Lưu nháp" (place: false) or "Lưu đơn" (place: true) on D3. */
export function createOrder(
  db: Database,
  actor: Actor,
  body: OrderBody,
  options: WriteOptions & { place?: boolean } = {},
): Promise<ServiceResult<CreatedOrder>> {
  return run(async () => {
    const created = await db.transaction(async (tx) => {
      const order = await checkOrder(tx, body);
      const year = Number(
        toBusinessDate(options.now ?? new Date()).slice(0, 4),
      );
      const code = await nextDocumentCode(tx, PURCHASE_PREFIX, year);
      const [row] = await tx
        .insert(purchaseOrder)
        .values({ ...headOf(order), code, createdBy: actor.id })
        .returning();
      if (!row) throw new Error("purchase order insert returned nothing");
      await writeLines(tx, row.id, order);
      await addEvent(tx, row.id, "CREATED", actor);
      if (options.place) {
        await placeLocked(tx, actor, {
          ...row,
          status: "DRAFT",
          outcome: null,
        });
      }
      return { id: row.id, code };
    });
    return ok(created);
  });
}

function sameLocked(
  current: Awaited<ReturnType<typeof readForCompare>>,
  next: CheckedOrder,
) {
  return (
    current.supplierId === next.supplierId &&
    current.kind === next.kind &&
    current.allocationMethod === next.allocationMethod &&
    JSON.stringify(current.lines) === JSON.stringify(next.lines) &&
    JSON.stringify(current.costs) === JSON.stringify(next.costs)
  );
}

async function readForCompare(tx: Tx, order: LockedOrder) {
  const [lines, costs] = await Promise.all([
    tx
      .select({
        itemId: purchaseOrderLine.itemId,
        unit: purchaseOrderLine.unit,
        quantity: purchaseOrderLine.quantity,
        unitPrice: purchaseOrderLine.unitPrice,
      })
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.orderId, order.id))
      .orderBy(asc(purchaseOrderLine.lineNo)),
    tx
      .select({
        label: purchaseOrderCost.label,
        amount: purchaseOrderCost.amount,
      })
      .from(purchaseOrderCost)
      .where(eq(purchaseOrderCost.orderId, order.id))
      .orderBy(asc(purchaseOrderCost.lineNo)),
  ]);
  return {
    supplierId: order.supplierId,
    kind: order.kind,
    allocationMethod: order.allocationMethod,
    lines,
    costs,
  };
}

/** Edit from D3 (design D6, D8): whole body, guarded by updatedAt. */
export function updateOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: OrderBody,
): Promise<ServiceResult<CreatedOrder>> {
  return run(async () => {
    const updated = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, code);
      const seen = body.updatedAt ? new Date(body.updatedAt).getTime() : NaN;
      if (seen !== order.updatedAt.getTime()) {
        throw new ServiceFailure(conflict(PURCHASE_MESSAGES.stale));
      }
      const state = await stateOf(tx, order);
      const editable = editableFields(state);
      if (editable === "NONE") {
        throw new DomainValueError(PURCHASE_MESSAGES.done(order.code));
      }
      const next = await checkOrder(tx, body);
      if (editable === "SCHEDULE") {
        if (!sameLocked(await readForCompare(tx, order), next)) {
          throw new DomainValueError(PURCHASE_MESSAGES.editLocked);
        }
      }
      if (order.status !== "DRAFT") {
        // A placed order keeps what placing it required.
        if (!next.expectedDate) {
          throw new PurchaseFieldError(
            PURCHASE_MESSAGES.noDate,
            "expectedDate",
          );
        }
        if (next.lines.length === 0) {
          throw new PurchaseFieldError(PURCHASE_MESSAGES.noLines, "lines");
        }
      }
      const head = headOf(next);
      await tx
        .update(purchaseOrder)
        .set(
          editable === "SCHEDULE"
            ? {
                expectedDate: head.expectedDate,
                expectedTime: head.expectedTime,
                vehicle: head.vehicle,
                note: head.note,
                updatedAt: new Date(),
              }
            : { ...head, updatedAt: new Date() },
        )
        .where(eq(purchaseOrder.id, order.id));
      if (editable === "ALL") await writeLines(tx, order.id, next);
      if (order.status !== "DRAFT") {
        await addEvent(tx, order.id, "UPDATED", actor);
      }
      return { id: order.id, code: order.code };
    });
    return ok(updated);
  });
}

export function placeOrder(
  db: Database,
  actor: Actor,
  code: string,
): Promise<ServiceResult<CreatedOrder>> {
  return run(async () => {
    const placed = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, code);
      await placeLocked(tx, actor, order);
      return { id: order.id, code: order.code };
    });
    return ok(placed);
  });
}

function endOrder(
  db: Database,
  actor: Actor,
  code: string,
  command: Extract<PurchaseCommand, "CANCEL" | "CLOSE">,
  reason: string | null | undefined,
): Promise<ServiceResult<CreatedOrder>> {
  return run(async () => {
    const ended = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, code);
      const next = transition(await stateOf(tx, order), command, reason);
      const text = endReason(reason, command === "CANCEL");
      const now = new Date();
      await tx
        .update(purchaseOrder)
        .set({
          status: next.status,
          outcome: next.outcome,
          endReason: text,
          endedBy: actor.id,
          endedAt: now,
          updatedAt: now,
        })
        .where(eq(purchaseOrder.id, order.id));
      await addEvent(
        tx,
        order.id,
        command === "CANCEL" ? "CANCELLED" : "CLOSED",
        actor,
        text,
      );
      return { id: order.id, code: order.code };
    });
    return ok(ended);
  });
}

export const cancelOrder = (
  db: Database,
  actor: Actor,
  code: string,
  reason: string | null | undefined,
) => endOrder(db, actor, code, "CANCEL", reason);

export const closeOrder = (
  db: Database,
  actor: Actor,
  code: string,
  reason: string | null | undefined,
) => endOrder(db, actor, code, "CLOSE", reason);

/** Only drafts go away for good; a placed order is cancelled instead. */
export function deleteOrder(
  db: Database,
  code: string,
): Promise<ServiceResult<null>> {
  return run(async () => {
    await db.transaction(async (tx) => {
      const order = await lockOrder(tx, code);
      if (order.status !== "DRAFT") {
        throw new DomainValueError(PURCHASE_MESSAGES.deletePlaced);
      }
      await tx.delete(purchaseOrder).where(eq(purchaseOrder.id, order.id));
    });
    return ok(null);
  });
}

// Posting one truck trip (goods-receipt design D5): one transaction that
// locks the order, checks the trip against its open lines, books
// PURCHASE_IN lines into the ledger, saves the receipt and moves the order.
// The draft id from the phone makes a resend return the same receipt (D1).
import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  goodsReceipt,
  goodsReceiptCost,
  goodsReceiptLine,
  item,
  location,
  purchaseOrder,
  purchaseOrderCost,
  purchaseOrderEvent,
  purchaseOrderLine,
  supplier,
} from "@/db/schema";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { CONDITIONS } from "@/domain/condition";
import { DomainValueError } from "@/domain/errors";
import {
  checkReceiptLines,
  linesAfterTrip,
  openLines,
  orderCommandAfterReceipt,
  RECEIPT_DOCUMENT_TYPE,
  RECEIPT_MESSAGES,
  RECEIPT_PREFIX,
  storedAwaitsRest,
  type ReceiptLineInput,
  type ReceivingLine,
} from "@/domain/goods-receipt";
import type { AllocationMethod } from "@/domain/landed-cost";
import { toMoney, type Money } from "@/domain/money";
import type { MovementDraft } from "@/domain/movement";
import {
  checkOrderCosts,
  PURCHASE_MESSAGES,
  PurchaseFieldError,
  transition,
  type PurchaseKind,
  type PurchaseOutcome,
  type PurchaseStatus,
} from "@/domain/purchase-order";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  quantityToDb,
  toQuantity,
} from "@/domain/quantity";
import {
  receiptAnomalies,
  receiptPostedNote,
  unconfirmedAnomalies,
} from "@/domain/receipt-anomalies";
import { costTrip, needsScrapPrice } from "@/domain/receipt-cost";
import {
  conflict,
  isUniqueViolation,
  notFound,
  ok,
  ServiceFailure,
  type Actor,
  type ServiceResult,
} from "@/lib/catalog/common";
import { nextDocumentCode } from "@/lib/inventory/counter";
import { postMovements, type Tx } from "@/lib/inventory/post";
import { receiptSummary } from "@/lib/purchasing/receipts";

import {
  readArrivedAt,
  readCosts,
  readDraftId,
  readLines,
  readVehicle,
  UUID,
  type ReceiptBody,
} from "./body";
import { currentScrapPrice } from "./scrap-price";

export interface PostedReceipt {
  code: string;
  tripNo: number;
  orderCode: string;
  orderStatus: PurchaseStatus;
  orderOutcome: PurchaseOutcome | null;
  /** True when the draft had been posted already (resend). */
  replayed: boolean;
}

export interface PostOptions {
  /** Clock for the business date and the yearly code; tests fix it. */
  now?: Date;
}

/** Field errors answer 422, other rule breaks 409 (as purchasing does). */
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

async function lockOrder(tx: Tx, code: string) {
  const [row] = await tx
    .select({
      id: purchaseOrder.id,
      code: purchaseOrder.code,
      status: purchaseOrder.status,
      outcome: purchaseOrder.outcome,
      kind: purchaseOrder.kind,
      allocationMethod: purchaseOrder.allocationMethod,
      expectedDate: purchaseOrder.expectedDate,
      supplierName: supplier.name,
    })
    .from(purchaseOrder)
    .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .where(eq(purchaseOrder.code, code))
    .for("update", { of: purchaseOrder });
  if (!row) throw new ServiceFailure(notFound());
  return {
    ...row,
    status: row.status as PurchaseStatus,
    outcome: row.outcome as PurchaseOutcome | null,
    kind: row.kind as PurchaseKind,
    allocationMethod: row.allocationMethod as AllocationMethod,
  };
}

async function replayOf(
  tx: Pick<Database, "select">,
  actor: Actor,
  draftId: string,
): Promise<PostedReceipt | null> {
  const [row] = await tx
    .select({
      code: goodsReceipt.code,
      tripNo: goodsReceipt.tripNo,
      createdBy: goodsReceipt.createdBy,
      orderCode: purchaseOrder.code,
      orderStatus: purchaseOrder.status,
      orderOutcome: purchaseOrder.outcome,
    })
    .from(goodsReceipt)
    .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.orderId))
    .where(eq(goodsReceipt.clientDraftId, draftId));
  if (!row) return null;
  if (row.createdBy !== actor.id) {
    throw new ServiceFailure(conflict(RECEIPT_MESSAGES.draftOfOther));
  }
  return {
    code: row.code,
    tripNo: row.tripNo,
    orderCode: row.orderCode,
    orderStatus: row.orderStatus as PurchaseStatus,
    orderOutcome: row.orderOutcome as PurchaseOutcome | null,
    replayed: true,
  };
}

/** The yard the trip goes into: the one asked for, or the only one. */
async function lockYard(tx: Tx, locationId: string | null | undefined) {
  const rows = await tx
    .select({ id: location.id, type: location.type, status: location.status })
    .from(location)
    .where(
      locationId && UUID.test(locationId)
        ? eq(location.id, locationId)
        : eq(location.type, "YARD"),
    )
    .orderBy(asc(location.code))
    .for("share");
  const yards = rows.filter(
    (row) => row.type === "YARD" && row.status === "ACTIVE",
  );
  if (locationId) {
    const [yard] = yards;
    if (!yard)
      throw new PurchaseFieldError(RECEIPT_MESSAGES.yardMissing, "locationId");
    return yard.id;
  }
  if (yards.length === 0) throw new DomainValueError(RECEIPT_MESSAGES.noYard);
  if (yards.length > 1) {
    throw new PurchaseFieldError(RECEIPT_MESSAGES.yardMissing, "locationId");
  }
  return (yards[0] as { id: string }).id;
}

/** Item, name and price of each order line. */
async function orderLineFacts(tx: Tx, orderId: string) {
  const rows = await tx
    .select({
      id: purchaseOrderLine.id,
      itemId: purchaseOrderLine.itemId,
      unitPrice: purchaseOrderLine.unitPrice,
    })
    .from(purchaseOrderLine)
    .where(eq(purchaseOrderLine.orderId, orderId));
  return new Map(rows.map((row) => [row.id, row]));
}

async function expectedCostsOf(tx: Tx, orderId: string): Promise<Money> {
  const rows = await tx
    .select({ amount: purchaseOrderCost.amount })
    .from(purchaseOrderCost)
    .where(eq(purchaseOrderCost.orderId, orderId));
  return toMoney(rows.reduce((sum, row) => sum + row.amount, 0));
}

/** "40 mâm giàn giáo 1,6m": what the order still waits for (D3b, M1). */
export function waitingText(
  lines: readonly ReceivingLine[],
  names: ReadonlyMap<string, string>,
): string {
  return lines
    .filter(
      (line) =>
        line.receivedMilli < line.orderedMilli && line.lastAwaitsRest === true,
    )
    .map((line) => {
      const gap = toQuantity(
        line.orderedMilli - line.receivedMilli,
        line.lineUnit,
      );
      const name = names.get(line.orderLineId) ?? line.itemCode;
      const lower = name.charAt(0).toLowerCase() + name.slice(1);
      const unit = line.lineUnit === "KG" ? ` ${QUANTITY_UNIT_LABELS.KG}` : "";
      return `${formatQuantity(gap)}${unit} ${lower}`;
    })
    .join(", ");
}

async function itemNames(tx: Tx, orderId: string) {
  const rows = await tx
    .select({ id: purchaseOrderLine.id, name: item.name })
    .from(purchaseOrderLine)
    .innerJoin(item, eq(item.id, purchaseOrderLine.itemId))
    .where(eq(purchaseOrderLine.orderId, orderId));
  return new Map(rows.map((row) => [row.id, row.name]));
}

function movementsOf(
  locationId: string,
  description: string,
  inputs: readonly ReceiptLineInput[],
  facts: Awaited<ReturnType<typeof orderLineFacts>>,
  costed: ReturnType<typeof costTrip>,
): MovementDraft[] {
  const drafts: MovementDraft[] = [];
  for (const line of costed.lines) {
    const input = inputs.find((one) => one.orderLineId === line.orderLineId);
    const fact = facts.get(line.orderLineId);
    if (!input || !fact) continue;
    for (const condition of CONDITIONS) {
      const quantity = input.split[condition];
      if (quantity <= 0) continue;
      drafts.push({
        itemId: fact.itemId,
        condition,
        locationId,
        movement: "PURCHASE_IN",
        quantityMilli: quantity,
        amount: line.byCondition[condition] ?? 0,
        description,
      });
    }
  }
  return drafts;
}

const db3 = (milli: number) => quantityToDb(toQuantity(milli, "KG"));

async function postInTransaction(
  tx: Tx,
  actor: Actor,
  body: ReceiptBody,
  draftId: string,
  now: Date,
): Promise<PostedReceipt> {
  const order = await lockOrder(tx, body.orderCode ?? "");
  const replay = await replayOf(tx, actor, draftId);
  if (replay) return replay;
  if (order.status === "DRAFT") {
    throw new DomainValueError(PURCHASE_MESSAGES.notPlaced(order.code));
  }
  if (order.status === "DONE") {
    throw new DomainValueError(RECEIPT_MESSAGES.orderDone(order.code));
  }

  const summary = await receiptSummary(tx, order.id);
  const open = openLines(summary.lines);
  const inputs = readLines(body);
  checkReceiptLines(order.code, order.kind, open, inputs);
  const costs = checkOrderCosts(readCosts(body));
  const tripCosts = toMoney(costs.reduce((sum, cost) => sum + cost.amount, 0));
  const byId = new Map(open.map((line) => [line.orderLineId, line]));
  const paired = inputs.map((line) => ({
    open: byId.get(line.orderLineId) as ReceivingLine,
    line,
  }));

  const anomalies = receiptAnomalies({
    lines: paired,
    tripCosts,
    expectedCosts: await expectedCostsOf(tx, order.id),
  });
  const [missing] = unconfirmedAnomalies(
    anomalies,
    body.confirmedOverrides ?? [],
  );
  if (missing) throw new PurchaseFieldError(missing.question, missing.field);

  const locationId = await lockYard(tx, body.locationId);
  const facts = await orderLineFacts(tx, order.id);
  const price = needsScrapPrice(order.kind, paired)
    ? await currentScrapPrice(tx)
    : null;
  const costed = costTrip({
    kind: order.kind,
    method: order.allocationMethod,
    lines: paired.map((pair) => ({
      ...pair,
      unitPrice: toMoney(facts.get(pair.line.orderLineId)?.unitPrice ?? 0),
    })),
    costs: tripCosts,
    scrapPricePerKg: price?.pricePerKg ?? null,
  });

  const businessDate: BusinessDate = toBusinessDate(now);
  const code = await nextDocumentCode(
    tx,
    RECEIPT_PREFIX,
    Number(businessDate.slice(0, 4)),
  );
  const tripNo = summary.trips + 1;
  const receiptId = randomUUID();
  const posting = await postMovements(
    tx,
    actor,
    {
      documentType: RECEIPT_DOCUMENT_TYPE,
      documentId: receiptId,
      documentCode: code,
      businessDate,
      lines: movementsOf(
        locationId,
        `Nhập từ ${order.code} · ${order.supplierName} · chuyến ${tripNo}`,
        inputs,
        facts,
        costed,
      ),
    },
    businessDate,
  );

  await tx.insert(goodsReceipt).values({
    id: receiptId,
    code,
    orderId: order.id,
    tripNo,
    locationId,
    clientDraftId: draftId,
    businessDate,
    arrivedAt: readArrivedAt(body, now),
    vehicle: readVehicle(body),
    scrapPriceId: price?.id ?? null,
    scrapPricePerKg: price?.pricePerKg ?? null,
    postingId: posting.postingId,
    createdBy: actor.id,
    createdAt: now,
  });
  await tx.insert(goodsReceiptLine).values(
    paired.map(({ open: info, line }, index) => ({
      receiptId,
      lineNo: index + 1,
      orderLineId: line.orderLineId,
      itemId: facts.get(line.orderLineId)?.itemId ?? "",
      status: line.status,
      quantity: db3(line.quantityMilli),
      weighedKg: line.weighedKgMilli === null ? null : db3(line.weighedKgMilli),
      qtyNew: db3(line.split.NEW),
      qtyGood: db3(line.split.GOOD),
      qtyNeedsRepair: db3(line.split.NEEDS_REPAIR),
      qtyScrap: db3(line.split.SCRAP),
      awaitsRest: storedAwaitsRest(info, line),
    })),
  );
  if (costs.length) {
    await tx
      .insert(goodsReceiptCost)
      .values(
        costs.map((cost, index) => ({ ...cost, receiptId, lineNo: index + 1 })),
      );
  }

  const after = linesAfterTrip(summary.lines, inputs);
  const command = orderCommandAfterReceipt(after);
  const next = transition(
    {
      code: order.code,
      status: order.status,
      outcome: order.outcome,
      hasReceipts: true,
      lineCount: summary.lines.length,
      expectedDate: order.expectedDate,
    },
    command,
  );
  const closedShort = command === "RECEIVE_SHORT";
  await tx
    .update(purchaseOrder)
    .set({
      status: next.status,
      outcome: next.outcome,
      updatedAt: now,
      ...(next.status === "DONE"
        ? {
            endedBy: actor.id,
            endedAt: now,
            endReason: closedShort ? RECEIPT_MESSAGES.closedShort : null,
          }
        : {}),
    })
    .where(eq(purchaseOrder.id, order.id));

  const confirmed = anomalies.filter((anomaly) =>
    (body.confirmedOverrides ?? []).includes(anomaly.key),
  );
  const events: (typeof purchaseOrderEvent.$inferInsert)[] = [
    {
      orderId: order.id,
      kind: "RECEIPT_POSTED",
      actorId: actor.id,
      note: receiptPostedNote(code, confirmed),
      createdAt: now,
    },
  ];
  if (command === "RECEIVE_SHORT_WAIT") {
    events.push({
      orderId: order.id,
      kind: "BACKORDER_MARKED",
      actorId: actor.id,
      note: waitingText(after, await itemNames(tx, order.id)),
      createdAt: now,
    });
  } else {
    events.push({
      orderId: order.id,
      kind: closedShort ? "CLOSED" : "RECEIVED",
      actorId: actor.id,
      note: closedShort ? RECEIPT_MESSAGES.closedShort : null,
      createdAt: now,
    });
  }
  await tx.insert(purchaseOrderEvent).values(events);

  return {
    code,
    tripNo,
    orderCode: order.code,
    orderStatus: next.status,
    orderOutcome: next.outcome,
    replayed: false,
  };
}

/** "Xác nhận nhập kho" (spec goods-receipts). */
export function postReceipt(
  db: Database,
  actor: Actor,
  body: ReceiptBody,
  options: PostOptions = {},
): Promise<ServiceResult<PostedReceipt>> {
  return run(async () => {
    const draftId = readDraftId(body);
    const now = options.now ?? new Date();
    try {
      const posted = await db.transaction((tx) =>
        postInTransaction(tx, actor, body, draftId, now),
      );
      return ok(posted);
    } catch (error: unknown) {
      // Two sends of one draft raced past the order lock: the loser reads
      // what the winner wrote (design D1).
      if (!isUniqueViolation(error)) throw error;
      const replay = await replayOf(db, actor, draftId);
      if (!replay) throw error;
      return ok(replay);
    }
  });
}

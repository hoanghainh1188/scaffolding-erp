// Value adjustments against the ledger (stock-value-adjustment design D4,
// D5): the source document must hold every (item + condition), the preview
// of the new average, and the lines a corrected trip cost gives.
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  goodsReceipt,
  goodsReceiptCost,
  goodsReceiptLine,
  inventoryCost,
  inventoryLedger,
  item,
  purchaseOrder,
  purchaseOrderLine,
  stockAdjustment,
  stockAdjustmentLine,
} from "@/db/schema";
import type { CostPool } from "@/domain/average-cost";
import type { Condition } from "@/domain/condition";
import { DomainValueError } from "@/domain/errors";
import { RECEIPT_DOCUMENT_TYPE } from "@/domain/goods-receipt";
import type { AllocationMethod } from "@/domain/landed-cost";
import { toMoney, type Money } from "@/domain/money";
import type { PurchaseKind } from "@/domain/purchase-order";
import { quantityFromDb, type QuantityUnit } from "@/domain/quantity";
import type { TripLine } from "@/domain/receipt-cost";
import {
  averageAfterRevalue,
  poolValue,
  REVALUE_MESSAGES,
  revaluationFromTrip,
  type ValueLine,
} from "@/domain/stock-revaluation";
import { conflict, notFound, ServiceFailure } from "@/lib/catalog/common";

type Executor = Pick<Database, "select">;

const key = (itemId: string, condition: string) => `${itemId}|${condition}`;

/** Stock (every location) and average of each pair, without locking. */
export async function poolsOf(
  tx: Executor,
  pairs: readonly { itemId: string; condition: Condition }[],
): Promise<Map<string, CostPool>> {
  const ids = [...new Set(pairs.map((pair) => pair.itemId))];
  const rows = ids.length
    ? await tx
        .select({
          itemId: inventoryCost.itemId,
          condition: inventoryCost.condition,
          avgCost: inventoryCost.avgCost,
          poolQuantity: inventoryCost.poolQuantity,
        })
        .from(inventoryCost)
        .where(inArray(inventoryCost.itemId, ids))
    : [];
  const pools = new Map<string, CostPool>();
  for (const row of rows) {
    pools.set(key(row.itemId, row.condition), {
      poolMilli: quantityFromDb(row.poolQuantity, "KG").milli,
      avgCost: row.avgCost === null ? null : toMoney(row.avgCost),
    });
  }
  return pools;
}

export interface ValuePreview {
  poolMilli: number;
  avgCost: number | null;
  value: number;
  /** Null when the line would be refused; `error` says why. */
  newAvg: number | null;
  error: string | null;
}

/** Stock · average · value → new average, at the numbers of now. */
export function previewOf(
  pool: CostPool | undefined,
  line: { code: string; condition: Condition; valueDelta: number },
): ValuePreview {
  const state = pool ?? { poolMilli: 0, avgCost: null };
  const base = {
    poolMilli: state.poolMilli,
    avgCost: state.avgCost,
    value: poolValue(state),
  };
  try {
    return {
      ...base,
      newAvg: averageAfterRevalue(state, toMoney(line.valueDelta), line),
      error: null,
    };
  } catch (error: unknown) {
    if (!(error instanceof DomainValueError)) throw error;
    return { ...base, newAvg: null, error: error.message };
  }
}

/** One preview line for the form (GET revalue-preview). */
export async function revaluePreview(
  db: Database,
  input: { itemId: string; condition: Condition; valueDelta: number },
): Promise<ValuePreview | null> {
  const [found] = await db
    .select({ code: item.code })
    .from(item)
    .where(eq(item.id, input.itemId));
  if (!found) return null;
  const pools = await poolsOf(db, [input]);
  return previewOf(pools.get(key(input.itemId, input.condition)), {
    ...input,
    code: found.code,
  });
}

/**
 * The source document must be in the ledger (not as a value adjustment)
 * and hold a line of every (item + condition) on the document; each line
 * must also pass on the pools of now (not sold out, not below zero).
 */
export async function assertValueLinesAgainstLedger(
  tx: Executor,
  related: string,
  lines: readonly ValueLine[],
  codeOf: (itemId: string) => string,
): Promise<void> {
  const held = await tx
    .select({
      itemId: inventoryLedger.itemId,
      condition: inventoryLedger.condition,
    })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.documentCode, related),
        ne(inventoryLedger.movement, "REVALUE"),
      ),
    )
    .groupBy(inventoryLedger.itemId, inventoryLedger.condition);
  if (held.length === 0) {
    throw new DomainValueError(REVALUE_MESSAGES.relatedNotFound(related));
  }
  const pairs = new Set(held.map((row) => key(row.itemId, row.condition)));
  const pools = await poolsOf(tx, lines);
  for (const line of lines) {
    const code = codeOf(line.itemId);
    if (!pairs.has(key(line.itemId, line.condition))) {
      throw new DomainValueError(
        REVALUE_MESSAGES.pairNotInRelated(related, code, line.condition),
      );
    }
    averageAfterRevalue(
      pools.get(key(line.itemId, line.condition)) ?? {
        poolMilli: 0,
        avgCost: null,
      },
      line.valueDelta,
      { code, condition: line.condition },
    );
  }
}

// ------------------------------------------------------ trip-cost fixes

export interface TripFacts {
  receiptId: string;
  receiptCode: string;
  /** The trip cost the ledger holds now: latest posted fix, or the receipt. */
  recordedCost: Money;
  lines: ValueLine[];
}

/** What the ledger holds for a receipt and how it was costed (design D4). */
async function loadTrip(tx: Executor, receiptId: string) {
  const [receipt] = await tx
    .select({
      id: goodsReceipt.id,
      code: goodsReceipt.code,
      postingId: goodsReceipt.postingId,
      scrapPricePerKg: goodsReceipt.scrapPricePerKg,
      kind: purchaseOrder.kind,
      method: purchaseOrder.allocationMethod,
    })
    .from(goodsReceipt)
    .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.orderId))
    .where(eq(goodsReceipt.id, receiptId));
  if (!receipt) throw new ServiceFailure(notFound());

  const [lines, [costs], fixes, purchased] = await Promise.all([
    tx
      .select({
        orderLineId: goodsReceiptLine.orderLineId,
        itemId: goodsReceiptLine.itemId,
        status: goodsReceiptLine.status,
        quantity: goodsReceiptLine.quantity,
        weighedKg: goodsReceiptLine.weighedKg,
        qtyNew: goodsReceiptLine.qtyNew,
        qtyGood: goodsReceiptLine.qtyGood,
        qtyNeedsRepair: goodsReceiptLine.qtyNeedsRepair,
        qtyScrap: goodsReceiptLine.qtyScrap,
        unitPrice: purchaseOrderLine.unitPrice,
        lineUnit: purchaseOrderLine.unit,
        itemCode: item.code,
        itemUnit: item.unit,
        standardWeightKg: item.standardWeightKg,
      })
      .from(goodsReceiptLine)
      .innerJoin(
        purchaseOrderLine,
        eq(purchaseOrderLine.id, goodsReceiptLine.orderLineId),
      )
      .innerJoin(item, eq(item.id, goodsReceiptLine.itemId))
      .where(eq(goodsReceiptLine.receiptId, receiptId))
      .orderBy(goodsReceiptLine.lineNo),
    tx
      .select({
        total: sql<string>`coalesce(sum(${goodsReceiptCost.amount}), 0)::text`,
      })
      .from(goodsReceiptCost)
      .where(eq(goodsReceiptCost.receiptId, receiptId)),
    tx
      .select({
        id: stockAdjustment.id,
        corrected: stockAdjustment.correctedTripCost,
      })
      .from(stockAdjustment)
      .where(
        and(
          eq(stockAdjustment.sourceReceiptId, receiptId),
          eq(stockAdjustment.status, "DONE"),
        ),
      )
      .orderBy(desc(stockAdjustment.approvedAt)),
    tx
      .select({
        itemId: inventoryLedger.itemId,
        condition: inventoryLedger.condition,
        amount: sql<string>`sum(${inventoryLedger.amount})::text`,
      })
      .from(inventoryLedger)
      .where(
        and(
          eq(inventoryLedger.postingId, receipt.postingId),
          eq(inventoryLedger.documentType, RECEIPT_DOCUMENT_TYPE),
        ),
      )
      .groupBy(inventoryLedger.itemId, inventoryLedger.condition),
  ]);

  const booked = new Map<string, number>();
  for (const row of purchased) {
    booked.set(key(row.itemId, row.condition), Number(row.amount));
  }
  if (fixes.length > 0) {
    const fixed = await tx
      .select({
        itemId: stockAdjustmentLine.itemId,
        condition: stockAdjustmentLine.condition,
        delta: sql<string>`sum(${stockAdjustmentLine.valueDelta})::text`,
      })
      .from(stockAdjustmentLine)
      .where(
        inArray(
          stockAdjustmentLine.adjustmentId,
          fixes.map((fix) => fix.id),
        ),
      )
      .groupBy(stockAdjustmentLine.itemId, stockAdjustmentLine.condition);
    for (const row of fixed) {
      const at = key(row.itemId, row.condition);
      booked.set(at, (booked.get(at) ?? 0) + Number(row.delta));
    }
  }

  const milli = (value: string | null) =>
    value === null ? 0 : quantityFromDb(value, "KG").milli;
  const tripLines: TripLine[] = lines.map((line) => ({
    open: {
      orderLineId: line.orderLineId,
      itemCode: line.itemCode,
      itemUnit: line.itemUnit as QuantityUnit,
      lineUnit: line.lineUnit as QuantityUnit,
      standardWeightKg: line.standardWeightKg,
      orderedMilli: 0,
      receivedMilli: 0,
      lastAwaitsRest: null,
    },
    unitPrice: toMoney(line.unitPrice),
    line: {
      orderLineId: line.orderLineId,
      status: line.status as "COUNTED" | "NOT_IN_TRIP",
      quantityMilli: milli(line.quantity),
      weighedKgMilli: line.weighedKg === null ? null : milli(line.weighedKg),
      split: {
        NEW: milli(line.qtyNew),
        GOOD: milli(line.qtyGood),
        NEEDS_REPAIR: milli(line.qtyNeedsRepair),
        SCRAP: milli(line.qtyScrap),
      },
      awaitsRest: false,
    },
  }));
  const latest = fixes[0]?.corrected;
  return {
    receipt,
    trip: {
      kind: receipt.kind as PurchaseKind,
      method: receipt.method as AllocationMethod,
      lines: tripLines,
      scrapPricePerKg:
        receipt.scrapPricePerKg === null
          ? null
          : toMoney(receipt.scrapPricePerKg),
    },
    itemOf: new Map(lines.map((line) => [line.orderLineId, line.itemId])),
    recordedCost: toMoney(
      latest === null || latest === undefined
        ? Number(costs?.total ?? 0)
        : latest,
    ),
    booked,
  };
}

/**
 * The lines that take a receipt from its recorded trip cost to the
 * corrected one, split as the receipt was; refuses when the split cannot
 * be rebuilt (design D4).
 */
export async function buildTripRevaluation(
  tx: Executor,
  receiptId: string,
  correctedCost: number,
): Promise<TripFacts> {
  const facts = await loadTrip(tx, receiptId);
  const lines = revaluationFromTrip({
    receiptCode: facts.receipt.code,
    trip: facts.trip,
    itemOf: facts.itemOf,
    recordedCost: facts.recordedCost,
    correctedCost,
    booked: facts.booked,
  });
  return {
    receiptId,
    receiptCode: facts.receipt.code,
    recordedCost: facts.recordedCost,
    lines,
  };
}

/** Same lines in the same order, value for value. */
export function sameValueLines(
  a: readonly ValueLine[],
  b: readonly ValueLine[],
): boolean {
  const order = (lines: readonly ValueLine[]) =>
    [...lines]
      .map((l) => `${key(l.itemId, l.condition)}=${l.valueDelta}`)
      .sort();
  return order(a).join(",") === order(b).join(",");
}

/** A receipt with no other trip-cost fix waiting (design D4). */
export async function assertNoOpenTripFix(
  tx: Executor,
  receiptId: string,
  receiptCode: string,
  except: string | null = null,
): Promise<void> {
  const [open] = await tx
    .select({ id: stockAdjustment.id, code: stockAdjustment.code })
    .from(stockAdjustment)
    .where(
      and(
        eq(stockAdjustment.sourceReceiptId, receiptId),
        ne(stockAdjustment.status, "DONE"),
      ),
    );
  if (open && open.id !== except) {
    throw new ServiceFailure(
      conflict(REVALUE_MESSAGES.tripOpen(receiptCode, open.code)),
    );
  }
}

export interface ReceiptOption {
  id: string;
  code: string;
  orderCode: string;
  businessDate: string;
  recordedCost: number;
}

/** Receipts that can take a trip-cost fix, newest first (form picker). */
export async function receiptOptions(
  db: Database,
  limit = 100,
): Promise<ReceiptOption[]> {
  const latestFix = sql<string | null>`(
    select ${stockAdjustment.correctedTripCost}::text from ${stockAdjustment}
    where ${stockAdjustment.sourceReceiptId} = ${goodsReceipt.id}
      and ${stockAdjustment.status} = 'DONE'
    order by ${stockAdjustment.approvedAt} desc limit 1)`;
  const receiptCosts = sql<string>`(
    select coalesce(sum(${goodsReceiptCost.amount}), 0)::text
    from ${goodsReceiptCost}
    where ${goodsReceiptCost.receiptId} = ${goodsReceipt.id})`;
  const rows = await db
    .select({
      id: goodsReceipt.id,
      code: goodsReceipt.code,
      orderCode: purchaseOrder.code,
      businessDate: goodsReceipt.businessDate,
      latestFix,
      receiptCosts,
    })
    .from(goodsReceipt)
    .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.orderId))
    .orderBy(desc(goodsReceipt.businessDate), desc(goodsReceipt.code))
    .limit(limit);
  return rows.map(({ latestFix: fix, receiptCosts: costs, ...row }) => ({
    ...row,
    recordedCost: Number(fix ?? costs),
  }));
}

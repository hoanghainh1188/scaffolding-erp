// Reading adjustment, opening and value documents (stock-adjustments,
// stock-value-adjustments): the list and one document with its lines, the
// preview of value lines and the ledger lines it posted.
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  goodsReceipt,
  inventoryLedger,
  item,
  location,
  purchaseOrder,
  stockAdjustment,
  stockAdjustmentLine,
  user,
} from "@/db/schema";
import type { Condition } from "@/domain/condition";
import { quantityFromDb } from "@/domain/quantity";
import type {
  AdjustmentKind,
  AdjustmentLineType,
} from "@/domain/stock-adjustment";

import { poolsOf, previewOf, type ValuePreview } from "./revaluations";

export type AdjustmentStatus = "DRAFT" | "PENDING_APPROVAL" | "DONE";

export const ADJUSTMENT_STATUS_LABELS: Readonly<
  Record<AdjustmentStatus, string>
> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  DONE: "Đã ghi sổ",
};

export interface AdjustmentSummary {
  id: string;
  code: string;
  kind: AdjustmentKind;
  status: AdjustmentStatus;
  reason: string;
  relatedDocumentCode: string | null;
  openingDate: string | null;
  lineCount: number;
  createdByName: string;
  createdAt: Date;
}

export interface AdjustmentLineRow {
  lineNo: number;
  lineType: AdjustmentLineType;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: "PIECE" | "KG";
  condition: Condition;
  toCondition: Condition | null;
  /** Null on VALUE lines. */
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  toLocationId: string | null;
  toLocationCode: string | null;
  toLocationName: string | null;
  /** Thousandths of the item's unit. */
  quantity: number;
  unitCost: number | null;
  valueDelta: number | null;
  /** VALUE lines not yet posted: the new average at the numbers of now. */
  preview: ValuePreview | null;
}

export interface PostedRow {
  id: number;
  movement: string;
  itemCode: string;
  condition: Condition;
  /** Null on REVALUE lines. */
  locationCode: string | null;
  quantity: number;
  unitCost: number;
  amount: number;
  avgBefore: number | null;
  avgAfter: number;
}

export interface AdjustmentDetail extends AdjustmentSummary {
  returnedReason: string | null;
  createdBy: string;
  approvedByName: string | null;
  approvedAt: Date | null;
  submittedAt: Date | null;
  updatedAt: Date;
  /** Trip-cost fixes only. */
  sourceReceiptId: string | null;
  sourceReceiptCode: string | null;
  /** Order of the receipt, for the link on the page. */
  sourceOrderCode: string | null;
  recordedTripCost: number | null;
  correctedTripCost: number | null;
  lines: AdjustmentLineRow[];
  posted: PostedRow[];
}

// --------------------------------------------------------------- reading

const creator = alias(user, "creator");
const approver = alias(user, "approver");

/** Pending first (the director's queue), then newest first. */
export async function listAdjustments(
  db: Database,
  filter: { status?: AdjustmentStatus } = {},
): Promise<AdjustmentSummary[]> {
  const where: SQL[] = [];
  if (filter.status) where.push(eq(stockAdjustment.status, filter.status));
  const rows = await db
    .select({
      id: stockAdjustment.id,
      code: stockAdjustment.code,
      kind: stockAdjustment.kind,
      status: stockAdjustment.status,
      reason: stockAdjustment.reason,
      relatedDocumentCode: stockAdjustment.relatedDocumentCode,
      openingDate: stockAdjustment.openingDate,
      createdAt: stockAdjustment.createdAt,
      createdByName: creator.name,
      lineCount: sql<number>`(select count(*)::int from ${stockAdjustmentLine} where ${stockAdjustmentLine.adjustmentId} = ${stockAdjustment.id})`,
    })
    .from(stockAdjustment)
    .innerJoin(creator, eq(creator.id, stockAdjustment.createdBy))
    .where(where.length ? and(...where) : undefined)
    .orderBy(
      sql`case when ${stockAdjustment.status} = 'PENDING_APPROVAL' then 0 else 1 end`,
      desc(stockAdjustment.createdAt),
    );
  return rows.map((row) => ({
    ...row,
    kind: row.kind as AdjustmentKind,
    status: row.status as AdjustmentStatus,
  }));
}

const toLocation = alias(location, "to_location");

export async function getAdjustment(
  db: Database,
  id: string,
): Promise<AdjustmentDetail | null> {
  const [head] = await db
    .select({
      id: stockAdjustment.id,
      code: stockAdjustment.code,
      kind: stockAdjustment.kind,
      status: stockAdjustment.status,
      reason: stockAdjustment.reason,
      relatedDocumentCode: stockAdjustment.relatedDocumentCode,
      openingDate: stockAdjustment.openingDate,
      returnedReason: stockAdjustment.returnedReason,
      postingId: stockAdjustment.postingId,
      createdAt: stockAdjustment.createdAt,
      createdBy: stockAdjustment.createdBy,
      createdByName: creator.name,
      approvedByName: approver.name,
      approvedAt: stockAdjustment.approvedAt,
      submittedAt: stockAdjustment.submittedAt,
      updatedAt: stockAdjustment.updatedAt,
      sourceReceiptId: stockAdjustment.sourceReceiptId,
      sourceReceiptCode: goodsReceipt.code,
      sourceOrderCode: purchaseOrder.code,
      recordedTripCost: stockAdjustment.recordedTripCost,
      correctedTripCost: stockAdjustment.correctedTripCost,
    })
    .from(stockAdjustment)
    .innerJoin(creator, eq(creator.id, stockAdjustment.createdBy))
    .leftJoin(approver, eq(approver.id, stockAdjustment.approvedBy))
    .leftJoin(
      goodsReceipt,
      eq(goodsReceipt.id, stockAdjustment.sourceReceiptId),
    )
    .leftJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.orderId))
    .where(eq(stockAdjustment.id, id));
  if (!head) return null;

  const lines = await db
    .select({
      lineNo: stockAdjustmentLine.lineNo,
      lineType: stockAdjustmentLine.lineType,
      itemId: stockAdjustmentLine.itemId,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      condition: stockAdjustmentLine.condition,
      toCondition: stockAdjustmentLine.toCondition,
      locationId: stockAdjustmentLine.locationId,
      locationCode: location.code,
      locationName: location.name,
      toLocationId: stockAdjustmentLine.toLocationId,
      toLocationCode: toLocation.code,
      toLocationName: toLocation.name,
      quantity: stockAdjustmentLine.quantity,
      unitCost: stockAdjustmentLine.unitCost,
      valueDelta: stockAdjustmentLine.valueDelta,
    })
    .from(stockAdjustmentLine)
    .innerJoin(item, eq(item.id, stockAdjustmentLine.itemId))
    .leftJoin(location, eq(location.id, stockAdjustmentLine.locationId))
    .leftJoin(toLocation, eq(toLocation.id, stockAdjustmentLine.toLocationId))
    .where(eq(stockAdjustmentLine.adjustmentId, id))
    .orderBy(asc(stockAdjustmentLine.lineNo));

  const posted = head.postingId
    ? await db
        .select({
          id: inventoryLedger.id,
          movement: inventoryLedger.movement,
          itemCode: item.code,
          condition: inventoryLedger.condition,
          locationCode: location.code,
          quantity: inventoryLedger.quantity,
          unitCost: inventoryLedger.unitCost,
          amount: inventoryLedger.amount,
          avgBefore: sql<string | null>`(
            select prev.avg_cost_after::text from ${inventoryLedger} prev
            where prev.item_id = ${inventoryLedger.itemId}
              and prev.condition = ${inventoryLedger.condition}
              and prev.id < ${inventoryLedger.id}
            order by prev.id desc limit 1)`,
          avgAfter: inventoryLedger.avgCostAfter,
        })
        .from(inventoryLedger)
        .innerJoin(item, eq(item.id, inventoryLedger.itemId))
        .leftJoin(location, eq(location.id, inventoryLedger.locationId))
        .where(eq(inventoryLedger.postingId, head.postingId))
        .orderBy(asc(inventoryLedger.id))
    : [];

  const previews =
    head.kind === "REVALUE" && !head.postingId
      ? await poolsOf(
          db,
          lines.map((line) => ({
            itemId: line.itemId,
            condition: line.condition as Condition,
          })),
        )
      : null;

  return {
    id: head.id,
    code: head.code,
    updatedAt: head.updatedAt,
    sourceReceiptId: head.sourceReceiptId,
    sourceReceiptCode: head.sourceReceiptCode,
    sourceOrderCode: head.sourceOrderCode,
    recordedTripCost: head.recordedTripCost,
    correctedTripCost: head.correctedTripCost,
    reason: head.reason,
    relatedDocumentCode: head.relatedDocumentCode,
    openingDate: head.openingDate,
    returnedReason: head.returnedReason,
    createdAt: head.createdAt,
    createdBy: head.createdBy,
    createdByName: head.createdByName,
    approvedByName: head.approvedByName,
    approvedAt: head.approvedAt,
    submittedAt: head.submittedAt,
    kind: head.kind as AdjustmentKind,
    status: head.status as AdjustmentStatus,
    lineCount: lines.length,
    lines: lines.map((line) => ({
      ...line,
      lineType: line.lineType as AdjustmentLineType,
      unit: line.unit as "PIECE" | "KG",
      condition: line.condition as Condition,
      toCondition: line.toCondition as Condition | null,
      quantity: quantityFromDb(line.quantity, "KG").milli,
      preview:
        previews && line.valueDelta !== null
          ? previewOf(previews.get(`${line.itemId}|${line.condition}`), {
              code: line.itemCode,
              condition: line.condition as Condition,
              valueDelta: line.valueDelta,
            })
          : null,
    })),
    posted: posted.map((row) => ({
      ...row,
      condition: row.condition as Condition,
      quantity: quantityFromDb(row.quantity, "KG").milli,
      avgBefore: row.avgBefore === null ? null : Number(row.avgBefore),
    })),
  };
}

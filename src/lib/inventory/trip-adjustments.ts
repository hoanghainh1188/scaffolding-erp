// Trip-cost fixes of a goods receipt (stock-value-adjustment design D4):
// a REVALUE document whose lines the system builds from the corrected trip
// cost. Only the corrected cost and the reason can be edited; submit,
// approve, return and delete are the common adjustment commands.
import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { goodsReceipt, stockAdjustment } from "@/db/schema";
import { changeSummary } from "@/domain/activity-summary";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import {
  ADJUSTMENT_PREFIX,
  normalizeReason,
  type AdjustmentLineInput,
} from "@/domain/stock-adjustment";
import { REVALUE_MESSAGES, type ValueLine } from "@/domain/stock-revaluation";
import { logActivity } from "@/lib/activity/log";
import {
  conflict,
  isUniqueViolation,
  notFound,
  ok,
  runService,
  ServiceFailure,
  type Actor,
  type ServiceResult,
} from "@/lib/catalog/common";

import {
  adjustmentChanges,
  adjustmentSummary,
  adjustmentView,
} from "./activity";
import {
  assertFresh,
  docType,
  getAdjustment,
  lockAdjustment,
  requireDraft,
  unitsOf,
  writeLines,
  type AdjustmentDetail,
} from "./adjustments";
import { nextDocumentCode } from "./counter";
import type { Tx } from "./post";
import { assertNoOpenTripFix, buildTripRevaluation } from "./revaluations";

export interface TripAdjustmentBody {
  receiptId?: string;
  correctedTripCost?: number;
  reason?: string;
  updatedAt?: string | null;
}

const UUID = /^[0-9a-f-]{36}$/i;

const asLines = (lines: readonly ValueLine[]): AdjustmentLineInput[] =>
  lines.map((line) => ({
    lineType: "VALUE",
    itemId: line.itemId,
    condition: line.condition,
    toCondition: null,
    locationId: null,
    toLocationId: null,
    quantityMilli: 0,
    unitCost: null,
    valueDelta: line.valueDelta,
  }));

/** Locks the receipt FOR SHARE (a referenced row); its code. */
async function lockReceipt(tx: Tx, receiptId: string): Promise<string> {
  if (!UUID.test(receiptId)) throw new ServiceFailure(notFound());
  const [receipt] = await tx
    .select({ code: goodsReceipt.code })
    .from(goodsReceipt)
    .where(eq(goodsReceipt.id, receiptId))
    .for("share");
  if (!receipt) throw new ServiceFailure(notFound());
  return receipt.code;
}

/**
 * Two fixes of one receipt saved at the same moment: the partial unique
 * index refuses the second. The transaction is broken then, so answer
 * without another query.
 */
async function guardOpen<T>(
  receiptCode: string,
  body: () => Promise<T>,
): Promise<T> {
  try {
    return await body();
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new ServiceFailure(
        conflict(REVALUE_MESSAGES.tripOpen(receiptCode, "khác")),
      );
    }
    throw error;
  }
}

export function createTripAdjustment(
  db: Database,
  actor: Actor,
  body: TripAdjustmentBody,
  now: BusinessDate = toBusinessDate(new Date()),
): Promise<ServiceResult<AdjustmentDetail>> {
  return runService(async () => {
    const reason = normalizeReason(body.reason);
    const id = await db.transaction(async (tx) => {
      const receiptId = body.receiptId ?? "";
      await assertNoOpenTripFix(
        tx,
        receiptId,
        await lockReceipt(tx, receiptId),
      );
      const built = await buildTripRevaluation(
        tx,
        receiptId,
        body.correctedTripCost ?? Number.NaN,
      );
      const code = await nextDocumentCode(
        tx,
        ADJUSTMENT_PREFIX.REVALUE,
        Number(now.slice(0, 4)),
      );
      const [row] = await guardOpen(built.receiptCode, () =>
        tx
          .insert(stockAdjustment)
          .values({
            code,
            kind: "REVALUE",
            reason,
            relatedDocumentCode: built.receiptCode,
            sourceReceiptId: receiptId,
            recordedTripCost: built.recordedCost,
            correctedTripCost: body.correctedTripCost ?? 0,
            createdBy: actor.id,
          })
          .returning({ id: stockAdjustment.id }),
      );
      const adjustmentId = row?.id ?? "";
      const lines = asLines(built.lines);
      await writeLines(tx, adjustmentId, lines, await unitsOf(tx, lines));
      await logActivity(tx, actor, {
        action: "CREATE",
        document: { type: docType("REVALUE"), id: adjustmentId, code },
        summary: adjustmentSummary(await adjustmentView(tx, adjustmentId)),
      });
      return adjustmentId;
    });
    const created = await getAdjustment(db, id);
    return created ? ok(created) : notFound();
  });
}

/** New corrected cost or reason; the lines are built again. */
export function updateTripAdjustment(
  db: Database,
  actor: Actor,
  id: string,
  body: TripAdjustmentBody,
): Promise<ServiceResult<AdjustmentDetail>> {
  return runService(async () => {
    const reason = normalizeReason(body.reason);
    await db.transaction(async (tx) => {
      const current = await lockAdjustment(tx, id);
      requireDraft(current.status);
      assertFresh(current.updatedAt, body.updatedAt);
      if (!current.sourceReceiptId) throw new ServiceFailure(notFound());
      await lockReceipt(tx, current.sourceReceiptId);
      const built = await buildTripRevaluation(
        tx,
        current.sourceReceiptId,
        body.correctedTripCost ?? Number.NaN,
      );
      const before = await adjustmentView(tx, id);
      await tx
        .update(stockAdjustment)
        .set({
          reason,
          recordedTripCost: built.recordedCost,
          correctedTripCost: body.correctedTripCost ?? 0,
          updatedAt: new Date(),
        })
        .where(eq(stockAdjustment.id, id));
      const lines = asLines(built.lines);
      await writeLines(tx, id, lines, await unitsOf(tx, lines));
      const changes = adjustmentChanges(before, await adjustmentView(tx, id));
      await logActivity(tx, actor, {
        action: "UPDATE",
        document: { type: docType("REVALUE"), id, code: current.code },
        summary: changeSummary(changes),
        changes,
      });
    });
    const updated = await getAdjustment(db, id);
    return updated ? ok(updated) : notFound();
  });
}

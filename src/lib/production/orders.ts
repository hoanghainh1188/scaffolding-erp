// Production orders, office steps (spec production-orders, design D9, D10):
// draft, assign (takes a copy of the BOM), recall, return to the workshop,
// director's approval and cancel. Every write locks the order, checks the
// step and the updatedAt the user saw, then logs in the same transaction.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  item,
  location,
  productionBom,
  productionBomMaterial,
  productionOrder,
  productionOrderLine,
  productionOrderMaterial,
} from "@/db/schema";
import { changeSummary, countText, joinParts } from "@/domain/activity-summary";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { DomainValueError } from "@/domain/errors";
import { ProductionFieldError } from "@/domain/production-bom";
import {
  PRODUCTION_MESSAGES,
  PRODUCTION_NOTE_MAX,
  PRODUCTION_PREFIX,
  PRODUCTION_TEAM_MAX,
  checkPlanned,
  checkStepNote,
} from "@/domain/production-order";
import { quantityFromDb, quantityToDb, toQuantity } from "@/domain/quantity";
import { logActivity } from "@/lib/activity/log";
import {
  conflict,
  ok,
  optionalText,
  ServiceFailure,
  type Actor,
  type ServiceResult,
} from "@/lib/catalog/common";
import { nextDocumentCode } from "@/lib/inventory/counter";
import type { Tx } from "@/lib/inventory/post";

import {
  assignSummary,
  draftSummary,
  overuseSummary,
  productionChanges,
  productionView,
} from "./activity";
import {
  UUID,
  assertFresh,
  lockProductionOrder,
  runProduction,
  stepOf,
  type SteppedProductionOrder,
} from "./common";
import { readPostingLines } from "./records";

const today = () => toBusinessDate(new Date());

export interface ProductionOrderBody {
  workshopId?: string;
  toLocationId?: string;
  team?: string | null;
  note?: string | null;
  lines?: { itemId?: string; quantity?: string }[];
  updatedAt?: string;
}

export interface ProductionStepBody {
  updatedAt?: string;
  note?: string | null;
  reason?: string | null;
}

export interface SavedProductionOrder {
  code: string;
  updatedAt: Date;
}

interface CheckedOrder {
  workshopId: string;
  toLocationId: string;
  team: string | null;
  note: string | null;
  lines: { itemId: string; milli: number; unit: "PIECE" }[];
}

async function placeOf(tx: Tx, id: string | undefined) {
  if (!id || !UUID.test(id)) return null;
  const [row] = await tx
    .select({ id: location.id, type: location.type, status: location.status })
    .from(location)
    .where(eq(location.id, id))
    .for("share");
  return row && row.status === "ACTIVE" ? row : null;
}

function readPlanned(value: string | undefined, field: string): number {
  try {
    return quantityFromDb((value ?? "").trim(), "KG").milli;
  } catch {
    throw new ProductionFieldError(PRODUCTION_MESSAGES.planned, field);
  }
}

function checkText(body: ProductionOrderBody) {
  const team = optionalText(body.team);
  if (team && team.length > PRODUCTION_TEAM_MAX) {
    throw new ProductionFieldError(PRODUCTION_MESSAGES.teamTooLong, "team");
  }
  const note = optionalText(body.note);
  if (note && note.length > PRODUCTION_NOTE_MAX) {
    throw new ProductionFieldError(PRODUCTION_MESSAGES.noteTooLong, "note");
  }
  return { team, note };
}

/** Finished items FOR SHARE, each with a BOM (spec "Lập lệnh sản xuất"). */
async function checkLines(
  tx: Tx,
  raw: NonNullable<ProductionOrderBody["lines"]>,
): Promise<CheckedOrder["lines"]> {
  if (raw.length === 0) {
    throw new ProductionFieldError(PRODUCTION_MESSAGES.noLines, "lines");
  }
  const ids = [...new Set(raw.map((line) => line.itemId ?? ""))];
  if (!ids.every((id) => UUID.test(id))) {
    throw new DomainValueError("Không tìm thấy vật tư");
  }
  const rows = await tx
    .select({
      id: item.id,
      code: item.code,
      unit: item.unit,
      status: item.status,
    })
    .from(item)
    .where(inArray(item.id, ids))
    .orderBy(asc(item.id))
    .for("share");
  const byId = new Map(rows.map((row) => [row.id, row]));
  const boms = await tx
    .select({ itemId: productionBom.itemId })
    .from(productionBom)
    .where(inArray(productionBom.itemId, ids))
    .orderBy(asc(productionBom.id))
    .for("share");
  const withBom = new Set(boms.map((bom) => bom.itemId));
  const seen = new Set<string>();
  return raw.map((line, index) => {
    const found = byId.get(line.itemId ?? "");
    if (!found) throw new DomainValueError("Không tìm thấy vật tư");
    const field = `lines.${index}`;
    if (found.status !== "ACTIVE") {
      throw new ServiceFailure(conflict(`Vật tư ${found.code} đã ngừng dùng`));
    }
    if (seen.has(found.id)) {
      throw new ProductionFieldError(
        PRODUCTION_MESSAGES.duplicateLine(found.code),
        `${field}.itemId`,
      );
    }
    seen.add(found.id);
    if (!withBom.has(found.id)) {
      throw new ProductionFieldError(
        PRODUCTION_MESSAGES.noBom(found.code),
        `${field}.itemId`,
      );
    }
    const milli = readPlanned(line.quantity, `${field}.quantity`);
    checkPlanned(milli, `${field}.quantity`);
    return { itemId: found.id, milli, unit: "PIECE" as const };
  });
}

async function checkOrder(
  tx: Tx,
  body: ProductionOrderBody,
): Promise<CheckedOrder> {
  const text = checkText(body);
  const lines = await checkLines(tx, body.lines ?? []);
  // Items before places: the lock order every posting uses.
  const workshop = await placeOf(tx, body.workshopId);
  if (!workshop || workshop.type !== "WORKSHOP") {
    throw new ProductionFieldError(
      PRODUCTION_MESSAGES.notWorkshop,
      "workshopId",
    );
  }
  const yard = await placeOf(tx, body.toLocationId);
  if (!yard || yard.type !== "YARD") {
    throw new ProductionFieldError(PRODUCTION_MESSAGES.notYard, "toLocationId");
  }
  return {
    ...text,
    workshopId: workshop.id,
    toLocationId: yard.id,
    lines,
  };
}

async function writeLines(
  tx: Tx,
  orderId: string,
  lines: CheckedOrder["lines"],
): Promise<void> {
  await tx
    .delete(productionOrderLine)
    .where(eq(productionOrderLine.orderId, orderId));
  await tx.insert(productionOrderLine).values(
    lines.map((line, index) => ({
      orderId,
      position: index + 1,
      itemId: line.itemId,
      quantityPlanned: quantityToDb(toQuantity(line.milli, line.unit)),
    })),
  );
}

export function createProductionOrder(
  db: Database,
  actor: Actor,
  body: ProductionOrderBody,
  now: BusinessDate = today(),
): Promise<ServiceResult<SavedProductionOrder>> {
  return runProduction(async () => {
    const saved = await db.transaction(async (tx) => {
      const checked = await checkOrder(tx, body);
      const code = await nextDocumentCode(
        tx,
        PRODUCTION_PREFIX,
        Number(now.slice(0, 4)),
      );
      const [row] = await tx
        .insert(productionOrder)
        .values({
          code,
          workshopId: checked.workshopId,
          toLocationId: checked.toLocationId,
          team: checked.team,
          note: checked.note,
          createdBy: actor.id,
        })
        .returning({
          id: productionOrder.id,
          updatedAt: productionOrder.updatedAt,
        });
      const id = row?.id ?? "";
      await writeLines(tx, id, checked.lines);
      await logActivity(tx, actor, {
        action: "CREATE",
        document: { type: "PRODUCTION_ORDER", id, code },
        summary: draftSummary(await productionView(tx, id)),
      });
      return { code, updatedAt: row?.updatedAt ?? new Date() };
    });
    return ok(saved);
  });
}

function draftOnly(status: string, message: string): void {
  if (status === "DRAFT") return;
  throw new ServiceFailure(
    conflict(
      status === "POSTED"
        ? PRODUCTION_MESSAGES.posted
        : status === "CANCELLED"
          ? PRODUCTION_MESSAGES.cancelled
          : message,
    ),
  );
}

export function updateProductionOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: ProductionOrderBody,
): Promise<ServiceResult<SavedProductionOrder>> {
  return runProduction(async () => {
    const updatedAt = new Date();
    await db.transaction(async (tx) => {
      const current = await lockProductionOrder(tx, code);
      draftOnly(current.status, PRODUCTION_MESSAGES.linesLocked);
      assertFresh(current, body.updatedAt);
      const checked = await checkOrder(tx, body);
      const before = await productionView(tx, current.id);
      await tx
        .update(productionOrder)
        .set({
          workshopId: checked.workshopId,
          toLocationId: checked.toLocationId,
          team: checked.team,
          note: checked.note,
          updatedAt,
        })
        .where(eq(productionOrder.id, current.id));
      await writeLines(tx, current.id, checked.lines);
      const changes = productionChanges(
        before,
        await productionView(tx, current.id),
      );
      if (changes.length > 0) {
        await logActivity(tx, actor, {
          action: "UPDATE",
          document: { type: "PRODUCTION_ORDER", id: current.id, code },
          summary: changeSummary(changes),
          changes,
        });
      }
    });
    return ok({ code, updatedAt });
  });
}

export function deleteProductionOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: { updatedAt?: string },
): Promise<ServiceResult<null>> {
  return runProduction(async () => {
    await db.transaction(async (tx) => {
      const current = await lockProductionOrder(tx, code);
      draftOnly(current.status, PRODUCTION_MESSAGES.notDeletable);
      assertFresh(current, body.updatedAt);
      const draft = await productionView(tx, current.id);
      await tx
        .delete(productionOrder)
        .where(eq(productionOrder.id, current.id));
      await logActivity(tx, actor, {
        action: "DELETE_DRAFT",
        document: { type: "PRODUCTION_ORDER", id: current.id, code },
        summary: `Nháp có ${countText(draft.lines.length, "thành phẩm")}, chưa giao xưởng`,
      });
    });
    return ok(null);
  });
}

/** Every line's rate and materials, copied from its BOM (design D10). */
async function copyBoms(tx: Tx, orderId: string): Promise<void> {
  const lines = await tx
    .select({
      id: productionOrderLine.id,
      itemId: productionOrderLine.itemId,
      code: item.code,
    })
    .from(productionOrderLine)
    .innerJoin(item, eq(item.id, productionOrderLine.itemId))
    .where(eq(productionOrderLine.orderId, orderId))
    .orderBy(asc(productionOrderLine.position));
  const boms = await tx
    .select({
      id: productionBom.id,
      itemId: productionBom.itemId,
      laborRate: productionBom.laborRate,
    })
    .from(productionBom)
    .where(
      inArray(
        productionBom.itemId,
        lines.map((line) => line.itemId),
      ),
    )
    .orderBy(asc(productionBom.id))
    .for("share");
  const materials = boms.length
    ? await tx
        .select({
          bomId: productionBomMaterial.bomId,
          itemId: productionBomMaterial.itemId,
          perUnit: productionBomMaterial.quantityPerUnit,
        })
        .from(productionBomMaterial)
        .where(
          inArray(
            productionBomMaterial.bomId,
            boms.map((bom) => bom.id),
          ),
        )
        .orderBy(asc(productionBomMaterial.position))
    : [];
  for (const line of lines) {
    const bom = boms.find((row) => row.itemId === line.itemId);
    if (!bom) {
      throw new ProductionFieldError(
        PRODUCTION_MESSAGES.noBom(line.code),
        "lines",
      );
    }
    await tx
      .update(productionOrderLine)
      .set({ laborRate: bom.laborRate })
      .where(eq(productionOrderLine.id, line.id));
    await tx.insert(productionOrderMaterial).values(
      materials
        .filter((material) => material.bomId === bom.id)
        .map((material) => ({
          lineId: line.id,
          itemId: material.itemId,
          normPerUnit: material.perUnit,
        })),
    );
  }
}

/** Giao xưởng: the order takes the BOM as it is now (0.2 số 145). */
export function assignProductionOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: ProductionStepBody,
): Promise<ServiceResult<SteppedProductionOrder>> {
  return runProduction(async () => {
    const updatedAt = new Date();
    const status = await db.transaction(async (tx) => {
      const current = await lockProductionOrder(tx, code);
      assertFresh(current, body.updatedAt);
      const next = stepOf(current, "assign");
      await copyBoms(tx, current.id);
      await tx
        .update(productionOrder)
        .set({
          status: next,
          assignedBy: actor.id,
          assignedAt: updatedAt,
          updatedAt,
        })
        .where(eq(productionOrder.id, current.id));
      await logActivity(tx, actor, {
        action: "ASSIGN",
        document: { type: "PRODUCTION_ORDER", id: current.id, code },
        summary: assignSummary(await productionView(tx, current.id)),
      });
      return next;
    });
    return ok({ code, status, updatedAt });
  });
}

async function linesOfOrder(tx: Tx, orderId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: productionOrderLine.id })
    .from(productionOrderLine)
    .where(eq(productionOrderLine.orderId, orderId));
  return rows.map((row) => row.id);
}

/** Thu hồi: back to draft before the workshop took it; the copy is dropped. */
export function recallProductionOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: ProductionStepBody,
): Promise<ServiceResult<SteppedProductionOrder>> {
  return runProduction(async () => {
    const updatedAt = new Date();
    const status = await db.transaction(async (tx) => {
      const current = await lockProductionOrder(tx, code);
      assertFresh(current, body.updatedAt);
      const next = stepOf(current, "recall");
      const lineIds = await linesOfOrder(tx, current.id);
      if (lineIds.length > 0) {
        await tx
          .delete(productionOrderMaterial)
          .where(inArray(productionOrderMaterial.lineId, lineIds));
      }
      await tx
        .update(productionOrderLine)
        .set({ laborRate: null })
        .where(eq(productionOrderLine.orderId, current.id));
      await tx
        .update(productionOrder)
        .set({ status: next, assignedBy: null, assignedAt: null, updatedAt })
        .where(eq(productionOrder.id, current.id));
      await logActivity(tx, actor, {
        action: "RECALL",
        document: { type: "PRODUCTION_ORDER", id: current.id, code },
        summary: "Xưởng chưa nhận, lệnh về Nháp",
      });
      return next;
    });
    return ok({ code, status, updatedAt });
  });
}

/**
 * Trả lại xưởng: the count and the approval are dropped, what the workshop
 * reported stays on D20 for reference (spec "Trả lại xóa số đếm và lần duyệt").
 */
export function returnProductionOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: ProductionStepBody,
): Promise<ServiceResult<SteppedProductionOrder>> {
  return runProduction(async () => {
    const updatedAt = new Date();
    const status = await db.transaction(async (tx) => {
      const current = await lockProductionOrder(tx, code);
      assertFresh(current, body.updatedAt);
      const next = stepOf(current, "return");
      const note = checkStepNote(body.note, "return");
      const lineIds = await linesOfOrder(tx, current.id);
      await tx
        .update(productionOrderLine)
        .set({ quantityFinished: null, offcutKg: null })
        .where(eq(productionOrderLine.orderId, current.id));
      if (lineIds.length > 0) {
        // Materials only the storekeeper wrote down go with the count.
        await tx
          .delete(productionOrderMaterial)
          .where(
            and(
              inArray(productionOrderMaterial.lineId, lineIds),
              isNull(productionOrderMaterial.normPerUnit),
              isNull(productionOrderMaterial.reportedQuantity),
            ),
          );
        await tx
          .update(productionOrderMaterial)
          .set({ quantity: null })
          .where(inArray(productionOrderMaterial.lineId, lineIds));
      }
      await tx
        .update(productionOrder)
        .set({
          status: next,
          countedBy: null,
          countedAt: null,
          approvedBy: null,
          approvedAt: null,
          approveNote: null,
          returnedBy: actor.id,
          returnedAt: updatedAt,
          returnNote: note,
          updatedAt,
        })
        .where(eq(productionOrder.id, current.id));
      await logActivity(tx, actor, {
        action: "RETURN",
        document: { type: "PRODUCTION_ORDER", id: current.id, code },
        summary: `Ghi chú: ${note}`,
      });
      return next;
    });
    return ok({ code, status, updatedAt });
  });
}

/** Duyệt vượt định mức (0.2 số 140): the director, with a note. */
export function approveProductionOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: ProductionStepBody,
): Promise<ServiceResult<SteppedProductionOrder>> {
  return runProduction(async () => {
    const updatedAt = new Date();
    const status = await db.transaction(async (tx) => {
      const current = await lockProductionOrder(tx, code);
      assertFresh(current, body.updatedAt);
      const next = stepOf(current, "approve");
      const note = checkStepNote(body.note, "approve");
      await tx
        .update(productionOrder)
        .set({
          status: next,
          approvedBy: actor.id,
          approvedAt: updatedAt,
          approveNote: note,
          updatedAt,
        })
        .where(eq(productionOrder.id, current.id));
      await logActivity(tx, actor, {
        action: "APPROVE",
        document: { type: "PRODUCTION_ORDER", id: current.id, code },
        summary: joinParts(
          overuseSummary(await readPostingLines(tx, current.id)),
          note,
        ),
      });
      return next;
    });
    return ok({ code, status, updatedAt });
  });
}

/** Hủy lệnh: a reason is needed; nothing reaches the ledger before posting. */
export function cancelProductionOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: ProductionStepBody,
): Promise<ServiceResult<SteppedProductionOrder>> {
  return runProduction(async () => {
    const updatedAt = new Date();
    const status = await db.transaction(async (tx) => {
      const current = await lockProductionOrder(tx, code);
      assertFresh(current, body.updatedAt);
      const next = stepOf(current, "cancel");
      const reason = checkStepNote(body.reason, "cancel");
      await tx
        .update(productionOrder)
        .set({
          status: next,
          cancelledBy: actor.id,
          cancelledAt: updatedAt,
          cancelReason: reason,
          updatedAt,
        })
        .where(eq(productionOrder.id, current.id));
      await logActivity(tx, actor, {
        action: "CANCEL",
        document: { type: "PRODUCTION_ORDER", id: current.id, code },
        summary: `Lý do: ${reason}`,
      });
      return next;
    });
    return ok({ code, status, updatedAt });
  });
}

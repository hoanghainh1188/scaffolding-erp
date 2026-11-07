// Repair work orders, office steps (repair-work-orders design D1, D4, D5,
// D7; spec repair-work-orders): draft, assign (takes the labour rates),
// recall, return to the workshop, cancel (sends received stock back) and
// delete a draft. Every write locks the order, checks the updatedAt the
// user saw and the step rule, then logs in the same transaction.
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import { item, location, repairOrder, repairOrderLine } from "@/db/schema";
import { countText } from "@/domain/activity-summary";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { DomainValueError } from "@/domain/errors";
import { quantityFromDb, quantityToDb, toQuantity } from "@/domain/quantity";
import {
  REPAIRED_BY_MAX,
  REPAIR_DOCUMENT_TYPE,
  REPAIR_MESSAGES,
  REPAIR_NOTE_MAX,
  REPAIR_PREFIX,
  RepairFieldError,
  checkRepairLines,
  type RepairLineInput,
} from "@/domain/repair-order";
import {
  WORK_ORDER_MESSAGES,
  checkReason,
  transferLines,
  transition,
  type WorkOrderStatus,
  type WorkOrderStep,
} from "@/domain/repair-work-order";
import { logActivity } from "@/lib/activity/log";
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
import { lockForPosting, postMovements, type Tx } from "@/lib/inventory/post";
import { unitFromDb } from "@/lib/inventory/unit";

import {
  assignSummary,
  draftSummary,
  moveSummary,
  repairChanges,
  repairView,
} from "./activity";
import { lockSlip, runRepair, type SavedRepair } from "./orders";
import { changeSummary } from "@/domain/activity-summary";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const today = () => toBusinessDate(new Date());

export interface WorkOrderLineBody {
  itemId?: string;
  /** "40": whole pieces as text. */
  quantityTaken?: string;
}

export interface WorkOrderBody {
  workshopId?: string;
  fromLocationId?: string;
  /** Tổ sửa. */
  repairedBy?: string | null;
  note?: string | null;
  lines?: WorkOrderLineBody[];
  /** The order's updatedAt the form was opened with (edits only). */
  updatedAt?: string;
}

export interface StepBody {
  updatedAt?: string;
  reason?: string | null;
}

/** Locks a work order by code: 404 when missing, 409 for a simple slip. */
export async function lockWorkOrder(tx: Tx, code: string) {
  const row = await lockSlip(tx, code);
  if (row.kind !== "WORK_ORDER") {
    throw new ServiceFailure(notFound());
  }
  return row;
}

/** 409 when someone changed the order since the user opened it (D5). */
export function assertFresh(
  current: { updatedAt: Date },
  seen: string | undefined,
): void {
  const time = seen ? new Date(seen).getTime() : NaN;
  if (time !== current.updatedAt.getTime()) {
    throw new ServiceFailure(conflict(WORK_ORDER_MESSAGES.stale));
  }
}

/** The status after the step, or 409 (WorkOrderStateError via runRepair). */
export function stepOf(
  current: { status: string },
  step: WorkOrderStep,
): WorkOrderStatus {
  return transition(current.status as WorkOrderStatus, step);
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

interface CheckedOrder {
  workshopId: string;
  fromLocationId: string;
  repairedBy: string | null;
  note: string | null;
  lines: RepairLineInput[];
}

function readTaken(value: string | undefined, index: number): number {
  try {
    return quantityFromDb((value ?? "").trim(), "KG").milli;
  } catch {
    throw new RepairFieldError(
      "Số lượng không hợp lệ",
      `lines.${index}.quantityTaken`,
    );
  }
}

/** Text, places and lines of a draft (spec "Lệnh sửa chữa", "Dòng của lệnh"). */
async function checkOrder(tx: Tx, body: WorkOrderBody): Promise<CheckedOrder> {
  const repairedBy = optionalText(body.repairedBy);
  if (repairedBy && repairedBy.length > REPAIRED_BY_MAX) {
    throw new RepairFieldError(REPAIR_MESSAGES.repairedByTooLong, "repairedBy");
  }
  const note = optionalText(body.note);
  if (note && note.length > REPAIR_NOTE_MAX) {
    throw new RepairFieldError(REPAIR_MESSAGES.noteTooLong, "note");
  }
  const raw = body.lines ?? [];
  const ids = [...new Set(raw.map((line) => line.itemId ?? ""))];
  if (!ids.every((id) => UUID.test(id))) {
    throw new DomainValueError("Không tìm thấy vật tư");
  }
  const rows = ids.length
    ? await tx
        .select({
          id: item.id,
          code: item.code,
          unit: item.unit,
          status: item.status,
        })
        .from(item)
        .where(inArray(item.id, ids))
        .orderBy(asc(item.id))
        .for("share")
    : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const lines = raw.map((line, index): RepairLineInput => {
    const found = byId.get(line.itemId ?? "");
    if (!found) throw new DomainValueError("Không tìm thấy vật tư");
    if (found.status !== "ACTIVE") {
      throw new ServiceFailure(conflict(`Vật tư ${found.code} đã ngừng dùng`));
    }
    const takenMilli = readTaken(line.quantityTaken, index);
    // Repaired = taken only for the line rules: nothing is reported yet.
    return {
      itemId: found.id,
      itemCode: found.code,
      unit: unitFromDb(found.unit),
      takenMilli,
      goodMilli: takenMilli,
      scrapMilli: 0,
      repairCost: 0,
    };
  });
  checkRepairLines(lines);
  // Items before places: the lock order every posting uses.
  const workshop = await placeOf(tx, body.workshopId);
  if (!workshop || workshop.type !== "WORKSHOP") {
    throw new RepairFieldError(WORK_ORDER_MESSAGES.notWorkshop, "workshopId");
  }
  const from = await placeOf(tx, body.fromLocationId);
  if (!from || (from.type !== "YARD" && from.id !== workshop.id)) {
    throw new RepairFieldError(WORK_ORDER_MESSAGES.badSource, "fromLocationId");
  }
  return {
    workshopId: workshop.id,
    fromLocationId: from.id,
    repairedBy,
    note,
    lines,
  };
}

async function writeOrderLines(
  tx: Tx,
  orderId: string,
  lines: readonly RepairLineInput[],
): Promise<void> {
  await tx.delete(repairOrderLine).where(eq(repairOrderLine.orderId, orderId));
  await tx.insert(repairOrderLine).values(
    lines.map((line, index) => ({
      orderId,
      position: index + 1,
      itemId: line.itemId,
      quantityTaken: quantityToDb(toQuantity(line.takenMilli, line.unit)),
      quantityGood: "0",
      quantityScrap: "0",
      repairCost: 0,
    })),
  );
}

export function createWorkOrder(
  db: Database,
  actor: Actor,
  body: WorkOrderBody,
  now: BusinessDate = today(),
): Promise<ServiceResult<SavedRepair>> {
  return runRepair(async () => {
    const saved = await db.transaction(async (tx) => {
      const checked = await checkOrder(tx, body);
      const code = await nextDocumentCode(
        tx,
        REPAIR_PREFIX,
        Number(now.slice(0, 4)),
      );
      const [row] = await tx
        .insert(repairOrder)
        .values({
          code,
          kind: "WORK_ORDER",
          repairDate: now,
          repairedBy: checked.repairedBy,
          note: checked.note,
          fromLocationId: checked.fromLocationId,
          toLocationId: checked.workshopId,
          createdBy: actor.id,
        })
        .returning({ id: repairOrder.id, updatedAt: repairOrder.updatedAt });
      const id = row?.id ?? "";
      await writeOrderLines(tx, id, checked.lines);
      await logActivity(tx, actor, {
        action: "CREATE",
        document: { type: "REPAIR_ORDER", id, code },
        summary: draftSummary(await repairView(tx, id)),
      });
      return { code, updatedAt: row?.updatedAt ?? new Date() };
    });
    return ok(saved);
  });
}

export function updateWorkOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: WorkOrderBody,
): Promise<ServiceResult<SavedRepair>> {
  return runRepair(async () => {
    const updatedAt = new Date();
    await db.transaction(async (tx) => {
      const current = await lockWorkOrder(tx, code);
      if (current.status !== "DRAFT") {
        throw new ServiceFailure(
          conflict(
            current.status === "CANCELLED" || current.status === "POSTED"
              ? stateText(current.status)
              : WORK_ORDER_MESSAGES.linesLocked,
          ),
        );
      }
      assertFresh(current, body.updatedAt);
      const checked = await checkOrder(tx, body);
      const before = await repairView(tx, current.id);
      await tx
        .update(repairOrder)
        .set({
          repairedBy: checked.repairedBy,
          note: checked.note,
          fromLocationId: checked.fromLocationId,
          toLocationId: checked.workshopId,
          updatedAt,
        })
        .where(eq(repairOrder.id, current.id));
      await writeOrderLines(tx, current.id, checked.lines);
      const changes = repairChanges(before, await repairView(tx, current.id));
      if (changes.length > 0) {
        await logActivity(tx, actor, {
          action: "UPDATE",
          document: { type: "REPAIR_ORDER", id: current.id, code },
          summary: changeSummary(changes),
          changes,
        });
      }
    });
    return ok({ code, updatedAt });
  });
}

function stateText(status: "CANCELLED" | "POSTED"): string {
  return status === "CANCELLED"
    ? WORK_ORDER_MESSAGES.cancelled
    : WORK_ORDER_MESSAGES.posted;
}

export function deleteWorkOrder(
  db: Database,
  actor: Actor,
  code: string,
): Promise<ServiceResult<null>> {
  return runRepair(async () => {
    await db.transaction(async (tx) => {
      const current = await lockWorkOrder(tx, code);
      if (current.status !== "DRAFT") {
        throw new ServiceFailure(
          conflict(
            current.status === "CANCELLED" || current.status === "POSTED"
              ? stateText(current.status)
              : WORK_ORDER_MESSAGES.notDeletable,
          ),
        );
      }
      const draft = await repairView(tx, current.id);
      await tx.delete(repairOrder).where(eq(repairOrder.id, current.id));
      await logActivity(tx, actor, {
        action: "DELETE_DRAFT",
        document: { type: "REPAIR_ORDER", id: current.id, code },
        summary: `Nháp có ${countText(draft.lines.length, "mã hàng")}, chưa giao xưởng`,
      });
    });
    return ok(null);
  });
}

export interface SteppedOrder {
  code: string;
  status: WorkOrderStatus;
  updatedAt: Date;
}

/**
 * Giao xưởng (design D4, 0.2 số 126): every line takes the labour rate of
 * its item now; an item without one stops the step.
 */
export function assignWorkOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: StepBody,
): Promise<ServiceResult<SteppedOrder>> {
  return runRepair(async () => {
    const updatedAt = new Date();
    const status = await db.transaction(async (tx) => {
      const current = await lockWorkOrder(tx, code);
      const next = stepOf(current, "assign");
      assertFresh(current, body.updatedAt);
      const lines = await tx
        .select({
          id: repairOrderLine.id,
          itemId: repairOrderLine.itemId,
          code: item.code,
          rate: item.repairLaborRate,
        })
        .from(repairOrderLine)
        .innerJoin(item, eq(item.id, repairOrderLine.itemId))
        .where(eq(repairOrderLine.orderId, current.id))
        .orderBy(asc(repairOrderLine.position));
      for (const line of lines) {
        if (line.rate === null) {
          throw new RepairFieldError(
            WORK_ORDER_MESSAGES.noLaborRate(line.code),
            "lines",
          );
        }
        await tx
          .update(repairOrderLine)
          .set({ laborRate: line.rate })
          .where(eq(repairOrderLine.id, line.id));
      }
      await tx
        .update(repairOrder)
        .set({
          status: next,
          assignedBy: actor.id,
          assignedAt: updatedAt,
          updatedAt,
        })
        .where(eq(repairOrder.id, current.id));
      await logActivity(tx, actor, {
        action: "ASSIGN",
        document: { type: "REPAIR_ORDER", id: current.id, code },
        summary: assignSummary(await repairView(tx, current.id)),
      });
      return next;
    });
    return ok({ code, status, updatedAt });
  });
}

/** Thu hồi lệnh: back to draft before the workshop took it (rates cleared). */
export function recallWorkOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: StepBody,
): Promise<ServiceResult<SteppedOrder>> {
  return runRepair(async () => {
    const updatedAt = new Date();
    const status = await db.transaction(async (tx) => {
      const current = await lockWorkOrder(tx, code);
      const next = stepOf(current, "recall");
      assertFresh(current, body.updatedAt);
      await tx
        .update(repairOrderLine)
        .set({ laborRate: null })
        .where(eq(repairOrderLine.orderId, current.id));
      await tx
        .update(repairOrder)
        .set({ status: next, assignedBy: null, assignedAt: null, updatedAt })
        .where(eq(repairOrder.id, current.id));
      await logActivity(tx, actor, {
        action: "RECALL",
        document: { type: "REPAIR_ORDER", id: current.id, code },
        summary: "Xưởng chưa nhận, lệnh về Nháp",
      });
      return next;
    });
    return ok({ code, status, updatedAt });
  });
}

/**
 * Trả lại xưởng sửa số: the numbers stay for the workshop to fix; the
 * storekeeper's count is dropped (spec "Trả lại xưởng sửa số").
 */
export function returnWorkOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: StepBody,
): Promise<ServiceResult<SteppedOrder>> {
  return runRepair(async () => {
    const updatedAt = new Date();
    const status = await db.transaction(async (tx) => {
      const current = await lockWorkOrder(tx, code);
      const next = stepOf(current, "return");
      assertFresh(current, body.updatedAt);
      const reason = checkReason(body.reason, "return");
      const lines = await tx
        .select({
          id: repairOrderLine.id,
          reportedGood: repairOrderLine.reportedGood,
          reportedScrap: repairOrderLine.reportedScrap,
        })
        .from(repairOrderLine)
        .where(eq(repairOrderLine.orderId, current.id));
      for (const line of lines) {
        await tx
          .update(repairOrderLine)
          .set({
            quantityGood: line.reportedGood ?? "0",
            quantityScrap: line.reportedScrap ?? "0",
          })
          .where(eq(repairOrderLine.id, line.id));
      }
      await tx
        .update(repairOrder)
        .set({
          status: next,
          countedBy: null,
          countedAt: null,
          returnedBy: actor.id,
          returnedAt: updatedAt,
          returnNote: reason,
          updatedAt,
        })
        .where(eq(repairOrder.id, current.id));
      await logActivity(tx, actor, {
        action: "RETURN",
        document: { type: "REPAIR_ORDER", id: current.id, code },
        summary: `Lý do: ${reason}`,
      });
      return next;
    });
    return ok({ code, status, updatedAt });
  });
}

/** Moves the Chờ sửa stock of the order between two places (design D2). */
export async function moveOrderStock(
  tx: Tx,
  actor: Actor,
  order: { id: string; code: string },
  places: { fromId: string; toId: string },
  reason: "receive" | "cancel",
  now: BusinessDate,
): Promise<string | null> {
  if (places.fromId === places.toId) return null;
  const lines = await tx
    .select({
      itemId: repairOrderLine.itemId,
      itemCode: item.code,
      taken: repairOrderLine.quantityTaken,
    })
    .from(repairOrderLine)
    .innerJoin(item, eq(item.id, repairOrderLine.itemId))
    .where(eq(repairOrderLine.orderId, order.id))
    .orderBy(asc(repairOrderLine.position));
  const moves = lines.map((line) => ({
    itemId: line.itemId,
    itemCode: line.itemCode,
    takenMilli: quantityFromDb(line.taken, "KG").milli,
  }));
  await lockForPosting(tx, {
    itemIds: moves.map((line) => line.itemId),
    locationIds: [places.fromId, places.toId],
    pairs: moves.map((line) => ({
      itemId: line.itemId,
      condition: "NEEDS_REPAIR" as const,
    })),
  });
  const { postingId } = await postMovements(
    tx,
    actor,
    {
      documentType: REPAIR_DOCUMENT_TYPE,
      documentId: order.id,
      documentCode: order.code,
      businessDate: now,
      lines: transferLines(order.code, moves, places, reason),
    },
    now,
  );
  return postingId;
}

/**
 * Hủy lệnh (0.2 số 124): a reason is needed; stock the workshop already took
 * goes back to where it came from, in the same transaction.
 */
export function cancelWorkOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: StepBody,
  now: BusinessDate = today(),
): Promise<ServiceResult<SteppedOrder>> {
  return runRepair(async () => {
    const updatedAt = new Date();
    const status = await db.transaction(async (tx) => {
      const current = await lockWorkOrder(tx, code);
      const next = stepOf(current, "cancel");
      assertFresh(current, body.updatedAt);
      const reason = checkReason(body.reason, "cancel");
      const received = current.receivedAt !== null;
      const cancelPostingId = received
        ? await moveOrderStock(
            tx,
            actor,
            current,
            { fromId: current.toLocationId, toId: current.fromLocationId },
            "cancel",
            now,
          )
        : null;
      const view = await repairView(tx, current.id);
      await tx
        .update(repairOrder)
        .set({
          status: next,
          cancelledBy: actor.id,
          cancelledAt: updatedAt,
          cancelReason: reason,
          cancelPostingId,
          updatedAt,
        })
        .where(eq(repairOrder.id, current.id));
      await logActivity(tx, actor, {
        action: "CANCEL",
        document: { type: "REPAIR_ORDER", id: current.id, code },
        summary:
          cancelPostingId === null
            ? `Lý do: ${reason}`
            : `${moveSummary(view, "cancel")} · lý do: ${reason}`,
      });
      return next;
    });
    return ok({ code, status, updatedAt });
  });
}

/** Active workshops and yards for the D12 draft (lowest code first). */
export async function workOrderPlaces(db: Database | Tx) {
  return db
    .select({
      id: location.id,
      code: location.code,
      name: location.name,
      type: location.type,
    })
    .from(location)
    .where(
      and(
        inArray(location.type, ["YARD", "WORKSHOP"]),
        eq(location.status, "ACTIVE"),
      ),
    )
    .orderBy(asc(location.code));
}

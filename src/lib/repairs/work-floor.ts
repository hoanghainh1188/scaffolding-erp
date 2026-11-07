// Repair work orders, phone steps (repair-work-orders design D2, D5; spec
// repair-mobile): the workshop takes the stock (yard → workshop transfer),
// reports repaired / scrap / supplies, the storekeeper counts. Every step
// carries a draft id made on the phone; each id used is kept in
// repair_order_submission, so a late resend of an earlier step answers the
// current state and writes nothing. No price leaves these functions.
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  item,
  itemGroup,
  repairOrder,
  repairOrderLine,
  repairOrderMaterial,
  repairOrderSubmission,
} from "@/db/schema";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { DomainValueError } from "@/domain/errors";
import { quantityFromDb, quantityToDb, toQuantity } from "@/domain/quantity";
import { RepairFieldError } from "@/domain/repair-order";
import {
  checkReport,
  type ItemCategory,
  type ReportLine,
  type WorkOrderStatus,
} from "@/domain/repair-work-order";
import { joinParts } from "@/domain/activity-summary";
import { logActivity } from "@/lib/activity/log";
import { ok, type Actor, type ServiceResult } from "@/lib/catalog/common";
import type { Tx } from "@/lib/inventory/post";
import { unitFromDb } from "@/lib/inventory/unit";

import {
  countDifferences,
  moveSummary,
  reportSummary,
  repairView,
} from "./activity";
import { runRepair } from "./orders";
import {
  assertFresh,
  lockWorkOrder,
  moveOrderStock,
  stepOf,
  type SteppedOrder,
} from "./work-orders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const today = () => toBusinessDate(new Date());

export const FLOOR_MESSAGES = {
  draftId: "Thiếu mã nháp của điện thoại",
  lineMissing: (code: string) => `Ghi số sửa xong và phế cho ${code}`,
  materialMissing: "Không tìm thấy vật tư phụ",
  materialArchived: (code: string) => `Vật tư ${code} đã ngừng dùng`,
  quantity: "Số lượng không hợp lệ",
} as const;

export interface FloorStepBody {
  draftId?: string;
  updatedAt?: string;
}

export interface FloorLineBody {
  itemId?: string;
  good?: string;
  scrap?: string;
  materials?: { itemId?: string; quantity?: string }[];
}

export interface ReportBody extends FloorStepBody {
  lines?: FloorLineBody[];
}

type SubmissionStep = "RECEIVE" | "REPORT" | "COUNT";

function draftIdOf(body: FloorStepBody): string {
  const id = body.draftId ?? "";
  if (!UUID.test(id)) throw new DomainValueError(FLOOR_MESSAGES.draftId);
  return id;
}

/** The order's state when this draft id was already used, else null. */
async function replayOf(
  tx: Pick<Tx, "select">,
  code: string,
  draftId: string,
): Promise<SteppedOrder | null> {
  const [row] = await tx
    .select({
      code: repairOrder.code,
      status: repairOrder.status,
      updatedAt: repairOrder.updatedAt,
    })
    .from(repairOrderSubmission)
    .innerJoin(repairOrder, eq(repairOrder.id, repairOrderSubmission.orderId))
    .where(eq(repairOrderSubmission.draftId, draftId));
  if (!row || row.code !== code) return null;
  return { ...row, status: row.status as WorkOrderStatus };
}

async function remember(
  tx: Tx,
  actor: Actor,
  orderId: string,
  step: SubmissionStep,
  draftId: string,
): Promise<void> {
  await tx.insert(repairOrderSubmission).values({
    orderId,
    step,
    draftId,
    createdBy: actor.id,
  });
}

/**
 * Runs one phone step: replay first (before any lock, then again under the
 * order lock for two sends racing), then the step itself.
 */
async function floorStep(
  db: Database,
  code: string,
  body: FloorStepBody,
  step: (tx: Tx, draftId: string) => Promise<SteppedOrder>,
): Promise<SteppedOrder> {
  const draftId = draftIdOf(body);
  const early = await replayOf(db, code, draftId);
  if (early) return early;
  return db.transaction(async (tx) => {
    await lockWorkOrder(tx, code);
    const late = await replayOf(tx, code, draftId);
    if (late) return late;
    return step(tx, draftId);
  });
}

/**
 * Nhận lệnh (0.2 số 119): Chờ sửa moves from the yard to the workshop at the
 * average cost, its own posting; nothing moves when the order takes the
 * stock at the workshop itself.
 */
export function receiveWorkOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: FloorStepBody,
  now: BusinessDate = today(),
): Promise<ServiceResult<SteppedOrder>> {
  return runRepair(async () =>
    ok(
      await floorStep(db, code, body, async (tx, draftId) => {
        const current = await lockWorkOrder(tx, code);
        const next = stepOf(current, "receive");
        assertFresh(current, body.updatedAt);
        const postingId = await moveOrderStock(
          tx,
          actor,
          current,
          { fromId: current.fromLocationId, toId: current.toLocationId },
          "receive",
          now,
        );
        const updatedAt = new Date();
        await tx
          .update(repairOrder)
          .set({
            status: next,
            receivedBy: actor.id,
            receivedAt: updatedAt,
            receivePostingId: postingId,
            updatedAt,
          })
          .where(eq(repairOrder.id, current.id));
        await remember(tx, actor, current.id, "RECEIVE", draftId);
        await logActivity(tx, actor, {
          action: "RECEIVE",
          document: { type: "REPAIR_ORDER", id: current.id, code },
          summary: moveSummary(await repairView(tx, current.id), "receive"),
        });
        return { code, status: next, updatedAt };
      }),
    ),
  );
}

function readMilli(value: string | undefined, field: string): number {
  try {
    return quantityFromDb((value ?? "").trim(), "KG").milli;
  } catch {
    throw new RepairFieldError(FLOOR_MESSAGES.quantity, field);
  }
}

interface LoadedReport {
  lines: (ReportLine & { lineId: string })[];
}

/** The order lines with what the phone sent, checked (spec repair-mobile). */
async function loadReport(
  tx: Tx,
  orderId: string,
  body: ReportBody,
): Promise<LoadedReport> {
  const stored = await tx
    .select({
      id: repairOrderLine.id,
      itemId: repairOrderLine.itemId,
      code: item.code,
      unit: item.unit,
      taken: repairOrderLine.quantityTaken,
    })
    .from(repairOrderLine)
    .innerJoin(item, eq(item.id, repairOrderLine.itemId))
    .where(eq(repairOrderLine.orderId, orderId))
    .orderBy(asc(repairOrderLine.position));
  const sent = new Map(
    (body.lines ?? []).map((line) => [line.itemId ?? "", line]),
  );
  const materialIds = [
    ...new Set(
      (body.lines ?? []).flatMap((line) =>
        (line.materials ?? []).map((material) => material.itemId ?? ""),
      ),
    ),
  ];
  if (!materialIds.every((id) => UUID.test(id))) {
    throw new DomainValueError(FLOOR_MESSAGES.materialMissing);
  }
  const materials = materialIds.length
    ? await tx
        .select({
          id: item.id,
          code: item.code,
          unit: item.unit,
          status: item.status,
          category: itemGroup.category,
        })
        .from(item)
        .innerJoin(itemGroup, eq(itemGroup.id, item.groupId))
        .where(inArray(item.id, materialIds))
        .orderBy(asc(item.id))
        .for("share", { of: item })
    : [];
  const byId = new Map(materials.map((row) => [row.id, row]));
  const lines = stored.map((line, index) => {
    const input = sent.get(line.itemId);
    if (!input) {
      throw new RepairFieldError(
        FLOOR_MESSAGES.lineMissing(line.code),
        `lines.${index}`,
      );
    }
    return {
      lineId: line.id,
      itemId: line.itemId,
      itemCode: line.code,
      unit: unitFromDb(line.unit),
      takenMilli: quantityFromDb(line.taken, "KG").milli,
      goodMilli: readMilli(input.good, `lines.${index}.quantityGood`),
      scrapMilli: readMilli(input.scrap, `lines.${index}.quantityScrap`),
      materials: (input.materials ?? []).map((material, at) => {
        const found = byId.get(material.itemId ?? "");
        if (!found) throw new DomainValueError(FLOOR_MESSAGES.materialMissing);
        if (found.status !== "ACTIVE") {
          throw new DomainValueError(
            FLOOR_MESSAGES.materialArchived(found.code),
          );
        }
        return {
          itemId: found.id,
          itemCode: found.code,
          unit: unitFromDb(found.unit),
          category: found.category as ItemCategory,
          quantityMilli: readMilli(
            material.quantity,
            `lines.${index}.materials.${at}.quantity`,
          ),
        };
      }),
    };
  });
  checkReport(lines);
  return { lines };
}

async function writeReport(
  tx: Tx,
  report: LoadedReport,
  reported: boolean,
): Promise<number> {
  let materials = 0;
  for (const line of report.lines) {
    const good = quantityToDb(toQuantity(line.goodMilli, line.unit));
    const scrap = quantityToDb(toQuantity(line.scrapMilli, line.unit));
    await tx
      .update(repairOrderLine)
      .set({
        quantityGood: good,
        quantityScrap: scrap,
        ...(reported ? { reportedGood: good, reportedScrap: scrap } : {}),
      })
      .where(eq(repairOrderLine.id, line.lineId));
    await tx
      .delete(repairOrderMaterial)
      .where(eq(repairOrderMaterial.lineId, line.lineId));
    if (line.materials.length > 0) {
      await tx.insert(repairOrderMaterial).values(
        line.materials.map((material) => ({
          lineId: line.lineId,
          itemId: material.itemId,
          quantity: quantityToDb(
            toQuantity(material.quantityMilli, material.unit),
          ),
        })),
      );
    }
    materials += line.materials.length;
  }
  return materials;
}

/** Báo sửa xong (0.2 số 129): the numbers reach the server only now. */
export function reportWorkOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: ReportBody,
  now: BusinessDate = today(),
): Promise<ServiceResult<SteppedOrder>> {
  return runRepair(async () =>
    ok(
      await floorStep(db, code, body, async (tx, draftId) => {
        const current = await lockWorkOrder(tx, code);
        const next = stepOf(current, "report");
        assertFresh(current, body.updatedAt);
        const report = await loadReport(tx, current.id, body);
        const materials = await writeReport(tx, report, true);
        const updatedAt = new Date();
        await tx
          .update(repairOrder)
          .set({
            status: next,
            repairDate: now,
            reportedBy: actor.id,
            reportedAt: updatedAt,
            updatedAt,
          })
          .where(eq(repairOrder.id, current.id));
        await remember(tx, actor, current.id, "REPORT", draftId);
        await logActivity(tx, actor, {
          action: "REPORT",
          document: { type: "REPAIR_ORDER", id: current.id, code },
          summary: reportSummary(await repairView(tx, current.id), materials),
        });
        return { code, status: next, updatedAt };
      }),
    ),
  );
}

/**
 * Đếm xong (0.2 số 128): the storekeeper's numbers become the ones posted;
 * what the workshop reported is kept beside them.
 */
export function countWorkOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: ReportBody,
): Promise<ServiceResult<SteppedOrder>> {
  return runRepair(async () =>
    ok(
      await floorStep(db, code, body, async (tx, draftId) => {
        const current = await lockWorkOrder(tx, code);
        const next = stepOf(current, "count");
        assertFresh(current, body.updatedAt);
        const report = await loadReport(tx, current.id, body);
        const materials = await writeReport(tx, report, false);
        const updatedAt = new Date();
        await tx
          .update(repairOrder)
          .set({
            status: next,
            countedBy: actor.id,
            countedAt: updatedAt,
            updatedAt,
          })
          .where(eq(repairOrder.id, current.id));
        await remember(tx, actor, current.id, "COUNT", draftId);
        const lines = await tx
          .select({
            code: item.code,
            unit: item.unit,
            reportedGood: repairOrderLine.reportedGood,
            reportedScrap: repairOrderLine.reportedScrap,
            good: repairOrderLine.quantityGood,
            scrap: repairOrderLine.quantityScrap,
          })
          .from(repairOrderLine)
          .innerJoin(item, eq(item.id, repairOrderLine.itemId))
          .where(and(eq(repairOrderLine.orderId, current.id)))
          .orderBy(asc(repairOrderLine.position));
        await logActivity(tx, actor, {
          action: "COUNT",
          document: { type: "REPAIR_ORDER", id: current.id, code },
          summary: joinParts(
            reportSummary(await repairView(tx, current.id), materials),
            countDifferences(
              lines.map((line) => ({
                ...line,
                unit: unitFromDb(line.unit),
                reportedGood: line.reportedGood ?? line.good,
                reportedScrap: line.reportedScrap ?? line.scrap,
              })),
            ),
          ),
        });
        return { code, status: next, updatedAt };
      }),
    ),
  );
}

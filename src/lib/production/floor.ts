// Production orders, phone steps (spec production-mobile, design D10): the
// workshop takes the order and reports, the storekeeper counts. Every step
// carries a draft id made on the phone; each id used is kept, so a late
// resend of an earlier step answers the current state and writes nothing.
// No price leaves these functions.
import { asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  item,
  itemGroup,
  productionOrder,
  productionOrderLine,
  productionOrderMaterial,
  productionOrderSubmission,
} from "@/db/schema";
import { DomainValueError } from "@/domain/errors";
import {
  BOM_MESSAGES,
  ProductionFieldError,
  type ItemCategory,
} from "@/domain/production-bom";
import {
  checkFloorReport,
  hasOveruse,
  type FloorLine,
  type FloorOrderLine,
  type ProductionStatus,
} from "@/domain/production-order";
import { quantityFromDb, quantityToDb, toQuantity } from "@/domain/quantity";
import { logActivity } from "@/lib/activity/log";
import {
  conflict,
  isUniqueViolation,
  ok,
  ServiceFailure,
  type Actor,
  type ServiceResult,
} from "@/lib/catalog/common";
import type { Tx } from "@/lib/inventory/post";
import { unitFromDb } from "@/lib/inventory/unit";

import { countSummary, productionView, reportSummary } from "./activity";
import {
  UUID,
  assertFresh,
  lockProductionOrder,
  runProduction,
  stepOf,
  type SteppedProductionOrder,
} from "./common";
import { readPostingLines } from "./records";

export const FLOOR_MESSAGES = {
  draftId: "Thiếu mã nháp của điện thoại",
  draftUsed: "Mã nháp đã dùng cho lệnh khác",
  materialMissing: "Không tìm thấy nguyên liệu",
  quantity: "Số lượng không hợp lệ",
} as const;

export interface FloorStepBody {
  draftId?: string;
  updatedAt?: string;
}

export interface FloorLineBody {
  itemId?: string;
  finished?: string;
  offcutKg?: string;
  materials?: { itemId?: string; quantity?: string }[];
}

export interface FloorReportBody extends FloorStepBody {
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
): Promise<SteppedProductionOrder | null> {
  const [row] = await tx
    .select({
      code: productionOrder.code,
      status: productionOrder.status,
      updatedAt: productionOrder.updatedAt,
    })
    .from(productionOrderSubmission)
    .innerJoin(
      productionOrder,
      eq(productionOrder.id, productionOrderSubmission.orderId),
    )
    .where(eq(productionOrderSubmission.draftId, draftId));
  if (!row || row.code !== code) return null;
  return { ...row, status: row.status as ProductionStatus };
}

async function remember(
  tx: Tx,
  actor: Actor,
  orderId: string,
  step: SubmissionStep,
  draftId: string,
): Promise<void> {
  await tx.insert(productionOrderSubmission).values({
    orderId,
    step,
    draftId,
    createdBy: actor.id,
  });
}

/** Replay first (before any lock), then again under the order lock. */
async function floorStep(
  db: Database,
  code: string,
  body: FloorStepBody,
  step: (tx: Tx, draftId: string) => Promise<SteppedProductionOrder>,
): Promise<SteppedProductionOrder> {
  const draftId = draftIdOf(body);
  const early = await replayOf(db, code, draftId);
  if (early) return early;
  try {
    return await db.transaction(async (tx) => {
      await lockProductionOrder(tx, code);
      const late = await replayOf(tx, code, draftId);
      if (late) return late;
      return step(tx, draftId);
    });
  } catch (error: unknown) {
    // The id was spent on another order: a copied draft, never a resend.
    if (isUniqueViolation(error)) {
      throw new ServiceFailure(conflict(FLOOR_MESSAGES.draftUsed));
    }
    throw error;
  }
}

/** Nhận lệnh: nothing moves, the materials are at the workshop already. */
export function receiveProductionOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: FloorStepBody,
): Promise<ServiceResult<SteppedProductionOrder>> {
  return runProduction(async () =>
    ok(
      await floorStep(db, code, body, async (tx, draftId) => {
        const current = await lockProductionOrder(tx, code);
        const next = stepOf(current, "receive");
        assertFresh(current, body.updatedAt);
        const updatedAt = new Date();
        await tx
          .update(productionOrder)
          .set({
            status: next,
            receivedBy: actor.id,
            receivedAt: updatedAt,
            updatedAt,
          })
          .where(eq(productionOrder.id, current.id));
        await remember(tx, actor, current.id, "RECEIVE", draftId);
        const view = await productionView(tx, current.id);
        await logActivity(tx, actor, {
          action: "RECEIVE",
          document: { type: "PRODUCTION_ORDER", id: current.id, code },
          summary: `${view.workshop} nhận lệnh`,
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
    throw new ProductionFieldError(FLOOR_MESSAGES.quantity, field);
  }
}

interface LoadedFloor {
  lines: (FloorLine & { lineId: string; unit: FloorOrderLine["unit"] })[];
}

/** The order lines with what the phone sent, checked. */
async function loadFloor(
  tx: Tx,
  orderId: string,
  body: FloorReportBody,
): Promise<LoadedFloor> {
  const stored = await tx
    .select({
      id: productionOrderLine.id,
      itemId: productionOrderLine.itemId,
      code: item.code,
      unit: item.unit,
    })
    .from(productionOrderLine)
    .innerJoin(item, eq(item.id, productionOrderLine.itemId))
    .where(eq(productionOrderLine.orderId, orderId))
    .orderBy(asc(productionOrderLine.position));
  const raw = body.lines ?? [];
  const materialIds = [
    ...new Set(
      raw
        .flatMap((line) =>
          (line.materials ?? []).map((material) => material.itemId ?? ""),
        )
        .filter((id) => UUID.test(id)),
    ),
  ];
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
  const sent: FloorLine[] = raw.map((line, index) => ({
    itemId: line.itemId ?? "",
    finishedMilli: readMilli(line.finished, `lines.${index}.finished`),
    offcutMilli: readMilli(line.offcutKg, `lines.${index}.offcutKg`),
    materials: (line.materials ?? []).map((material, at) => {
      const field = `lines.${index}.materials.${at}.itemId`;
      const found = byId.get(material.itemId ?? "");
      if (!found) {
        throw new ProductionFieldError(FLOOR_MESSAGES.materialMissing, field);
      }
      const category = found.category as ItemCategory;
      // Category first: the kind of item is the mistake worth naming.
      if (category === "MATERIAL" && found.status !== "ACTIVE") {
        throw new ProductionFieldError(
          BOM_MESSAGES.materialArchived(found.code),
          field,
        );
      }
      return {
        itemId: found.id,
        itemCode: found.code,
        unit: unitFromDb(found.unit),
        category,
        quantityMilli: readMilli(
          material.quantity,
          `lines.${index}.materials.${at}.quantity`,
        ),
      };
    }),
  }));
  const orderLines: FloorOrderLine[] = stored.map((line) => ({
    itemId: line.itemId,
    itemCode: line.code,
    unit: unitFromDb(line.unit),
  }));
  checkFloorReport(orderLines, sent);
  return {
    lines: stored.flatMap((line) => {
      const found = sent.find((entry) => entry.itemId === line.itemId);
      return found
        ? [{ ...found, lineId: line.id, unit: unitFromDb(line.unit) }]
        : [];
    }),
  };
}

const dbText = (milli: number, unit: FloorOrderLine["unit"]) =>
  quantityToDb(toQuantity(milli, unit));

/** Materials of one line: rows in the norm stay, even at 0; extras go at 0. */
async function writeMaterials(
  tx: Tx,
  line: LoadedFloor["lines"][number],
  mode: "report" | "count",
): Promise<void> {
  const rows = await tx
    .select({
      id: productionOrderMaterial.id,
      itemId: productionOrderMaterial.itemId,
      norm: productionOrderMaterial.normPerUnit,
      reported: productionOrderMaterial.reportedQuantity,
    })
    .from(productionOrderMaterial)
    .where(eq(productionOrderMaterial.lineId, line.lineId));
  const sent = new Map(line.materials.map((m) => [m.itemId, m]));
  const column = mode === "report" ? "reportedQuantity" : "quantity";
  for (const row of rows) {
    const material = sent.get(row.itemId);
    const milli = material?.quantityMilli ?? 0;
    const keep =
      milli > 0 ||
      row.norm !== null ||
      (mode === "count" && row.reported !== null);
    if (!keep) {
      await tx
        .delete(productionOrderMaterial)
        .where(eq(productionOrderMaterial.id, row.id));
      continue;
    }
    await tx
      .update(productionOrderMaterial)
      .set({ [column]: dbText(milli, material?.unit ?? "KG") })
      .where(eq(productionOrderMaterial.id, row.id));
  }
  const known = new Set(rows.map((row) => row.itemId));
  const added = line.materials.filter(
    (material) => !known.has(material.itemId) && material.quantityMilli > 0,
  );
  if (added.length > 0) {
    await tx.insert(productionOrderMaterial).values(
      added.map((material) => ({
        lineId: line.lineId,
        itemId: material.itemId,
        [column]: dbText(material.quantityMilli, material.unit),
      })),
    );
  }
}

async function writeFloor(
  tx: Tx,
  floor: LoadedFloor,
  mode: "report" | "count",
): Promise<number> {
  let materials = 0;
  for (const line of floor.lines) {
    const finished = dbText(line.finishedMilli, line.unit);
    const offcut = dbText(line.offcutMilli, "KG");
    await tx
      .update(productionOrderLine)
      .set(
        mode === "report"
          ? { reportedFinished: finished, reportedOffcutKg: offcut }
          : { quantityFinished: finished, offcutKg: offcut },
      )
      .where(eq(productionOrderLine.id, line.lineId));
    await writeMaterials(tx, line, mode);
    materials += line.materials.filter((m) => m.quantityMilli > 0).length;
  }
  return materials;
}

/** Báo làm xong: the numbers reach the server only now. */
export function reportProductionOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: FloorReportBody,
): Promise<ServiceResult<SteppedProductionOrder>> {
  return runProduction(async () =>
    ok(
      await floorStep(db, code, body, async (tx, draftId) => {
        const current = await lockProductionOrder(tx, code);
        const next = stepOf(current, "report");
        assertFresh(current, body.updatedAt);
        const floor = await loadFloor(tx, current.id, body);
        const materials = await writeFloor(tx, floor, "report");
        const updatedAt = new Date();
        await tx
          .update(productionOrder)
          .set({
            status: next,
            reportedBy: actor.id,
            reportedAt: updatedAt,
            updatedAt,
          })
          .where(eq(productionOrder.id, current.id));
        await remember(tx, actor, current.id, "REPORT", draftId);
        await logActivity(tx, actor, {
          action: "REPORT",
          document: { type: "PRODUCTION_ORDER", id: current.id, code },
          summary: reportSummary(
            await productionView(tx, current.id),
            materials,
          ),
        });
        return { code, status: next, updatedAt };
      }),
    ),
  );
}

/** Đếm xong: the numbers posted; overuse goes to the director first. */
export function countProductionOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: FloorReportBody,
): Promise<ServiceResult<SteppedProductionOrder>> {
  return runProduction(async () =>
    ok(
      await floorStep(db, code, body, async (tx, draftId) => {
        const current = await lockProductionOrder(tx, code);
        stepOf(current, "count");
        assertFresh(current, body.updatedAt);
        const floor = await loadFloor(tx, current.id, body);
        await writeFloor(tx, floor, "count");
        const next = stepOf(current, "count", {
          overuse: hasOveruse(await readPostingLines(tx, current.id)),
        });
        const updatedAt = new Date();
        await tx
          .update(productionOrder)
          .set({
            status: next,
            countedBy: actor.id,
            countedAt: updatedAt,
            updatedAt,
          })
          .where(eq(productionOrder.id, current.id));
        await remember(tx, actor, current.id, "COUNT", draftId);
        await logActivity(tx, actor, {
          action: "COUNT",
          document: { type: "PRODUCTION_ORDER", id: current.id, code },
          summary: countSummary(await productionView(tx, current.id)),
        });
        return { code, status: next, updatedAt };
      }),
    ),
  );
}

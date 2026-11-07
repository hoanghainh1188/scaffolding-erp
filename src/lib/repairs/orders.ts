// Repair slips (simple-repair spec repair-orders, design D2, D5, D7):
// drafts are kept on the server; "Ghi sổ kho" prices every line from the
// averages read under lock and posts it in one transaction.
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import { item, location, repairOrder, repairOrderLine } from "@/db/schema";
import {
  isBusinessDate,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { DomainValueError } from "@/domain/errors";
import { toMoney, type Money } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  quantityFromDb,
  quantityToDb,
  toQuantity,
} from "@/domain/quantity";
import { unconfirmedAnomalies } from "@/domain/receipt-anomalies";
import {
  REPAIRED_BY_MAX,
  REPAIR_DOCUMENT_TYPE,
  REPAIR_MESSAGES,
  REPAIR_NOTE_MAX,
  REPAIR_PREFIX,
  RepairFieldError,
  assertRepairDate,
  checkRepairLines,
  costRepairLine,
  repairAnomalies,
  repairPostedNote,
  repairPostingLines,
  type PostingLine,
  type RepairLineInput,
} from "@/domain/repair-order";
import { WorkOrderStateError } from "@/domain/repair-work-order";
import {
  conflict,
  notFound,
  ok,
  optionalText,
  ServiceFailure,
  type Actor,
  type ServiceResult,
} from "@/lib/catalog/common";
import { changeSummary, countText } from "@/domain/activity-summary";
import { logActivity } from "@/lib/activity/log";
import { nextDocumentCode } from "@/lib/inventory/counter";
import { unitFromDb } from "@/lib/inventory/unit";
import {
  POST_MESSAGES,
  lockForPosting,
  pairKey,
  postMovements,
  type Tx,
} from "@/lib/inventory/post";
import { currentScrapPrice } from "@/lib/receiving/scrap-price";

import {
  draftSummary,
  postedSummary,
  repairChanges,
  repairView,
} from "./activity";

export const REPAIR_SERVICE_MESSAGES = {
  frozen: "Phiếu đã ghi sổ, không sửa hay xóa được",
  alreadyPosted: "Phiếu đã được ghi sổ",
  stale: "Phiếu vừa được người khác sửa, tải lại trang",
  itemMissing: "Không tìm thấy vật tư",
  itemArchived: (code: string) => `Vật tư ${code} đã ngừng dùng`,
  quantity: "Số lượng không hợp lệ",
  repairDate: "Chọn ngày sửa xong",
  fromLocation: "Chỉ lấy hàng sửa tại bãi hoặc xưởng",
  toLocation: "Chỉ nhập hàng sửa về bãi hoặc xưởng",
  noYard: "Chưa có bãi đang dùng",
  workOrder: "Đây là lệnh sửa chữa, mở lệnh để làm tiếp",
} as const;

export interface RepairLineBody {
  itemId?: string;
  /** "40": whole pieces as text, like every quantity field. */
  quantityTaken?: string;
  quantityGood?: string;
  quantityScrap?: string;
  repairCost?: number;
}

export interface RepairBody {
  repairDate?: string;
  repairedBy?: string | null;
  note?: string | null;
  fromLocationId?: string;
  toLocationId?: string;
  lines?: RepairLineBody[];
  /** The slip's updatedAt the form was opened with (edits only). */
  updatedAt?: string;
}

/** What the form needs to keep editing a draft it just saved. */
export interface SavedRepair {
  code: string;
  updatedAt: Date;
}

export interface PostBody {
  confirmedOverrides?: string[];
  /** The draft the user looked at; posting a newer one answers 409. */
  updatedAt?: string;
}

/** Field errors answer 422, other rule breaks 400, conflicts 409. */
export async function runRepair<T>(
  body: () => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  try {
    return await body();
  } catch (error: unknown) {
    if (error instanceof ServiceFailure) return error.result;
    if (error instanceof WorkOrderStateError) {
      return { ok: false, status: 409, error: error.message };
    }
    if (error instanceof RepairFieldError) {
      return {
        ok: false,
        status: 422,
        error: error.message,
        field: error.field,
      };
    }
    if (error instanceof DomainValueError) {
      return { ok: false, status: 400, error: error.message };
    }
    throw error;
  }
}

const today = () => toBusinessDate(new Date());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The default place of a new slip: the active yard with the lowest code. */
export async function defaultRepairLocation(
  db: Database | Tx,
): Promise<{ id: string; code: string; name: string } | null> {
  const [row] = await db
    .select({ id: location.id, code: location.code, name: location.name })
    .from(location)
    .where(and(eq(location.type, "YARD"), eq(location.status, "ACTIVE")))
    .orderBy(asc(location.code))
    .limit(1);
  return row ?? null;
}

async function checkPlace(
  tx: Tx,
  id: string | undefined,
  field: "fromLocationId" | "toLocationId",
): Promise<string> {
  const message =
    field === "fromLocationId"
      ? REPAIR_SERVICE_MESSAGES.fromLocation
      : REPAIR_SERVICE_MESSAGES.toLocation;
  if (!id || !UUID.test(id)) throw new RepairFieldError(message, field);
  const [row] = await tx
    .select({ type: location.type, status: location.status })
    .from(location)
    .where(eq(location.id, id))
    .for("share");
  if (!row || row.status !== "ACTIVE" || row.type === "SITE") {
    throw new RepairFieldError(message, field);
  }
  return id;
}

function readQuantity(value: string | undefined, field: string): number {
  try {
    return quantityFromDb((value ?? "").trim(), "KG").milli;
  } catch {
    throw new RepairFieldError(REPAIR_SERVICE_MESSAGES.quantity, field);
  }
}

interface CheckedSlip {
  repairDate: BusinessDate;
  repairedBy: string | null;
  note: string | null;
  fromLocationId: string;
  toLocationId: string;
  lines: RepairLineInput[];
}

/** Text fields, places and every line rule against the catalog. */
async function checkSlip(
  tx: Tx,
  body: RepairBody,
  now: BusinessDate,
): Promise<CheckedSlip> {
  const repairDate = body.repairDate ?? "";
  if (!isBusinessDate(repairDate)) {
    throw new RepairFieldError(
      REPAIR_SERVICE_MESSAGES.repairDate,
      "repairDate",
    );
  }
  assertRepairDate(repairDate, now);
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
    throw new DomainValueError(REPAIR_SERVICE_MESSAGES.itemMissing);
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
    if (!found) throw new DomainValueError(REPAIR_SERVICE_MESSAGES.itemMissing);
    if (found.status !== "ACTIVE") {
      throw new ServiceFailure(
        conflict(REPAIR_SERVICE_MESSAGES.itemArchived(found.code)),
      );
    }
    return {
      itemId: found.id,
      itemCode: found.code,
      unit: unitFromDb(found.unit),
      takenMilli: readQuantity(
        line.quantityTaken,
        `lines.${index}.quantityTaken`,
      ),
      goodMilli: readQuantity(line.quantityGood, `lines.${index}.quantityGood`),
      scrapMilli: readQuantity(
        line.quantityScrap,
        `lines.${index}.quantityScrap`,
      ),
      repairCost: line.repairCost ?? 0,
    };
  });
  checkRepairLines(lines);
  // Items before places: the lock order every posting uses (design D2).
  const fromLocationId = await checkPlace(
    tx,
    body.fromLocationId,
    "fromLocationId",
  );
  const toLocationId = await checkPlace(tx, body.toLocationId, "toLocationId");
  return { repairDate, repairedBy, note, fromLocationId, toLocationId, lines };
}

async function writeLines(
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
      quantityGood: quantityToDb(toQuantity(line.goodMilli, line.unit)),
      quantityScrap: quantityToDb(toQuantity(line.scrapMilli, line.unit)),
      repairCost: line.repairCost,
    })),
  );
}

/** Locks the slip by code; throws 404 when it is missing. */
export async function lockSlip(tx: Tx, code: string) {
  const [row] = await tx
    .select()
    .from(repairOrder)
    .where(eq(repairOrder.code, code))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return row;
}

export function createRepairDraft(
  db: Database,
  actor: Actor,
  body: RepairBody,
  now: BusinessDate = today(),
): Promise<ServiceResult<SavedRepair>> {
  return runRepair(async () => {
    const saved = await db.transaction(async (tx) => {
      const checked = await checkSlip(tx, body, now);
      const next = await nextDocumentCode(
        tx,
        REPAIR_PREFIX,
        Number(now.slice(0, 4)),
      );
      const [row] = await tx
        .insert(repairOrder)
        .values({
          code: next,
          repairDate: checked.repairDate,
          repairedBy: checked.repairedBy,
          note: checked.note,
          fromLocationId: checked.fromLocationId,
          toLocationId: checked.toLocationId,
          createdBy: actor.id,
        })
        .returning({ id: repairOrder.id, updatedAt: repairOrder.updatedAt });
      const id = row?.id ?? "";
      await writeLines(tx, id, checked.lines);
      await logActivity(tx, actor, {
        action: "CREATE",
        document: { type: "REPAIR_ORDER", id, code: next },
        summary: draftSummary(await repairView(tx, id)),
      });
      return { code: next, updatedAt: row?.updatedAt ?? new Date() };
    });
    return ok(saved);
  });
}

export function updateRepairDraft(
  db: Database,
  actor: Actor,
  code: string,
  body: RepairBody,
  now: BusinessDate = today(),
): Promise<ServiceResult<SavedRepair>> {
  return runRepair(async () => {
    const updatedAt = new Date();
    await db.transaction(async (tx) => {
      const current = await lockSlip(tx, code);
      if (current.kind !== "SIMPLE") {
        throw new ServiceFailure(conflict(REPAIR_SERVICE_MESSAGES.workOrder));
      }
      if (current.status !== "DRAFT") {
        throw new ServiceFailure(conflict(REPAIR_SERVICE_MESSAGES.frozen));
      }
      const seen = body.updatedAt ? new Date(body.updatedAt).getTime() : NaN;
      if (seen !== current.updatedAt.getTime()) {
        throw new ServiceFailure(conflict(REPAIR_SERVICE_MESSAGES.stale));
      }
      const checked = await checkSlip(tx, body, now);
      const before = await repairView(tx, current.id);
      await tx
        .update(repairOrder)
        .set({
          repairDate: checked.repairDate,
          repairedBy: checked.repairedBy,
          note: checked.note,
          fromLocationId: checked.fromLocationId,
          toLocationId: checked.toLocationId,
          updatedAt,
        })
        .where(eq(repairOrder.id, current.id));
      await writeLines(tx, current.id, checked.lines);
      const changes = repairChanges(before, await repairView(tx, current.id));
      await logActivity(tx, actor, {
        action: "UPDATE",
        document: { type: "REPAIR_ORDER", id: current.id, code },
        summary: changeSummary(changes),
        changes,
      });
    });
    return ok({ code, updatedAt });
  });
}

export function deleteRepairDraft(
  db: Database,
  actor: Actor,
  code: string,
): Promise<ServiceResult<null>> {
  return runRepair(async () => {
    await db.transaction(async (tx) => {
      const current = await lockSlip(tx, code);
      if (current.kind !== "SIMPLE") {
        throw new ServiceFailure(conflict(REPAIR_SERVICE_MESSAGES.workOrder));
      }
      if (current.status !== "DRAFT") {
        throw new ServiceFailure(conflict(REPAIR_SERVICE_MESSAGES.frozen));
      }
      const draft = await repairView(tx, current.id);
      await tx.delete(repairOrder).where(eq(repairOrder.id, current.id));
      await logActivity(tx, actor, {
        action: "DELETE_DRAFT",
        document: { type: "REPAIR_ORDER", id: current.id, code },
        summary: `Nháp có ${countText(draft.lines.length, "mã hàng")}, chưa ghi sổ`,
      });
    });
    return ok(null);
  });
}

async function storedLines(tx: Tx, orderId: string) {
  const rows = await tx
    .select({
      id: repairOrderLine.id,
      itemId: repairOrderLine.itemId,
      itemCode: item.code,
      unit: item.unit,
      taken: repairOrderLine.quantityTaken,
      good: repairOrderLine.quantityGood,
      scrap: repairOrderLine.quantityScrap,
      repairCost: repairOrderLine.repairCost,
    })
    .from(repairOrderLine)
    .innerJoin(item, eq(item.id, repairOrderLine.itemId))
    .where(eq(repairOrderLine.orderId, orderId))
    .orderBy(asc(repairOrderLine.position));
  return rows.map((row) => ({
    id: row.id,
    itemId: row.itemId,
    itemCode: row.itemCode,
    unit: unitFromDb(row.unit),
    takenMilli: quantityFromDb(row.taken, "KG").milli,
    goodMilli: quantityFromDb(row.good, "KG").milli,
    scrapMilli: quantityFromDb(row.scrap, "KG").milli,
    repairCost: row.repairCost,
  }));
}

export interface PostedRepair {
  code: string;
  postingId: string;
}

/**
 * "Ghi sổ kho" (design D2, D7): lock the slip, then items, places and cost
 * pools in the shared order, price the lines from what was read, check the
 * cost questions, post, and freeze the slip. All or nothing.
 */
export function postRepairOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: PostBody = {},
  now: BusinessDate = today(),
): Promise<ServiceResult<PostedRepair>> {
  return runRepair(async () => {
    const posted = await db.transaction(async (tx) => {
      const slip = await lockSlip(tx, code);
      if (slip.kind !== "SIMPLE") {
        throw new ServiceFailure(conflict(REPAIR_SERVICE_MESSAGES.workOrder));
      }
      if (slip.status !== "DRAFT") {
        throw new ServiceFailure(
          conflict(REPAIR_SERVICE_MESSAGES.alreadyPosted),
        );
      }
      if (
        body.updatedAt !== undefined &&
        new Date(body.updatedAt).getTime() !== slip.updatedAt.getTime()
      ) {
        throw new ServiceFailure(conflict(REPAIR_SERVICE_MESSAGES.stale));
      }
      const lines = await storedLines(tx, slip.id);
      checkRepairLines(lines);
      const locks = await lockForPosting(tx, {
        itemIds: lines.map((line) => line.itemId),
        locationIds: [slip.fromLocationId, slip.toLocationId],
        pairs: lines.flatMap((line) => [
          { itemId: line.itemId, condition: "NEEDS_REPAIR" as const },
          ...(line.goodMilli > 0
            ? [{ itemId: line.itemId, condition: "GOOD" as const }]
            : []),
          ...(line.scrapMilli > 0
            ? [{ itemId: line.itemId, condition: "SCRAP" as const }]
            : []),
        ]),
      });
      const hasScrap = lines.some((line) => line.scrapMilli > 0);
      const price = hasScrap ? await currentScrapPrice(tx) : null;
      const scrapPricePerKg: Money | null = price
        ? toMoney(price.pricePerKg)
        : null;

      const pool = (itemId: string, condition: string) =>
        locks.pools.get(pairKey(itemId, condition));
      const priced: (PostingLine & { orderLineId: string })[] = lines.map(
        (line) => {
          const needsRepairAvg = pool(line.itemId, "NEEDS_REPAIR")?.avgCost;
          if (needsRepairAvg == null) {
            throw new ServiceFailure(
              conflict(
                POST_MESSAGES.shortage(
                  line.itemCode,
                  "NEEDS_REPAIR",
                  locks.places.get(slip.fromLocationId) ?? "",
                  `0 ${QUANTITY_UNIT_LABELS[line.unit]}`,
                ),
              ),
            );
          }
          return {
            orderLineId: line.id,
            itemId: line.itemId,
            itemCode: line.itemCode,
            takenMilli: line.takenMilli,
            goodMilli: line.goodMilli,
            scrapMilli: line.scrapMilli,
            cost: costRepairLine(line, {
              needsRepairAvg,
              standardWeightKg:
                locks.items.get(line.itemId)?.standardWeightKg ?? null,
              scrapPricePerKg,
            }),
          };
        },
      );

      const anomalies = repairAnomalies(
        lines.map((line) => ({
          itemCode: line.itemCode,
          goodMilli: line.goodMilli,
          repairCost: line.repairCost,
          goodAvg:
            line.goodMilli > 0
              ? (pool(line.itemId, "GOOD")?.avgCost ?? null)
              : null,
        })),
      );
      const confirmedKeys = body.confirmedOverrides ?? [];
      const [missing] = unconfirmedAnomalies(anomalies, confirmedKeys);
      if (missing) throw new RepairFieldError(missing.question, missing.field);

      const { postingId } = await postMovements(
        tx,
        actor,
        {
          documentType: REPAIR_DOCUMENT_TYPE,
          documentId: slip.id,
          documentCode: slip.code,
          businessDate: now,
          lines: repairPostingLines(slip.code, priced, {
            fromLocationId: slip.fromLocationId,
            toLocationId: slip.toLocationId,
          }),
        },
        now,
      );

      // Lines first: the slip is still a draft, so the freeze trigger lets
      // them through.
      for (const line of priced) {
        await tx
          .update(repairOrderLine)
          .set({ lossAmount: line.cost.loss })
          .where(eq(repairOrderLine.id, line.orderLineId));
      }
      const postedAt = new Date();
      const confirmed = anomalies.filter((anomaly) =>
        confirmedKeys.includes(anomaly.key),
      );
      await tx
        .update(repairOrder)
        .set({
          status: "POSTED",
          postedBy: actor.id,
          postedAt,
          postingId,
          scrapPriceUsed: scrapPricePerKg,
          confirmedNote: repairPostedNote(slip.code, confirmed),
          updatedAt: postedAt,
        })
        .where(eq(repairOrder.id, slip.id));
      await logActivity(tx, actor, {
        action: "POST",
        document: { type: "REPAIR_ORDER", id: slip.id, code: slip.code },
        summary: postedSummary(
          await repairView(tx, slip.id),
          confirmed.length > 0
            ? `đã xác nhận ${confirmed.map((anomaly) => anomaly.note).join("; ")}`
            : null,
        ),
        anomaly: confirmed.length > 0,
      });
      return { code: slip.code, postingId };
    });
    return ok(posted);
  });
}

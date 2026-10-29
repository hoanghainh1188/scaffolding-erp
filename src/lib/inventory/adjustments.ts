// Adjustment and opening-balance documents (inventory-ledger spec
// stock-adjustments, design D7, D8). Nothing reaches the ledger until the
// director approves; approving posts every line in the same transaction.
import { and, asc, eq, inArray, ne } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  changeSummary,
  countText,
  joinParts,
  reasonSummary,
} from "@/domain/activity-summary";
import { logActivity } from "@/lib/activity/log";
import {
  inventoryLedger,
  item,
  location,
  stockAdjustment,
  stockAdjustmentLine,
} from "@/db/schema";
import {
  isBusinessDate,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { CONDITION_LABELS, type Condition } from "@/domain/condition";
import { DomainValueError } from "@/domain/errors";
import { quantityFromDb, quantityToDb, toQuantity } from "@/domain/quantity";
import {
  ADJUSTMENT_KINDS,
  ADJUSTMENT_MESSAGES,
  ADJUSTMENT_PREFIX,
  adjustmentMovements,
  assertAdjustmentLine,
  assertOpeningDate,
  normalizeReason,
  type AdjustmentKind,
  type AdjustmentLineInput,
  type AdjustmentLineType,
} from "@/domain/stock-adjustment";
import {
  assertValueDelta,
  assertValueLines,
  REVALUE_MESSAGES,
  revaluationMovements,
  signedMoney,
  type ValueLine,
} from "@/domain/stock-revaluation";
import {
  conflict,
  notFound,
  ok,
  optionalText,
  runService,
  ServiceFailure,
  type Actor,
  type ServiceResult,
} from "@/lib/catalog/common";

import { nextDocumentCode } from "./counter";
import { postMovements, type Tx } from "./post";
import {
  assertValueLinesAgainstLedger,
  buildTripRevaluation,
  sameValueLines,
} from "./revaluations";
import {
  adjustmentChanges,
  adjustmentSummary,
  adjustmentView,
} from "./activity";

export {
  ADJUSTMENT_STATUS_LABELS,
  getAdjustment,
  listAdjustments,
  type AdjustmentDetail,
  type AdjustmentLineRow,
  type AdjustmentStatus,
  type AdjustmentSummary,
  type PostedRow,
} from "./adjustment-queries";
import { getAdjustment, type AdjustmentDetail } from "./adjustment-queries";

export const ADJUSTMENT_SERVICE_MESSAGES = {
  notDraft: "Chỉ sửa hoặc xóa được phiếu nháp",
  notPending: "Phiếu chưa gửi duyệt",
  alreadyPosted: "Phiếu đã được ghi sổ",
  itemMissing: "Không tìm thấy vật tư",
  locationMissing: "Không tìm thấy vị trí",
  itemArchived: (code: string) => `Vật tư ${code} đã ngừng dùng`,
  locationArchived: (code: string) => `Vị trí ${code} đã ngừng dùng`,
  openingTaken: (code: string, condition: Condition) =>
    `${code} ${CONDITION_LABELS[condition]} đã có biến động, dùng phiếu điều chỉnh`,
  kind: "Chọn loại phiếu",
  relatedTooLong: "Mã chứng từ dài tối đa 40 ký tự",
  stale: "Phiếu vừa được người khác sửa, tải lại rồi làm lại",
  tripLinesFixed:
    "Phiếu sửa chi phí chuyến chỉ đổi được chi phí chuyến đúng và lý do",
  tooManyLines: "Phiếu tối đa 200 dòng",
} as const;

const MAX_LINES = 200;

export interface AdjustmentLineBody {
  lineType?: string;
  itemId?: string;
  condition?: string;
  toCondition?: string | null;
  locationId?: string;
  toLocationId?: string | null;
  /** "10", "-5", "12850.5" (numeric(14,3) text). */
  quantity?: string;
  unitCost?: number | null;
  /** Signed change of value in đồng (REVALUE documents). */
  valueDelta?: number | null;
}

export interface AdjustmentBody {
  kind?: string;
  reason?: string;
  relatedDocumentCode?: string | null;
  openingDate?: string | null;
  lines?: AdjustmentLineBody[];
  /** The updatedAt the form was loaded with; a mismatch answers 409. */
  updatedAt?: string | null;
}

// --------------------------------------------------------------- writing

function parseKind(value: string | undefined): AdjustmentKind {
  if (!(ADJUSTMENT_KINDS as readonly string[]).includes(value ?? "")) {
    throw new DomainValueError(ADJUSTMENT_SERVICE_MESSAGES.kind);
  }
  return value as AdjustmentKind;
}

interface CheckedDocument {
  reason: string;
  relatedDocumentCode: string | null;
  openingDate: BusinessDate | null;
  lines: AdjustmentLineInput[];
}

/**
 * Validates a body against the catalog: active items and locations, whole
 * pieces, the line rules of the kind and, for openings, that the pair has
 * no other movement yet.
 */
async function checkDocument(
  tx: Tx,
  kind: AdjustmentKind,
  body: AdjustmentBody,
  today: BusinessDate,
): Promise<CheckedDocument> {
  const reason = normalizeReason(body.reason);
  const related = optionalText(body.relatedDocumentCode);
  if (related && related.length > 40) {
    throw new DomainValueError(ADJUSTMENT_SERVICE_MESSAGES.relatedTooLong);
  }
  if (kind === "REVALUE") {
    if (!related) throw new DomainValueError(REVALUE_MESSAGES.relatedMissing);
    const lines = await checkValueLines(tx, related, body.lines ?? []);
    return { reason, relatedDocumentCode: related, openingDate: null, lines };
  }
  const openingDate =
    kind === "OPENING"
      ? assertOpeningDate(
          body.openingDate && isBusinessDate(body.openingDate)
            ? body.openingDate
            : null,
          today,
        )
      : null;
  const raw = body.lines ?? [];
  if (raw.length > MAX_LINES) {
    throw new DomainValueError(ADJUSTMENT_SERVICE_MESSAGES.tooManyLines);
  }

  const itemIds = [...new Set(raw.map((l) => l.itemId ?? ""))];
  const locationIds = [
    ...new Set(raw.flatMap((l) => [l.locationId ?? "", l.toLocationId ?? ""])),
  ].filter(Boolean);
  const UUID = /^[0-9a-f-]{36}$/i;
  if (![...itemIds, ...locationIds].every((id) => UUID.test(id))) {
    throw new DomainValueError(
      itemIds.some((id) => !UUID.test(id))
        ? ADJUSTMENT_SERVICE_MESSAGES.itemMissing
        : ADJUSTMENT_SERVICE_MESSAGES.locationMissing,
    );
  }
  const items = itemIds.length
    ? await tx
        .select({
          id: item.id,
          code: item.code,
          unit: item.unit,
          status: item.status,
        })
        .from(item)
        .where(inArray(item.id, itemIds))
    : [];
  const places = locationIds.length
    ? await tx
        .select({
          id: location.id,
          code: location.code,
          status: location.status,
        })
        .from(location)
        .where(inArray(location.id, locationIds))
    : [];
  const itemById = new Map(items.map((row) => [row.id, row]));
  const placeById = new Map(places.map((row) => [row.id, row]));

  const lines = raw.map((line): AdjustmentLineInput => {
    const found = itemById.get(line.itemId ?? "");
    if (!found)
      throw new DomainValueError(ADJUSTMENT_SERVICE_MESSAGES.itemMissing);
    if (found.status !== "ACTIVE") {
      throw new ServiceFailure(
        conflict(ADJUSTMENT_SERVICE_MESSAGES.itemArchived(found.code)),
      );
    }
    for (const placeId of [line.locationId, line.toLocationId]) {
      if (!placeId) continue;
      const place = placeById.get(placeId);
      if (!place) {
        throw new DomainValueError(ADJUSTMENT_SERVICE_MESSAGES.locationMissing);
      }
      if (place.status !== "ACTIVE") {
        throw new ServiceFailure(
          conflict(ADJUSTMENT_SERVICE_MESSAGES.locationArchived(place.code)),
        );
      }
    }
    if (!line.locationId) {
      throw new DomainValueError(ADJUSTMENT_SERVICE_MESSAGES.locationMissing);
    }
    const unit = found.unit === "KG" ? "KG" : "PIECE";
    const checked: AdjustmentLineInput = {
      lineType: (line.lineType ?? "") as AdjustmentLineType,
      itemId: found.id,
      condition: (line.condition ?? "") as Condition,
      toCondition: (line.toCondition ?? null) as Condition | null,
      locationId: line.locationId,
      toLocationId: line.toLocationId ?? null,
      quantityMilli: quantityFromDb((line.quantity ?? "").trim(), unit).milli,
      unitCost: line.unitCost ?? null,
      valueDelta: null,
    };
    assertAdjustmentLine(kind, checked);
    return checked;
  });

  if (kind === "OPENING") await assertOpeningFree(tx, lines, itemById);
  return { reason, relatedDocumentCode: related, openingDate, lines };
}

const UUID_TEXT = /^[0-9a-f-]{36}$/i;

/** Item codes by id; refuses unknown and archived items. */
async function activeItemCodes(
  tx: Tx,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids)];
  if (!wanted.every((id) => UUID_TEXT.test(id))) {
    throw new DomainValueError(ADJUSTMENT_SERVICE_MESSAGES.itemMissing);
  }
  const rows = wanted.length
    ? await tx
        .select({ id: item.id, code: item.code, status: item.status })
        .from(item)
        .where(inArray(item.id, wanted))
    : [];
  const codes = new Map<string, string>();
  for (const row of rows) {
    if (row.status !== "ACTIVE") {
      throw new ServiceFailure(
        conflict(ADJUSTMENT_SERVICE_MESSAGES.itemArchived(row.code)),
      );
    }
    codes.set(row.id, row.code);
  }
  if (codes.size !== wanted.length) {
    throw new DomainValueError(ADJUSTMENT_SERVICE_MESSAGES.itemMissing);
  }
  return codes;
}

/**
 * Value lines (design D5): a whole non-zero change per (item + condition),
 * each pair once, held by the source document and priceable now.
 */
async function checkValueLines(
  tx: Tx,
  related: string,
  raw: readonly AdjustmentLineBody[],
): Promise<AdjustmentLineInput[]> {
  if (raw.length > MAX_LINES) {
    throw new DomainValueError(ADJUSTMENT_SERVICE_MESSAGES.tooManyLines);
  }
  const codes = await activeItemCodes(
    tx,
    raw.map((line) => line.itemId ?? ""),
  );
  const lines = raw.map((line): AdjustmentLineInput => {
    const checked: AdjustmentLineInput = {
      lineType: "VALUE",
      itemId: line.itemId ?? "",
      condition: (line.condition ?? "") as Condition,
      toCondition: null,
      locationId: null,
      toLocationId: null,
      quantityMilli: 0,
      unitCost: null,
      valueDelta: line.valueDelta ?? 0,
    };
    assertAdjustmentLine("REVALUE", checked);
    return checked;
  });
  const values = toValueLines(lines);
  const codeOf = (id: string) => codes.get(id) ?? "";
  assertValueLines(values, codeOf);
  await assertValueLinesAgainstLedger(tx, related, values, codeOf);
  return lines;
}

function toValueLines(lines: readonly AdjustmentLineInput[]): ValueLine[] {
  return lines.map((line) => ({
    itemId: line.itemId,
    condition: line.condition,
    valueDelta: assertValueDelta(line.valueDelta ?? 0),
  }));
}

/** An opening only for (item + condition) pairs with no other movement. */
async function assertOpeningFree(
  tx: Tx,
  lines: AdjustmentLineInput[],
  items: Map<string, { code: string }>,
): Promise<void> {
  for (const line of lines) {
    const [taken] = await tx
      .select({ id: inventoryLedger.id })
      .from(inventoryLedger)
      .where(
        and(
          eq(inventoryLedger.itemId, line.itemId),
          eq(inventoryLedger.condition, line.condition),
          ne(inventoryLedger.movement, "OPENING"),
        ),
      )
      .limit(1);
    if (taken) {
      throw new ServiceFailure(
        conflict(
          ADJUSTMENT_SERVICE_MESSAGES.openingTaken(
            items.get(line.itemId)?.code ?? "",
            line.condition,
          ),
        ),
      );
    }
  }
}

export async function writeLines(
  tx: Tx,
  adjustmentId: string,
  lines: AdjustmentLineInput[],
  units: Map<string, "PIECE" | "KG">,
): Promise<void> {
  await tx
    .delete(stockAdjustmentLine)
    .where(eq(stockAdjustmentLine.adjustmentId, adjustmentId));
  if (lines.length === 0) return;
  await tx.insert(stockAdjustmentLine).values(
    lines.map((line, index) => ({
      adjustmentId,
      lineNo: index + 1,
      lineType: line.lineType,
      itemId: line.itemId,
      condition: line.condition,
      toCondition: line.toCondition,
      locationId: line.locationId,
      toLocationId: line.toLocationId,
      quantity: quantityToDb(
        toQuantity(line.quantityMilli, units.get(line.itemId) ?? "KG"),
      ),
      unitCost: line.unitCost,
      valueDelta: line.valueDelta,
    })),
  );
}

export async function unitsOf(tx: Tx, lines: AdjustmentLineInput[]) {
  const ids = [...new Set(lines.map((line) => line.itemId))];
  if (ids.length === 0) return new Map<string, "PIECE" | "KG">();
  const rows = await tx
    .select({ id: item.id, unit: item.unit })
    .from(item)
    .where(inArray(item.id, ids));
  return new Map(rows.map((row) => [row.id, row.unit as "PIECE" | "KG"]));
}

const today = () => toBusinessDate(new Date());

/** Adjustments and opening balances are separate types in the log. */
export const docType = (kind: string) =>
  kind === "OPENING"
    ? ("OPENING_BALANCE" as const)
    : ("STOCK_ADJUSTMENT" as const);

export function createAdjustment(
  db: Database,
  actor: Actor,
  body: AdjustmentBody,
  now: BusinessDate = today(),
): Promise<ServiceResult<AdjustmentDetail>> {
  return runService(async () => {
    const kind = parseKind(body.kind);
    const id = await db.transaction(async (tx) => {
      const checked = await checkDocument(tx, kind, body, now);
      const code = await nextDocumentCode(
        tx,
        ADJUSTMENT_PREFIX[kind],
        Number(now.slice(0, 4)),
      );
      const [row] = await tx
        .insert(stockAdjustment)
        .values({
          code,
          kind,
          reason: checked.reason,
          relatedDocumentCode: checked.relatedDocumentCode,
          openingDate: checked.openingDate,
          createdBy: actor.id,
        })
        .returning({ id: stockAdjustment.id });
      const adjustmentId = row?.id ?? "";
      await writeLines(
        tx,
        adjustmentId,
        checked.lines,
        await unitsOf(tx, checked.lines),
      );
      await logActivity(tx, actor, {
        action: "CREATE",
        document: { type: docType(kind), id: adjustmentId, code },
        summary: adjustmentSummary(await adjustmentView(tx, adjustmentId)),
      });
      return adjustmentId;
    });
    const created = await getAdjustment(db, id);
    return created ? ok(created) : notFound();
  });
}

/** Locks the document; throws when it is missing. */
export async function lockAdjustment(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(stockAdjustment)
    .where(eq(stockAdjustment.id, id))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return row;
}

/** The form's updatedAt must still be the stored one (409 otherwise). */
export function assertFresh(
  stored: Date,
  sent: string | null | undefined,
): void {
  if (!sent) return;
  if (new Date(sent).getTime() !== stored.getTime()) {
    throw new ServiceFailure(conflict(ADJUSTMENT_SERVICE_MESSAGES.stale));
  }
}

export function requireDraft(status: string): void {
  if (status === "DONE") {
    throw new ServiceFailure(
      conflict(ADJUSTMENT_SERVICE_MESSAGES.alreadyPosted),
    );
  }
  if (status !== "DRAFT") {
    throw new ServiceFailure(conflict(ADJUSTMENT_SERVICE_MESSAGES.notDraft));
  }
}

export function updateAdjustment(
  db: Database,
  actor: Actor,
  id: string,
  body: AdjustmentBody,
  now: BusinessDate = today(),
): Promise<ServiceResult<AdjustmentDetail>> {
  return runService(async () => {
    await db.transaction(async (tx) => {
      const current = await lockAdjustment(tx, id);
      requireDraft(current.status);
      assertFresh(current.updatedAt, body.updatedAt);
      if (current.sourceReceiptId) {
        throw new ServiceFailure(
          conflict(ADJUSTMENT_SERVICE_MESSAGES.tripLinesFixed),
        );
      }
      const kind = current.kind as AdjustmentKind;
      const checked = await checkDocument(tx, kind, body, now);
      const before = await adjustmentView(tx, id);
      await tx
        .update(stockAdjustment)
        .set({
          reason: checked.reason,
          relatedDocumentCode: checked.relatedDocumentCode,
          openingDate: checked.openingDate,
          updatedAt: new Date(),
        })
        .where(eq(stockAdjustment.id, id));
      await writeLines(tx, id, checked.lines, await unitsOf(tx, checked.lines));
      const changes = adjustmentChanges(before, await adjustmentView(tx, id));
      await logActivity(tx, actor, {
        action: "UPDATE",
        document: { type: docType(current.kind), id, code: current.code },
        summary: changeSummary(changes),
        changes,
      });
    });
    const updated = await getAdjustment(db, id);
    return updated ? ok(updated) : notFound();
  });
}

export function deleteAdjustment(
  db: Database,
  actor: Actor,
  id: string,
): Promise<ServiceResult<null>> {
  return runService(async () => {
    await db.transaction(async (tx) => {
      const current = await lockAdjustment(tx, id);
      requireDraft(current.status);
      const draft = await adjustmentView(tx, id);
      await tx.delete(stockAdjustment).where(eq(stockAdjustment.id, id));
      await logActivity(tx, actor, {
        action: "DELETE_DRAFT",
        document: { type: docType(current.kind), id, code: current.code },
        summary: `Nháp: ${adjustmentSummary(draft)}`,
      });
    });
    return ok(null);
  });
}

async function storedLines(tx: Tx, id: string): Promise<AdjustmentLineInput[]> {
  const rows = await tx
    .select()
    .from(stockAdjustmentLine)
    .where(eq(stockAdjustmentLine.adjustmentId, id))
    .orderBy(asc(stockAdjustmentLine.lineNo));
  return rows.map((row) => ({
    lineType: row.lineType as AdjustmentLineType,
    itemId: row.itemId,
    condition: row.condition as Condition,
    toCondition: row.toCondition as Condition | null,
    locationId: row.locationId,
    toLocationId: row.toLocationId,
    quantityMilli: quantityFromDb(row.quantity, "KG").milli,
    unitCost: row.unitCost,
    valueDelta: row.valueDelta,
  }));
}

export function submitAdjustment(
  db: Database,
  actor: Actor,
  id: string,
): Promise<ServiceResult<AdjustmentDetail>> {
  return runService(async () => {
    await db.transaction(async (tx) => {
      const current = await lockAdjustment(tx, id);
      requireDraft(current.status);
      if ((await storedLines(tx, id)).length === 0) {
        throw new DomainValueError(ADJUSTMENT_MESSAGES.noLines);
      }
      await tx
        .update(stockAdjustment)
        .set({
          status: "PENDING_APPROVAL",
          submittedBy: actor.id,
          submittedAt: new Date(),
          returnedReason: null,
          updatedAt: new Date(),
        })
        .where(eq(stockAdjustment.id, id));
      await logActivity(tx, actor, {
        action: "SUBMIT",
        document: { type: docType(current.kind), id, code: current.code },
        summary: adjustmentSummary(await adjustmentView(tx, id)),
      });
    });
    const updated = await getAdjustment(db, id);
    return updated ? ok(updated) : notFound();
  });
}

function requirePending(status: string): void {
  if (status === "DONE") {
    throw new ServiceFailure(
      conflict(ADJUSTMENT_SERVICE_MESSAGES.alreadyPosted),
    );
  }
  if (status !== "PENDING_APPROVAL") {
    throw new ServiceFailure(conflict(ADJUSTMENT_SERVICE_MESSAGES.notPending));
  }
}

/** Approve = post: every line in the transaction that marks it DONE. */
export function approveAdjustment(
  db: Database,
  actor: Actor,
  id: string,
  now: BusinessDate = today(),
): Promise<ServiceResult<AdjustmentDetail>> {
  return runService(async () => {
    await db.transaction(async (tx) => {
      const current = await lockAdjustment(tx, id);
      requirePending(current.status);
      const kind = current.kind as AdjustmentKind;
      const lines = await storedLines(tx, id);
      if (kind === "REVALUE" && current.sourceReceiptId) {
        // Nothing booked on the trip may have moved since the lines were built.
        const rebuilt = await buildTripRevaluation(
          tx,
          current.sourceReceiptId,
          current.correctedTripCost ?? 0,
        );
        if (
          rebuilt.recordedCost !== current.recordedTripCost ||
          !sameValueLines(rebuilt.lines, toValueLines(lines))
        ) {
          throw new DomainValueError(
            REVALUE_MESSAGES.tripNotReproducible(rebuilt.receiptCode),
          );
        }
      }
      const drafts =
        kind === "REVALUE"
          ? revaluationMovements(
              current.relatedDocumentCode ?? "",
              toValueLines(lines),
            )
          : adjustmentMovements(current.code, current.reason, lines);
      const { postingId } = await postMovements(
        tx,
        actor,
        {
          documentType: kind,
          documentId: id,
          documentCode: current.code,
          businessDate:
            kind === "OPENING" ? (current.openingDate as BusinessDate) : now,
          lines: drafts,
        },
        now,
      );
      if (kind === "OPENING") {
        // After posting: the pairs are locked now, so this check is final.
        const codes = await tx
          .select({ id: item.id, code: item.code })
          .from(item)
          .where(inArray(item.id, [...new Set(lines.map((l) => l.itemId))]));
        await assertOpeningFree(
          tx,
          lines,
          new Map(codes.map((c) => [c.id, c])),
        );
      }
      await tx
        .update(stockAdjustment)
        .set({
          status: "DONE",
          postingId,
          approvedBy: actor.id,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(stockAdjustment.id, id));
      await logActivity(tx, actor, {
        action: "APPROVE",
        document: { type: docType(current.kind), id, code: current.code },
        summary:
          kind === "REVALUE"
            ? joinParts(
                `Sửa ${current.relatedDocumentCode ?? ""}`,
                `ghi sổ ${countText(drafts.length, "dòng")} điều chỉnh giá`,
                signedMoney(
                  lines.reduce((sum, l) => sum + (l.valueDelta ?? 0), 0),
                ),
              )
            : joinParts(
                `Ghi sổ ${countText(drafts.length, "dòng")}`,
                current.reason,
              ),
      });
    });
    const updated = await getAdjustment(db, id);
    return updated ? ok(updated) : notFound();
  });
}

/** Back to draft with the director's reason. */
export function returnAdjustment(
  db: Database,
  actor: Actor,
  id: string,
  reason: string | undefined,
): Promise<ServiceResult<AdjustmentDetail>> {
  return runService(async () => {
    const why = normalizeReason(reason, ADJUSTMENT_MESSAGES.returnReason);
    await db.transaction(async (tx) => {
      const current = await lockAdjustment(tx, id);
      requirePending(current.status);
      await tx
        .update(stockAdjustment)
        .set({
          status: "DRAFT",
          returnedReason: why,
          returnedBy: actor.id,
          returnedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(stockAdjustment.id, id));
      await logActivity(tx, actor, {
        action: "RETURN",
        document: { type: docType(current.kind), id, code: current.code },
        summary: reasonSummary(why),
      });
    });
    const updated = await getAdjustment(db, id);
    return updated ? ok(updated) : notFound();
  });
}

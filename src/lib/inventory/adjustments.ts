// Adjustment and opening-balance documents (inventory-ledger spec
// stock-adjustments, design D7, D8). Nothing reaches the ledger until the
// director approves; approving posts every line in the same transaction.
import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

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
  user,
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
  adjustmentChanges,
  adjustmentSummary,
  adjustmentView,
} from "./activity";

export type AdjustmentStatus = "DRAFT" | "PENDING_APPROVAL" | "DONE";

export const ADJUSTMENT_STATUS_LABELS: Readonly<
  Record<AdjustmentStatus, string>
> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  DONE: "Đã ghi sổ",
};

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
}

export interface AdjustmentBody {
  kind?: string;
  reason?: string;
  relatedDocumentCode?: string | null;
  openingDate?: string | null;
  lines?: AdjustmentLineBody[];
}

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
  locationId: string;
  locationCode: string;
  locationName: string;
  toLocationId: string | null;
  toLocationCode: string | null;
  toLocationName: string | null;
  /** Thousandths of the item's unit. */
  quantity: number;
  unitCost: number | null;
}

export interface PostedRow {
  id: number;
  movement: string;
  itemCode: string;
  condition: Condition;
  locationCode: string;
  quantity: number;
  unitCost: number;
  avgAfter: number;
}

export interface AdjustmentDetail extends AdjustmentSummary {
  returnedReason: string | null;
  createdBy: string;
  approvedByName: string | null;
  approvedAt: Date | null;
  submittedAt: Date | null;
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
    })
    .from(stockAdjustment)
    .innerJoin(creator, eq(creator.id, stockAdjustment.createdBy))
    .leftJoin(approver, eq(approver.id, stockAdjustment.approvedBy))
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
    })
    .from(stockAdjustmentLine)
    .innerJoin(item, eq(item.id, stockAdjustmentLine.itemId))
    .innerJoin(location, eq(location.id, stockAdjustmentLine.locationId))
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
          avgAfter: inventoryLedger.avgCostAfter,
        })
        .from(inventoryLedger)
        .innerJoin(item, eq(item.id, inventoryLedger.itemId))
        .innerJoin(location, eq(location.id, inventoryLedger.locationId))
        .where(eq(inventoryLedger.postingId, head.postingId))
        .orderBy(asc(inventoryLedger.id))
    : [];

  return {
    id: head.id,
    code: head.code,
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
    })),
    posted: posted.map((row) => ({
      ...row,
      condition: row.condition as Condition,
      quantity: quantityFromDb(row.quantity, "KG").milli,
    })),
  };
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
    };
    assertAdjustmentLine(kind, checked);
    return checked;
  });

  if (kind === "OPENING") await assertOpeningFree(tx, lines, itemById);
  return { reason, relatedDocumentCode: related, openingDate, lines };
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

async function writeLines(
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
    })),
  );
}

async function unitsOf(tx: Tx, lines: AdjustmentLineInput[]) {
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
const docType = (kind: string) =>
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
async function lockAdjustment(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(stockAdjustment)
    .where(eq(stockAdjustment.id, id))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return row;
}

function requireDraft(status: string): void {
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
      const drafts = adjustmentMovements(current.code, current.reason, lines);
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
        summary: joinParts(
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

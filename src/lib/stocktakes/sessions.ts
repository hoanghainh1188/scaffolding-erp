// Stocktake sessions (stocktake design D2-D4, D7-D10): start at a yard or
// workshop, take the phone's blind counts, compare them with the book at
// "Xong mã này", and post the differences when the director approves.
// Every command runs in one transaction that locks the session first.
import { and, asc, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  inventoryLedger,
  item,
  itemGroup,
  location,
  stocktake,
  stocktakeGroup,
  stocktakeLine,
} from "@/db/schema";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { CONDITIONS, type Condition } from "@/domain/condition";
import { DomainValueError } from "@/domain/errors";
import type { LocationType } from "@/domain/location-type";
import { can } from "@/domain/permissions";
import {
  quantityFromDb,
  quantityToDb,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import type { Role } from "@/domain/role";
import {
  ADJUSTMENT_MESSAGES,
  normalizeReason,
} from "@/domain/stock-adjustment";
import {
  adjustDeviceTime,
  assertCountableLocation,
  assertSubmission,
  STOCKTAKE_DOCUMENT_TYPE,
  STOCKTAKE_MESSAGES,
  STOCKTAKE_PREFIX,
  StocktakeFieldError,
  stocktakeFlags,
  stocktakeMovements,
  type StocktakeFlag,
  type StocktakeStatus,
  type SubmittedItem,
} from "@/domain/stocktake";
import {
  conflict,
  isUniqueViolation,
  notFound,
  ok,
  ServiceFailure,
  type Actor,
  type ServiceResult,
} from "@/lib/catalog/common";
import { nextDocumentCode } from "@/lib/inventory/counter";
import { postMovements, type Tx } from "@/lib/inventory/post";

export const STOCKTAKE_SERVICE_MESSAGES = {
  clientStartId: "Thiếu mã yêu cầu bắt đầu",
  submissionId: "Thiếu mã lần gửi",
  deviceNow: "Thiếu giờ trên máy",
  time: "Giờ đếm không hợp lệ",
  locationMissing: "Chọn bãi hoặc xưởng",
  locationArchived: (code: string) => `Vị trí ${code} đã ngừng dùng`,
  groupMissing: "Không tìm thấy nhóm hàng",
  groupsEmpty: "Chọn ít nhất một nhóm hàng",
  itemMissing: "Không tìm thấy vật tư",
  itemArchived: (code: string) => `Vật tư ${code} đã ngừng dùng`,
  quantity: "Số lượng không hợp lệ",
  condition: "Chọn tình trạng",
  tooManyItems: "Một lần gửi tối đa 500 mã",
  startOfOther: "Yêu cầu bắt đầu này thuộc người khác",
  lineMissing: "Không tìm thấy dòng kiểm kê",
  unitCost: "Đơn giá phải là số nguyên không âm",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** numeric(14,3): at most 11 whole digits. */
const DB_QUANTITY = /^\d{1,11}(\.\d{1,3})?$/;
const MAX_ITEMS = 500;

/** Field errors answer 422, other rule breaks 400, conflicts 409. */
async function run<T>(
  body: () => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  try {
    return await body();
  } catch (error: unknown) {
    if (error instanceof ServiceFailure) return error.result;
    if (error instanceof StocktakeFieldError) {
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

function requireUuid(value: unknown, message: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new DomainValueError(message);
  }
  return value;
}

function readTime(value: unknown, message: string): Date {
  const time = typeof value === "string" ? new Date(value) : null;
  if (!time || Number.isNaN(time.getTime())) {
    throw new DomainValueError(message);
  }
  return time;
}

const milliOf = (value: string | null) =>
  value === null ? null : quantityFromDb(value, "KG").milli;
const dbQuantity = (milli: number) => quantityToDb(toQuantity(milli, "KG"));

// ----------------------------------------------------------------- start

export interface StartBody {
  clientStartId?: unknown;
  locationId?: unknown;
  /** null: every item with stock. */
  groupIds?: unknown;
}

export interface StartedStocktake {
  code: string;
  lineCount: number;
  replayed: boolean;
}

async function replayStart(
  db: Pick<Database, "select">,
  actor: Actor,
  clientStartId: string,
): Promise<StartedStocktake | null> {
  const [row] = await db
    .select({
      id: stocktake.id,
      code: stocktake.code,
      startedBy: stocktake.startedBy,
      lineCount: sql<number>`(select count(*)::int from ${stocktakeLine} where ${stocktakeLine.stocktakeId} = ${stocktake.id})`,
    })
    .from(stocktake)
    .where(eq(stocktake.clientStartId, clientStartId));
  if (!row) return null;
  if (row.startedBy !== actor.id) {
    throw new ServiceFailure(conflict(STOCKTAKE_SERVICE_MESSAGES.startOfOther));
  }
  return { code: row.code, lineCount: row.lineCount, replayed: true };
}

/** The open session of a place, if any (design D4). */
export async function openSessionAt(
  db: Pick<Database, "select">,
  locationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ code: stocktake.code })
    .from(stocktake)
    .where(
      and(
        eq(stocktake.locationId, locationId),
        inArray(stocktake.status, ["COUNTING", "SUBMITTED"]),
      ),
    );
  return row?.code ?? null;
}

function readGroups(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) {
    throw new DomainValueError(STOCKTAKE_SERVICE_MESSAGES.groupMissing);
  }
  if (value.length === 0) {
    throw new DomainValueError(STOCKTAKE_SERVICE_MESSAGES.groupsEmpty);
  }
  return [
    ...new Set(
      value.map((id) =>
        requireUuid(id, STOCKTAKE_SERVICE_MESSAGES.groupMissing),
      ),
    ),
  ];
}

/** (item, condition) pairs with stock ≠ 0 at a place, active items only. */
async function pairsWithStock(
  tx: Pick<Database, "select">,
  locationId: string,
  groupIds: string[] | null,
): Promise<{ itemId: string; condition: Condition }[]> {
  const rows = await tx
    .select({
      itemId: inventoryLedger.itemId,
      condition: inventoryLedger.condition,
    })
    .from(inventoryLedger)
    .innerJoin(item, eq(item.id, inventoryLedger.itemId))
    .where(
      and(
        eq(inventoryLedger.locationId, locationId),
        eq(item.status, "ACTIVE"),
        groupIds ? inArray(item.groupId, groupIds) : undefined,
      ),
    )
    .groupBy(inventoryLedger.itemId, inventoryLedger.condition, item.code)
    .having(sql`sum(${inventoryLedger.quantity}) <> 0`)
    .orderBy(asc(item.code), asc(inventoryLedger.condition));
  return rows.map((row) => ({
    itemId: row.itemId,
    condition: row.condition as Condition,
  }));
}

async function startInTransaction(
  tx: Tx,
  actor: Actor,
  input: {
    clientStartId: string;
    locationId: string;
    groupIds: string[] | null;
  },
  now: Date,
): Promise<StartedStocktake> {
  const [place] = await tx
    .select({
      id: location.id,
      code: location.code,
      type: location.type,
      status: location.status,
    })
    .from(location)
    .where(eq(location.id, input.locationId))
    .for("share");
  if (!place) {
    throw new DomainValueError(STOCKTAKE_SERVICE_MESSAGES.locationMissing);
  }
  assertCountableLocation(place.type as LocationType);
  if (place.status !== "ACTIVE") {
    throw new DomainValueError(
      STOCKTAKE_SERVICE_MESSAGES.locationArchived(place.code),
    );
  }
  // The same request may have been committed since the check before the
  // transaction: answer it rather than call the place busy.
  const replay = await replayStart(tx, actor, input.clientStartId);
  if (replay) return replay;
  const open = await openSessionAt(tx, place.id);
  if (open) {
    throw new ServiceFailure(
      conflict(STOCKTAKE_MESSAGES.openSession(place.code, open)),
    );
  }
  if (input.groupIds) {
    const found = await tx
      .select({ id: itemGroup.id })
      .from(itemGroup)
      .where(inArray(itemGroup.id, input.groupIds));
    if (found.length !== input.groupIds.length) {
      throw new DomainValueError(STOCKTAKE_SERVICE_MESSAGES.groupMissing);
    }
  }
  const pairs = await pairsWithStock(tx, place.id, input.groupIds);
  if (pairs.length === 0) {
    throw new DomainValueError(STOCKTAKE_MESSAGES.emptyScope(place.code));
  }
  const year = Number(toBusinessDate(now).slice(0, 4));
  const code = await nextDocumentCode(tx, STOCKTAKE_PREFIX, year);
  const [created] = await tx
    .insert(stocktake)
    .values({
      code,
      locationId: place.id,
      scopeAll: input.groupIds === null,
      clientStartId: input.clientStartId,
      startedBy: actor.id,
      startedAt: now,
      updatedAt: now,
    })
    .returning({ id: stocktake.id });
  const stocktakeId = created?.id ?? "";
  if (input.groupIds) {
    await tx
      .insert(stocktakeGroup)
      .values(input.groupIds.map((groupId) => ({ stocktakeId, groupId })));
  }
  await tx.insert(stocktakeLine).values(
    pairs.map((pair) => ({
      stocktakeId,
      itemId: pair.itemId,
      condition: pair.condition,
      origin: "LISTED",
    })),
  );
  return { code, lineCount: pairs.length, replayed: false };
}

/** Starts a session (design D4, D8); the same request id answers the same. */
export function startStocktake(
  db: Database,
  actor: Actor,
  body: StartBody,
  options: { now?: Date } = {},
): Promise<ServiceResult<StartedStocktake>> {
  return run(async () => {
    const clientStartId = requireUuid(
      body.clientStartId,
      STOCKTAKE_SERVICE_MESSAGES.clientStartId,
    );
    const locationId = requireUuid(
      body.locationId,
      STOCKTAKE_SERVICE_MESSAGES.locationMissing,
    );
    const groupIds = readGroups(body.groupIds);
    const replay = await replayStart(db, actor, clientStartId);
    if (replay) return ok(replay);
    const now = options.now ?? new Date();
    try {
      return ok(
        await db.transaction((tx) =>
          startInTransaction(
            tx,
            actor,
            { clientStartId, locationId, groupIds },
            now,
          ),
        ),
      );
    } catch (error: unknown) {
      // Two starts raced past the checks: the loser reads the winner.
      if (!isUniqueViolation(error)) throw error;
      const again = await replayStart(db, actor, clientStartId);
      if (again) return ok(again);
      const [place] = await db
        .select({ code: location.code })
        .from(location)
        .where(eq(location.id, locationId));
      const open = await openSessionAt(db, locationId);
      if (!place || !open) throw error;
      return conflict(STOCKTAKE_MESSAGES.openSession(place.code, open));
    }
  });
}

// ----------------------------------------------------------- shared locks

interface LockedSession {
  id: string;
  code: string;
  status: StocktakeStatus;
  locationId: string;
  round: number;
  startedAt: Date;
  lastSubmissionId: string | null;
}

async function lockSession(tx: Tx, code: string): Promise<LockedSession> {
  const [row] = await tx
    .select({
      id: stocktake.id,
      code: stocktake.code,
      status: stocktake.status,
      locationId: stocktake.locationId,
      round: stocktake.round,
      startedAt: stocktake.startedAt,
      lastSubmissionId: stocktake.lastSubmissionId,
    })
    .from(stocktake)
    .where(eq(stocktake.code, code))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return { ...row, status: row.status as StocktakeStatus };
}

/** 409 unless the session is in one of the given states. */
function expectStatus(
  session: LockedSession,
  allowed: readonly StocktakeStatus[],
  otherwise: string,
): void {
  if (allowed.includes(session.status)) return;
  if (session.status === "DONE") {
    throw new ServiceFailure(conflict(STOCKTAKE_MESSAGES.alreadyPosted));
  }
  if (session.status === "CANCELLED") {
    throw new ServiceFailure(conflict(STOCKTAKE_MESSAGES.cancelled));
  }
  throw new ServiceFailure(conflict(otherwise));
}

interface StoredLine {
  id: string;
  itemId: string;
  condition: Condition;
  countedMilli: number | null;
  bookMilli: number | null;
  recount: boolean;
  flags: StocktakeFlag[];
  unitCost: number | null;
}

async function storedLines(tx: Tx, stocktakeId: string): Promise<StoredLine[]> {
  const rows = await tx
    .select({
      id: stocktakeLine.id,
      itemId: stocktakeLine.itemId,
      condition: stocktakeLine.condition,
      counted: stocktakeLine.countedQuantity,
      book: stocktakeLine.bookQuantity,
      recount: stocktakeLine.recount,
      flags: stocktakeLine.flags,
      unitCost: stocktakeLine.unitCost,
    })
    .from(stocktakeLine)
    .innerJoin(item, eq(item.id, stocktakeLine.itemId))
    .where(eq(stocktakeLine.stocktakeId, stocktakeId))
    .orderBy(asc(item.code), asc(stocktakeLine.condition));
  return rows.map((row) => ({
    id: row.id,
    itemId: row.itemId,
    condition: row.condition as Condition,
    countedMilli: milliOf(row.counted),
    bookMilli: milliOf(row.book),
    recount: row.recount,
    flags: row.flags as StocktakeFlag[],
    unitCost: row.unitCost,
  }));
}

/**
 * Recomputes the flags of every counted line: the mix-up flag depends on
 * the other conditions of the item. MOVED stays as measured at submit.
 */
async function refreshFlags(tx: Tx, stocktakeId: string): Promise<void> {
  const lines = await storedLines(tx, stocktakeId);
  const flags = stocktakeFlags(
    lines.map((line) => ({
      itemId: line.itemId,
      countedMilli: line.countedMilli,
      bookMilli: line.bookMilli,
      moved: line.flags.includes("MOVED"),
    })),
  );
  for (const [index, line] of lines.entries()) {
    const next = flags[index] ?? [];
    if (next.join() === line.flags.join()) continue;
    await tx
      .update(stocktakeLine)
      .set({ flags: next })
      .where(eq(stocktakeLine.id, line.id));
  }
}

// ---------------------------------------------------------------- submit

export interface SubmitBody {
  submissionId?: unknown;
  deviceNow?: unknown;
  items?: unknown;
}

export interface SubmittedStocktake {
  code: string;
  status: StocktakeStatus;
  counted: number;
  total: number;
  replayed: boolean;
}

interface ParsedItem {
  itemId: string;
  startedAt: Date;
  countedAt: Date;
  lines: { condition: Condition; quantityMilli: number }[];
}

function parseItems(value: unknown): ParsedItem[] {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_ITEMS) {
    throw new DomainValueError(STOCKTAKE_SERVICE_MESSAGES.tooManyItems);
  }
  return value.map((raw: unknown, index) => {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const field = `items.${index}`;
    const itemId = requireUuid(
      entry.itemId,
      STOCKTAKE_SERVICE_MESSAGES.itemMissing,
    );
    const lines = Array.isArray(entry.lines) ? entry.lines : [];
    return {
      itemId,
      startedAt: readTime(entry.startedAt, STOCKTAKE_SERVICE_MESSAGES.time),
      countedAt: readTime(entry.countedAt, STOCKTAKE_SERVICE_MESSAGES.time),
      lines: lines.map((rawLine: unknown, lineIndex) => {
        const line = (rawLine ?? {}) as Record<string, unknown>;
        const lineField = `${field}.lines.${lineIndex}`;
        if (!(CONDITIONS as readonly unknown[]).includes(line.condition)) {
          throw new StocktakeFieldError(
            STOCKTAKE_SERVICE_MESSAGES.condition,
            `${lineField}.condition`,
          );
        }
        const text = typeof line.quantity === "string" ? line.quantity : "";
        if (!DB_QUANTITY.test(text)) {
          throw new StocktakeFieldError(
            STOCKTAKE_SERVICE_MESSAGES.quantity,
            `${lineField}.quantity`,
          );
        }
        return {
          condition: line.condition as Condition,
          quantityMilli: quantityFromDb(text, "KG").milli,
        };
      }),
    };
  });
}

/** Stock of a pair at a place from ledger lines written up to `at`. */
async function bookAt(
  tx: Tx,
  key: { itemId: string; condition: Condition; locationId: string },
  at: Date,
): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<string>`coalesce(sum(${inventoryLedger.quantity}), 0)`,
    })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, key.itemId),
        eq(inventoryLedger.condition, key.condition),
        eq(inventoryLedger.locationId, key.locationId),
        lte(inventoryLedger.createdAt, at),
      ),
    );
  return quantityFromDb(row?.total ?? "0", "KG").milli;
}

/** Whether the ledger had a line of the pair here in [from, to]. */
async function movedBetween(
  tx: Tx,
  key: { itemId: string; condition: Condition; locationId: string },
  from: Date,
  to: Date,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: inventoryLedger.id })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, key.itemId),
        eq(inventoryLedger.condition, key.condition),
        eq(inventoryLedger.locationId, key.locationId),
        gte(inventoryLedger.createdAt, from),
        lte(inventoryLedger.createdAt, to),
      ),
    )
    .limit(1);
  return row !== undefined;
}

async function submitInTransaction(
  tx: Tx,
  actor: Actor,
  code: string,
  input: { submissionId: string; deviceNow: Date; items: ParsedItem[] },
  now: Date,
): Promise<SubmittedStocktake> {
  const session = await lockSession(tx, code);
  const answer = async (replayed: boolean) => {
    const lines = await storedLines(tx, session.id);
    const [head] = await tx
      .select({ status: stocktake.status })
      .from(stocktake)
      .where(eq(stocktake.id, session.id));
    return {
      code: session.code,
      status: (head?.status ?? session.status) as StocktakeStatus,
      counted: lines.filter((line) => line.countedMilli !== null).length,
      total: lines.length,
      replayed,
    };
  };
  if (session.lastSubmissionId === input.submissionId) return answer(true);
  expectStatus(session, ["COUNTING"], STOCKTAKE_MESSAGES.alreadySubmitted);

  const existing = await storedLines(tx, session.id);
  const itemIds = [...new Set(input.items.map((entry) => entry.itemId))];
  const infos = itemIds.length
    ? await tx
        .select({
          id: item.id,
          code: item.code,
          unit: item.unit,
          status: item.status,
        })
        .from(item)
        .where(inArray(item.id, itemIds))
        .orderBy(asc(item.id))
        .for("share")
    : [];
  const info = new Map(infos.map((row) => [row.id, row]));
  const submitted: SubmittedItem[] = input.items.map((entry, index) => {
    const found = info.get(entry.itemId);
    if (!found) {
      throw new StocktakeFieldError(
        STOCKTAKE_SERVICE_MESSAGES.itemMissing,
        `items.${index}`,
      );
    }
    const adds = entry.lines.some(
      (line) =>
        !existing.some(
          (row) =>
            row.itemId === entry.itemId && row.condition === line.condition,
        ),
    );
    if (adds && found.status !== "ACTIVE") {
      throw new StocktakeFieldError(
        STOCKTAKE_SERVICE_MESSAGES.itemArchived(found.code),
        `items.${index}`,
      );
    }
    return {
      itemId: entry.itemId,
      itemCode: found.code,
      unit: found.unit as QuantityUnit,
      lines: entry.lines,
    };
  });
  assertSubmission(
    existing.map((line) => ({
      itemId: line.itemId,
      condition: line.condition,
      counted: line.countedMilli !== null,
      recount: line.recount,
    })),
    submitted,
  );

  const adjust = (at: Date) =>
    adjustDeviceTime({
      at,
      deviceNow: input.deviceNow,
      serverNow: now,
      startedAt: session.startedAt,
    });
  for (const entry of input.items) {
    const countedAt = adjust(entry.countedAt);
    const startedAt = new Date(
      Math.min(adjust(entry.startedAt).getTime(), countedAt.getTime()),
    );
    for (const line of entry.lines) {
      const key = {
        itemId: entry.itemId,
        condition: line.condition,
        locationId: session.locationId,
      };
      const book = await bookAt(tx, key, countedAt);
      const moved = await movedBetween(tx, key, startedAt, countedAt);
      const values = {
        countStartedAt: startedAt,
        countedAt,
        countedQuantity: dbQuantity(line.quantityMilli),
        bookQuantity: dbQuantity(book),
        flags: moved ? (["MOVED"] as StocktakeFlag[]) : [],
        recount: false,
      };
      const row = existing.find(
        (stored) =>
          stored.itemId === entry.itemId && stored.condition === line.condition,
      );
      if (row) {
        await tx
          .update(stocktakeLine)
          .set(values)
          .where(eq(stocktakeLine.id, row.id));
      } else {
        await tx.insert(stocktakeLine).values({
          stocktakeId: session.id,
          itemId: entry.itemId,
          condition: line.condition,
          origin: "ADDED",
          ...values,
        });
      }
    }
  }
  await refreshFlags(tx, session.id);
  await tx
    .update(stocktake)
    .set({
      status: "SUBMITTED",
      submittedBy: actor.id,
      submittedAt: now,
      lastSubmissionId: input.submissionId,
      updatedAt: now,
    })
    .where(eq(stocktake.id, session.id));
  return answer(false);
}

/** Sends the counts to the office (design D2, D3, D8). */
export function submitStocktake(
  db: Database,
  actor: Actor,
  code: string,
  body: SubmitBody,
  options: { now?: Date } = {},
): Promise<ServiceResult<SubmittedStocktake>> {
  return run(async () => {
    const submissionId = requireUuid(
      body.submissionId,
      STOCKTAKE_SERVICE_MESSAGES.submissionId,
    );
    const deviceNow = readTime(
      body.deviceNow,
      STOCKTAKE_SERVICE_MESSAGES.deviceNow,
    );
    const items = parseItems(body.items);
    const now = options.now ?? new Date();
    return ok(
      await db.transaction((tx) =>
        submitInTransaction(
          tx,
          actor,
          code,
          { submissionId, deviceNow, items },
          now,
        ),
      ),
    );
  });
}

// --------------------------------------------------------------- approve

export interface ApproveBody {
  /** ₫ by stocktake_line id, for surpluses of pairs never priced. */
  unitCosts?: unknown;
}

export interface ApprovedStocktake {
  code: string;
  ledgerLines: number;
}

function readUnitCosts(value: unknown): Map<string, number> {
  const costs = new Map<string, number>();
  if (value === undefined || value === null) return costs;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new DomainValueError(STOCKTAKE_SERVICE_MESSAGES.unitCost);
  }
  for (const [id, cost] of Object.entries(value)) {
    requireUuid(id, STOCKTAKE_SERVICE_MESSAGES.lineMissing);
    if (typeof cost !== "number" || !Number.isSafeInteger(cost) || cost < 0) {
      throw new StocktakeFieldError(
        STOCKTAKE_SERVICE_MESSAGES.unitCost,
        `unitCosts.${id}`,
      );
    }
    costs.set(id, cost);
  }
  return costs;
}

/** Director's approval: posts every difference in one transaction (D9). */
export function approveStocktake(
  db: Database,
  actor: Actor,
  code: string,
  body: ApproveBody = {},
  today: BusinessDate = toBusinessDate(new Date()),
): Promise<ServiceResult<ApprovedStocktake>> {
  return run(async () => {
    const costs = readUnitCosts(body.unitCosts);
    return ok(
      await db.transaction(async (tx) => {
        const session = await lockSession(tx, code);
        expectStatus(session, ["SUBMITTED"], STOCKTAKE_MESSAGES.notSubmitted);
        const lines = await storedLines(tx, session.id);
        for (const [id, cost] of costs) {
          if (!lines.some((line) => line.id === id)) {
            throw new DomainValueError(STOCKTAKE_SERVICE_MESSAGES.lineMissing);
          }
          await tx
            .update(stocktakeLine)
            .set({ unitCost: cost })
            .where(eq(stocktakeLine.id, id));
        }
        const [place] = await tx
          .select({ code: location.code })
          .from(location)
          .where(eq(location.id, session.locationId));
        const drafts = stocktakeMovements(
          session.code,
          place?.code ?? "",
          session.locationId,
          lines.map((line) => ({
            itemId: line.itemId,
            condition: line.condition,
            countedMilli: line.countedMilli,
            bookMilli: line.bookMilli,
            unitCost: costs.get(line.id) ?? line.unitCost,
          })),
        );
        const posted = await postMovements(
          tx,
          actor,
          {
            documentType: STOCKTAKE_DOCUMENT_TYPE,
            documentId: session.id,
            documentCode: session.code,
            businessDate: today,
            lines: drafts,
          },
          today,
        );
        const now = new Date();
        await tx
          .update(stocktake)
          .set({
            status: "DONE",
            approvedBy: actor.id,
            approvedAt: now,
            postingId: posted.lines.length ? posted.postingId : null,
            updatedAt: now,
          })
          .where(eq(stocktake.id, session.id));
        return { code: session.code, ledgerLines: posted.lines.length };
      }),
    );
  });
}

// ------------------------------------------------ recount, return, cancel

export interface ChangedStocktake {
  code: string;
  status: StocktakeStatus;
  round: number;
}

/** Sends chosen counted lines back to the phone (design D10). */
export function requestRecount(
  db: Database,
  _actor: Actor,
  code: string,
  body: { lineIds?: unknown },
): Promise<ServiceResult<ChangedStocktake>> {
  return run(async () => {
    const ids = Array.isArray(body.lineIds)
      ? [
          ...new Set(
            body.lineIds.map((id) =>
              requireUuid(id, STOCKTAKE_SERVICE_MESSAGES.lineMissing),
            ),
          ),
        ]
      : [];
    if (ids.length === 0) {
      throw new DomainValueError(STOCKTAKE_MESSAGES.recountNothing);
    }
    return ok(
      await db.transaction(async (tx) => {
        const session = await lockSession(tx, code);
        expectStatus(session, ["SUBMITTED"], STOCKTAKE_MESSAGES.notSubmitted);
        const lines = await storedLines(tx, session.id);
        for (const id of ids) {
          const line = lines.find((row) => row.id === id);
          if (!line) {
            throw new DomainValueError(STOCKTAKE_SERVICE_MESSAGES.lineMissing);
          }
          if (line.countedMilli === null) {
            throw new DomainValueError(STOCKTAKE_MESSAGES.recountUncounted);
          }
        }
        await tx
          .update(stocktakeLine)
          .set({
            recount: true,
            countStartedAt: null,
            countedAt: null,
            countedQuantity: null,
            bookQuantity: null,
            flags: [],
          })
          .where(inArray(stocktakeLine.id, ids));
        // Lines asked for in an earlier round and not counted since stop
        // counting as asked: only this round's choice goes to the phone.
        await tx
          .update(stocktakeLine)
          .set({ recount: false })
          .where(
            and(
              eq(stocktakeLine.stocktakeId, session.id),
              eq(stocktakeLine.recount, true),
              notInArray(stocktakeLine.id, ids),
            ),
          );
        await refreshFlags(tx, session.id);
        const round = session.round + 1;
        await tx
          .update(stocktake)
          .set({
            status: "COUNTING",
            round,
            returnedReason: null,
            returnedBy: null,
            returnedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(stocktake.id, session.id));
        return { code: session.code, status: "COUNTING" as const, round };
      }),
    );
  });
}

/** Director returns the session with a reason; every count stays. */
export function returnStocktake(
  db: Database,
  actor: Actor,
  code: string,
  body: { reason?: unknown },
): Promise<ServiceResult<ChangedStocktake>> {
  return run(async () => {
    const reason = normalizeReason(
      typeof body.reason === "string" ? body.reason : "",
      ADJUSTMENT_MESSAGES.returnReason,
    );
    return ok(
      await db.transaction(async (tx) => {
        const session = await lockSession(tx, code);
        expectStatus(session, ["SUBMITTED"], STOCKTAKE_MESSAGES.notSubmitted);
        await tx
          .update(stocktakeLine)
          .set({ recount: false })
          .where(eq(stocktakeLine.stocktakeId, session.id));
        const now = new Date();
        const round = session.round + 1;
        await tx
          .update(stocktake)
          .set({
            status: "COUNTING",
            round,
            returnedReason: reason,
            returnedBy: actor.id,
            returnedAt: now,
            updatedAt: now,
          })
          .where(eq(stocktake.id, session.id));
        return { code: session.code, status: "COUNTING" as const, round };
      }),
    );
  });
}

/**
 * Cancels a session not yet posted: counters while counting, the director
 * also once it reached the office (design D10).
 */
export function cancelStocktake(
  db: Database,
  actor: Actor & { role: Role },
  code: string,
  body: { reason?: unknown },
): Promise<ServiceResult<ChangedStocktake>> {
  return run(async () => {
    // The route lets in stocktake.count and inventory.approve holders.
    const approver = can(actor.role, "inventory.approve");
    const reason = normalizeReason(
      typeof body.reason === "string" ? body.reason : "",
      STOCKTAKE_MESSAGES.cancelReason,
    );
    return ok(
      await db.transaction(async (tx) => {
        const session = await lockSession(tx, code);
        expectStatus(
          session,
          approver ? ["COUNTING", "SUBMITTED"] : ["COUNTING"],
          STOCKTAKE_MESSAGES.cancelAfterSubmit,
        );
        const now = new Date();
        await tx
          .update(stocktake)
          .set({
            status: "CANCELLED",
            cancelReason: reason,
            cancelledBy: actor.id,
            cancelledAt: now,
            updatedAt: now,
          })
          .where(eq(stocktake.id, session.id));
        return {
          code: session.code,
          status: "CANCELLED" as const,
          round: session.round,
        };
      }),
    );
  });
}

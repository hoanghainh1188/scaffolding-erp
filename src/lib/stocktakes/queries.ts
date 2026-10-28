// Reading stocktakes (stocktake design D4, D5, D13): what M6a offers, the
// blind view the phone gets, the D13 list and detail, and the M1 cards.
import { and, asc, desc, eq, inArray, max, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  inventoryCost,
  inventoryLedger,
  item,
  itemGroup,
  location,
  stocktake,
  stocktakeGroup,
  stocktakeLine,
  user,
} from "@/db/schema";
import type { Condition } from "@/domain/condition";
import { toMoney, type Money } from "@/domain/money";
import { quantityFromDb, type QuantityUnit } from "@/domain/quantity";
import {
  differenceValue,
  stocktakeSummary,
  STOCKTAKE_DOCUMENT_TYPE,
  type StocktakeFlag,
  type StocktakeStatus,
  type StocktakeSummary,
} from "@/domain/stocktake";

const milliOf = (value: string | null) =>
  value === null ? null : quantityFromDb(value, "KG").milli;

// ---------------------------------------------------------------- M6a

export interface StartGroup {
  id: string;
  name: string;
  /** (item, condition) pairs with stock at the place. */
  lines: number;
}

export interface StartPlace {
  id: string;
  code: string;
  name: string;
  type: "YARD" | "WORKSHOP";
  lines: number;
  lastDoneAt: Date | null;
  openCode: string | null;
  groups: StartGroup[];
}

/** Active yards and workshops with the line count of each group (M6a). */
export async function startOptions(db: Database): Promise<StartPlace[]> {
  const places = await db
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
  if (places.length === 0) return [];
  const ids = places.map((place) => place.id);
  const pairs = db
    .select({
      locationId: inventoryLedger.locationId,
      groupId: item.groupId,
    })
    .from(inventoryLedger)
    .innerJoin(item, eq(item.id, inventoryLedger.itemId))
    .where(
      and(inArray(inventoryLedger.locationId, ids), eq(item.status, "ACTIVE")),
    )
    .groupBy(
      inventoryLedger.locationId,
      inventoryLedger.itemId,
      inventoryLedger.condition,
      item.groupId,
    )
    .having(sql`sum(${inventoryLedger.quantity}) <> 0`)
    .as("pairs");
  const counts = await db
    .select({
      locationId: pairs.locationId,
      groupId: pairs.groupId,
      groupName: itemGroup.name,
      lines: sql<number>`count(*)::int`,
    })
    .from(pairs)
    .innerJoin(itemGroup, eq(itemGroup.id, pairs.groupId))
    .groupBy(pairs.locationId, pairs.groupId, itemGroup.name)
    .orderBy(asc(itemGroup.name));
  const done = await db
    .select({ locationId: stocktake.locationId, at: max(stocktake.approvedAt) })
    .from(stocktake)
    .where(
      and(inArray(stocktake.locationId, ids), eq(stocktake.status, "DONE")),
    )
    .groupBy(stocktake.locationId);
  const open = await db
    .select({ locationId: stocktake.locationId, code: stocktake.code })
    .from(stocktake)
    .where(
      and(
        inArray(stocktake.locationId, ids),
        inArray(stocktake.status, ["COUNTING", "SUBMITTED"]),
      ),
    );
  return places.map((place) => {
    const groups = counts
      .filter((row) => row.locationId === place.id)
      .map((row) => ({
        id: row.groupId,
        name: row.groupName,
        lines: row.lines,
      }));
    return {
      ...place,
      type: place.type as StartPlace["type"],
      lines: groups.reduce((sum, group) => sum + group.lines, 0),
      lastDoneAt: done.find((row) => row.locationId === place.id)?.at ?? null,
      openCode: open.find((row) => row.locationId === place.id)?.code ?? null,
      groups,
    };
  });
}

// ------------------------------------------------------------------ M6

export interface CountLine {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  groupName: string;
  condition: Condition;
  origin: "LISTED" | "ADDED";
  /** The phone's own count, "1226.000"; never the book (design D5). */
  counted: string | null;
  countedAt: Date | null;
  recount: boolean;
}

export interface CountView {
  code: string;
  status: StocktakeStatus;
  round: number;
  locationCode: string;
  locationName: string;
  startedAt: Date;
  scope: string[] | null;
  returnedReason: string | null;
  lines: CountLine[];
}

async function scopeOf(db: Database, stocktakeId: string, all: boolean) {
  if (all) return null;
  const rows = await db
    .select({ name: itemGroup.name })
    .from(stocktakeGroup)
    .innerJoin(itemGroup, eq(itemGroup.id, stocktakeGroup.groupId))
    .where(eq(stocktakeGroup.stocktakeId, stocktakeId))
    .orderBy(asc(itemGroup.name));
  return rows.map((row) => row.name);
}

/** What the phone may see of a session: no book, cost or difference. */
export async function countView(
  db: Database,
  code: string,
): Promise<CountView | null> {
  const [head] = await db
    .select({
      id: stocktake.id,
      code: stocktake.code,
      status: stocktake.status,
      round: stocktake.round,
      scopeAll: stocktake.scopeAll,
      startedAt: stocktake.startedAt,
      returnedReason: stocktake.returnedReason,
      locationCode: location.code,
      locationName: location.name,
    })
    .from(stocktake)
    .innerJoin(location, eq(location.id, stocktake.locationId))
    .where(eq(stocktake.code, code));
  if (!head) return null;
  const lines = await db
    .select({
      id: stocktakeLine.id,
      itemId: stocktakeLine.itemId,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      groupName: itemGroup.name,
      condition: stocktakeLine.condition,
      origin: stocktakeLine.origin,
      counted: stocktakeLine.countedQuantity,
      countedAt: stocktakeLine.countedAt,
      recount: stocktakeLine.recount,
    })
    .from(stocktakeLine)
    .innerJoin(item, eq(item.id, stocktakeLine.itemId))
    .innerJoin(itemGroup, eq(itemGroup.id, item.groupId))
    .where(eq(stocktakeLine.stocktakeId, head.id))
    .orderBy(asc(item.code), asc(stocktakeLine.condition));
  const status = head.status as StocktakeStatus;
  return {
    code: head.code,
    status,
    round: head.round,
    locationCode: head.locationCode,
    locationName: head.locationName,
    startedAt: head.startedAt,
    scope: await scopeOf(db, head.id, head.scopeAll),
    returnedReason: status === "COUNTING" ? head.returnedReason : null,
    lines: lines.map((line) => ({
      ...line,
      unit: line.unit as QuantityUnit,
      condition: line.condition as Condition,
      origin: line.origin as CountLine["origin"],
    })),
  };
}

// ------------------------------------------------------------- D13 rows

export interface ResultLine {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  condition: Condition;
  origin: "LISTED" | "ADDED";
  bookMilli: number | null;
  countedMilli: number | null;
  differenceMilli: number | null;
  countStartedAt: Date | null;
  countedAt: Date | null;
  /** Average now, the typed cost, or the booked cost once posted. */
  unitCost: Money | null;
  /** The director typed it (surplus of a pair never priced). */
  unitCostTyped: boolean;
  value: Money | null;
  flags: StocktakeFlag[];
  recount: boolean;
}

interface Head {
  id: string;
  status: StocktakeStatus;
  locationId: string;
}

async function resultLines(db: Database, head: Head): Promise<ResultLine[]> {
  const rows = await db
    .select({
      id: stocktakeLine.id,
      itemId: stocktakeLine.itemId,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      condition: stocktakeLine.condition,
      origin: stocktakeLine.origin,
      book: stocktakeLine.bookQuantity,
      counted: stocktakeLine.countedQuantity,
      countStartedAt: stocktakeLine.countStartedAt,
      countedAt: stocktakeLine.countedAt,
      flags: stocktakeLine.flags,
      recount: stocktakeLine.recount,
      typedCost: stocktakeLine.unitCost,
      avgCost: inventoryCost.avgCost,
    })
    .from(stocktakeLine)
    .innerJoin(item, eq(item.id, stocktakeLine.itemId))
    .leftJoin(
      inventoryCost,
      and(
        eq(inventoryCost.itemId, stocktakeLine.itemId),
        eq(inventoryCost.condition, stocktakeLine.condition),
      ),
    )
    .where(eq(stocktakeLine.stocktakeId, head.id))
    .orderBy(asc(item.code), asc(stocktakeLine.condition));
  const booked =
    head.status === "DONE"
      ? await db
          .select({
            itemId: inventoryLedger.itemId,
            condition: inventoryLedger.condition,
            unitCost: inventoryLedger.unitCost,
            amount: inventoryLedger.amount,
          })
          .from(inventoryLedger)
          .where(
            and(
              eq(inventoryLedger.documentType, STOCKTAKE_DOCUMENT_TYPE),
              eq(inventoryLedger.documentId, head.id),
            ),
          )
      : [];
  return rows.map((row) => {
    const countedMilli = milliOf(row.counted);
    const bookMilli = milliOf(row.book);
    const differenceMilli =
      countedMilli === null || bookMilli === null
        ? null
        : countedMilli - bookMilli;
    const posted = booked.find(
      (line) => line.itemId === row.itemId && line.condition === row.condition,
    );
    const cost = posted
      ? posted.unitCost
      : (row.avgCost ?? row.typedCost ?? null);
    const unitCost = cost === null ? null : toMoney(cost);
    const value = posted
      ? toMoney(posted.amount)
      : differenceValue({
          unit: row.unit as QuantityUnit,
          countedMilli,
          bookMilli,
          unitCost,
          flags: [],
        });
    return {
      id: row.id,
      itemId: row.itemId,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unit: row.unit as QuantityUnit,
      condition: row.condition as Condition,
      origin: row.origin as ResultLine["origin"],
      bookMilli,
      countedMilli,
      differenceMilli,
      countStartedAt: row.countStartedAt,
      countedAt: row.countedAt,
      unitCost,
      unitCostTyped: !posted && row.avgCost === null && row.typedCost !== null,
      value,
      flags: row.flags as StocktakeFlag[],
      recount: row.recount,
    };
  });
}

function summaryOf(lines: readonly ResultLine[]): StocktakeSummary {
  return stocktakeSummary(
    lines.map((line) => ({
      unit: line.unit,
      countedMilli: line.countedMilli,
      bookMilli: line.bookMilli,
      unitCost: line.value === null ? null : line.unitCost,
      flags: line.flags,
    })),
  );
}

// ------------------------------------------------------------- D13 list

export interface StocktakeRow {
  code: string;
  locationCode: string;
  locationName: string;
  status: StocktakeStatus;
  startedAt: Date;
  startedByName: string;
  counted: number;
  total: number;
  /** Null while counting or once cancelled. */
  diffLines: number | null;
  diffValue: number | null;
}

const starter = alias(user, "starter");

/** Waiting for approval first, then newest first (D13 list). */
export async function listStocktakes(
  db: Database,
  filter: { status?: StocktakeStatus } = {},
): Promise<StocktakeRow[]> {
  const where: SQL[] = [];
  if (filter.status) where.push(eq(stocktake.status, filter.status));
  const heads = await db
    .select({
      id: stocktake.id,
      code: stocktake.code,
      status: stocktake.status,
      locationId: stocktake.locationId,
      locationCode: location.code,
      locationName: location.name,
      startedAt: stocktake.startedAt,
      startedByName: starter.name,
    })
    .from(stocktake)
    .innerJoin(location, eq(location.id, stocktake.locationId))
    .innerJoin(starter, eq(starter.id, stocktake.startedBy))
    .where(where.length ? and(...where) : undefined)
    .orderBy(
      sql`case when ${stocktake.status} = 'SUBMITTED' then 0 else 1 end`,
      desc(stocktake.startedAt),
    );
  const rows: StocktakeRow[] = [];
  for (const head of heads) {
    const status = head.status as StocktakeStatus;
    const lines = await resultLines(db, { ...head, status });
    const summary = summaryOf(lines);
    const shown = status === "SUBMITTED" || status === "DONE";
    rows.push({
      code: head.code,
      locationCode: head.locationCode,
      locationName: head.locationName,
      status,
      startedAt: head.startedAt,
      startedByName: head.startedByName,
      counted: summary.counted,
      total: summary.total,
      diffLines: shown ? summary.shortage.lines + summary.surplus.lines : null,
      diffValue: shown ? summary.value : null,
    });
  }
  return rows;
}

// ----------------------------------------------------------- D13 detail

export interface PostedRow {
  id: number;
  movement: string;
  itemCode: string;
  condition: Condition;
  quantity: string;
  unitCost: number;
  amount: number;
}

export interface StocktakeDetail {
  id: string;
  code: string;
  status: StocktakeStatus;
  round: number;
  locationCode: string;
  locationName: string;
  scope: string[] | null;
  startedAt: Date;
  startedByName: string;
  submittedAt: Date | null;
  returnedReason: string | null;
  cancelReason: string | null;
  approvedAt: Date | null;
  approvedByName: string | null;
  lines: ResultLine[];
  summary: StocktakeSummary;
  posted: PostedRow[];
}

const approver = alias(user, "approver");

export async function getStocktake(
  db: Database,
  code: string,
): Promise<StocktakeDetail | null> {
  const [head] = await db
    .select({
      id: stocktake.id,
      code: stocktake.code,
      status: stocktake.status,
      round: stocktake.round,
      scopeAll: stocktake.scopeAll,
      locationId: stocktake.locationId,
      locationCode: location.code,
      locationName: location.name,
      startedAt: stocktake.startedAt,
      startedByName: starter.name,
      submittedAt: stocktake.submittedAt,
      returnedReason: stocktake.returnedReason,
      cancelReason: stocktake.cancelReason,
      approvedAt: stocktake.approvedAt,
      approvedByName: approver.name,
    })
    .from(stocktake)
    .innerJoin(location, eq(location.id, stocktake.locationId))
    .innerJoin(starter, eq(starter.id, stocktake.startedBy))
    .leftJoin(approver, eq(approver.id, stocktake.approvedBy))
    .where(eq(stocktake.code, code));
  if (!head) return null;
  const status = head.status as StocktakeStatus;
  const lines = await resultLines(db, { ...head, status });
  const posted =
    status === "DONE"
      ? await db
          .select({
            id: inventoryLedger.id,
            movement: inventoryLedger.movement,
            itemCode: item.code,
            condition: inventoryLedger.condition,
            quantity: inventoryLedger.quantity,
            unitCost: inventoryLedger.unitCost,
            amount: inventoryLedger.amount,
          })
          .from(inventoryLedger)
          .innerJoin(item, eq(item.id, inventoryLedger.itemId))
          .where(
            and(
              eq(inventoryLedger.documentType, STOCKTAKE_DOCUMENT_TYPE),
              eq(inventoryLedger.documentId, head.id),
            ),
          )
          .orderBy(asc(inventoryLedger.id))
      : [];
  return {
    id: head.id,
    code: head.code,
    status,
    round: head.round,
    locationCode: head.locationCode,
    locationName: head.locationName,
    scope: await scopeOf(db, head.id, head.scopeAll),
    startedAt: head.startedAt,
    startedByName: head.startedByName,
    submittedAt: head.submittedAt,
    returnedReason: head.returnedReason,
    cancelReason: head.cancelReason,
    approvedAt: head.approvedAt,
    approvedByName: head.approvedByName,
    lines,
    summary: summaryOf(lines),
    posted: posted.map((row) => ({
      ...row,
      condition: row.condition as Condition,
    })),
  };
}

// ------------------------------------------------------------------ M1

export interface OpenStocktake {
  code: string;
  locationCode: string;
  locationName: string;
  status: "COUNTING" | "SUBMITTED";
  counted: number;
  total: number;
  recountLines: number;
  returnedReason: string | null;
}

/** Sessions not finished yet, for the M1 cards. */
export async function openStocktakes(db: Database): Promise<OpenStocktake[]> {
  const rows = await db
    .select({
      code: stocktake.code,
      status: stocktake.status,
      returnedReason: stocktake.returnedReason,
      locationCode: location.code,
      locationName: location.name,
      counted: sql<number>`(select count(*)::int from ${stocktakeLine} where ${stocktakeLine.stocktakeId} = ${stocktake.id} and ${stocktakeLine.countedAt} is not null)`,
      total: sql<number>`(select count(*)::int from ${stocktakeLine} where ${stocktakeLine.stocktakeId} = ${stocktake.id})`,
      recountLines: sql<number>`(select count(*)::int from ${stocktakeLine} where ${stocktakeLine.stocktakeId} = ${stocktake.id} and ${stocktakeLine.recount})`,
    })
    .from(stocktake)
    .innerJoin(location, eq(location.id, stocktake.locationId))
    .where(inArray(stocktake.status, ["COUNTING", "SUBMITTED"]))
    .orderBy(asc(location.code));
  return rows.map((row) => ({
    ...row,
    status: row.status as OpenStocktake["status"],
    returnedReason: row.status === "COUNTING" ? row.returnedReason : null,
  }));
}

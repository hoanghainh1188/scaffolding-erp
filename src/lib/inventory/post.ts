// The one way stock enters the ledger (inventory-ledger design D2-D5, D10).
// Later changes (goods-receipt, deliveries, returns, repair) call
// postMovements inside the transaction that saves their document.
import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { inventoryCost, inventoryLedger, item, location } from "@/db/schema";
import {
  averageAfterInflow,
  lineAmount,
  unitCostOf,
} from "@/domain/average-cost";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { CONDITION_LABELS, type Condition } from "@/domain/condition";
import { DomainValueError } from "@/domain/errors";
import { toMoney, type Money } from "@/domain/money";
import {
  assertBusinessDate,
  assertMovementLine,
  changesAverage,
  type MovementDraft,
} from "@/domain/movement";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  quantityFromDb,
  quantityToDb,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { conflict, ServiceFailure, type Actor } from "@/lib/catalog/common";

/** A transaction (or the db) the ledger writes into. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface Posting {
  documentType: string;
  documentId: string | null;
  documentCode: string;
  businessDate: BusinessDate;
  lines: readonly MovementDraft[];
}

export interface PostedLine {
  id: number;
  itemId: string;
  condition: Condition;
  locationId: string;
  movement: MovementDraft["movement"];
  quantityMilli: number;
  unitCost: Money;
  amount: Money;
  avgCostAfter: Money;
  poolMilliAfter: number;
}

export const POST_MESSAGES = {
  itemMissing: "Không tìm thấy vật tư",
  locationMissing: "Không tìm thấy vị trí",
  itemArchived: (code: string) => `Vật tư ${code} đã ngừng dùng`,
  locationArchived: (code: string) => `Vị trí ${code} đã ngừng dùng`,
  noCost: (code: string, condition: Condition) =>
    `${code} ${CONDITION_LABELS[condition]} chưa có giá vốn, nhập đơn giá`,
  shortage: (code: string, condition: Condition, place: string, left: string) =>
    `Không đủ hàng: ${code} ${CONDITION_LABELS[condition]} tại ${place} còn ${left}`,
} as const;

export interface ItemInfo {
  id: string;
  code: string;
  unit: QuantityUnit;
  /** kg per piece as numeric text; null for items counted in kg. */
  standardWeightKg: string | null;
}

export interface PoolState {
  poolMilli: number;
  avgCost: Money | null;
  lastBusinessDate: BusinessDate | null;
}

export const pairKey = (itemId: string, condition: string) =>
  `${itemId}|${condition}`;
const placeKey = (itemId: string, condition: string, locationId: string) =>
  `${itemId}|${condition}|${locationId}`;

async function loadItems(
  tx: Tx,
  ids: string[],
): Promise<Map<string, ItemInfo>> {
  // FOR SHARE: archiving an item (FOR UPDATE) waits for this posting, and
  // this posting waits for a running archive (design D4, step 2).
  const rows = await tx
    .select({
      id: item.id,
      code: item.code,
      unit: item.unit,
      standardWeightKg: item.standardWeightKg,
      status: item.status,
    })
    .from(item)
    .where(inArray(item.id, ids))
    .orderBy(asc(item.id))
    .for("share");
  const found = new Map<string, ItemInfo>();
  for (const row of rows) {
    if (row.status !== "ACTIVE") {
      throw new ServiceFailure(conflict(POST_MESSAGES.itemArchived(row.code)));
    }
    found.set(row.id, {
      id: row.id,
      code: row.code,
      unit: row.unit as QuantityUnit,
      standardWeightKg: row.standardWeightKg,
    });
  }
  if (found.size !== ids.length) {
    throw new DomainValueError(POST_MESSAGES.itemMissing);
  }
  return found;
}

async function loadLocations(
  tx: Tx,
  ids: string[],
): Promise<Map<string, string>> {
  const rows = await tx
    .select({ id: location.id, code: location.code, status: location.status })
    .from(location)
    .where(inArray(location.id, ids))
    .orderBy(asc(location.id))
    .for("share");
  const codes = new Map<string, string>();
  for (const row of rows) {
    if (row.status !== "ACTIVE") {
      throw new ServiceFailure(
        conflict(POST_MESSAGES.locationArchived(row.code)),
      );
    }
    codes.set(row.id, row.code);
  }
  if (codes.size !== ids.length) {
    throw new DomainValueError(POST_MESSAGES.locationMissing);
  }
  return codes;
}

/**
 * Creates missing cost rows, then locks them in (item, condition) order so
 * two postings touching the same pairs in another order cannot deadlock.
 */
async function lockPools(
  tx: Tx,
  pairs: { itemId: string; condition: Condition }[],
): Promise<Map<string, PoolState>> {
  const sorted = [...pairs].sort((a, b) =>
    a.itemId === b.itemId
      ? a.condition.localeCompare(b.condition)
      : a.itemId.localeCompare(b.itemId),
  );
  await tx.insert(inventoryCost).values(sorted).onConflictDoNothing();
  const pools = new Map<string, PoolState>();
  for (const pair of sorted) {
    const [row] = await tx
      .select({
        avgCost: inventoryCost.avgCost,
        poolQuantity: inventoryCost.poolQuantity,
        lastBusinessDate: inventoryCost.lastBusinessDate,
      })
      .from(inventoryCost)
      .where(
        and(
          eq(inventoryCost.itemId, pair.itemId),
          eq(inventoryCost.condition, pair.condition),
        ),
      )
      .for("update");
    pools.set(pairKey(pair.itemId, pair.condition), {
      // Stored with three decimals for every unit; thousandths either way.
      poolMilli: quantityFromDb(row?.poolQuantity ?? "0", "KG").milli,
      avgCost: row?.avgCost == null ? null : toMoney(row.avgCost),
      lastBusinessDate: (row?.lastBusinessDate as BusinessDate | null) ?? null,
    });
  }
  return pools;
}

/** Current stock of each (item, condition, location), from the ledger. */
async function stockAt(
  tx: Tx,
  keys: { itemId: string; condition: Condition; locationId: string }[],
): Promise<Map<string, number>> {
  const stock = new Map<string, number>();
  for (const key of keys) {
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
        ),
      );
    stock.set(
      placeKey(key.itemId, key.condition, key.locationId),
      quantityFromDb(row?.total ?? "0", "KG").milli,
    );
  }
  return stock;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export interface PostingLocks {
  items: Map<string, ItemInfo>;
  /** Location code by id. */
  places: Map<string, string>;
  /** Cost pool by pairKey(item, condition). */
  pools: Map<string, PoolState>;
}

/**
 * Takes every lock a posting needs, in the one order all documents use:
 * items FOR SHARE, locations FOR SHARE, then cost pools FOR UPDATE, each
 * sorted by id (design D4; simple-repair design D2). A document that must
 * price its lines from the averages calls this first; postMovements then
 * takes the same locks again in the same transaction, which is a no-op.
 */
export async function lockForPosting(
  tx: Tx,
  scope: {
    itemIds: readonly string[];
    locationIds: readonly string[];
    pairs: readonly { itemId: string; condition: Condition }[];
  },
): Promise<PostingLocks> {
  const items = await loadItems(tx, unique([...scope.itemIds]).sort());
  const places = await loadLocations(tx, unique([...scope.locationIds]).sort());
  const pairs = unique(
    scope.pairs.map((pair) => pairKey(pair.itemId, pair.condition)),
  ).map((key) => {
    const [itemId, condition] = key.split("|") as [string, Condition];
    return { itemId, condition };
  });
  const pools = await lockPools(tx, pairs);
  return { items, places, pools };
}

/**
 * Writes the lines of one document into the ledger and moves the averages,
 * all inside the caller's transaction. Refuses (and writes nothing) when a
 * line breaks a rule, stock would go below zero, or a row is archived.
 */
export async function postMovements(
  tx: Tx,
  actor: Actor,
  posting: Posting,
  today: BusinessDate = toBusinessDate(new Date()),
): Promise<{ postingId: string; lines: PostedLine[] }> {
  const drafts = posting.lines;
  if (drafts.length === 0) return { postingId: "", lines: [] };

  const { items, places, pools } = await lockForPosting(tx, {
    itemIds: drafts.map((d) => d.itemId),
    locationIds: drafts.map((d) => d.locationId),
    pairs: drafts,
  });
  for (const draft of drafts) {
    const info = items.get(draft.itemId) as ItemInfo;
    assertMovementLine({
      movement: draft.movement,
      itemCode: info.code,
      unit: info.unit,
      quantityMilli: draft.quantityMilli,
      hasAmount: draft.amount !== undefined,
    });
  }

  const pairs = unique(drafts.map((d) => pairKey(d.itemId, d.condition))).map(
    (key) => {
      const [itemId, condition] = key.split("|") as [string, Condition];
      return { itemId, condition };
    },
  );
  for (const pair of pairs) {
    assertBusinessDate({
      date: posting.businessDate,
      today,
      last:
        pools.get(pairKey(pair.itemId, pair.condition))?.lastBusinessDate ??
        null,
      itemCode: (items.get(pair.itemId) as ItemInfo).code,
      condition: pair.condition,
    });
  }

  // Price every line in document order against the running pools.
  const results: Omit<PostedLine, "id">[] = [];
  for (const draft of drafts) {
    const pool = pools.get(pairKey(draft.itemId, draft.condition)) as PoolState;
    const info = items.get(draft.itemId) as ItemInfo;
    let unitCost: Money;
    let amount: Money;
    let avgAfter: Money;
    if (changesAverage(draft.movement)) {
      amount = toMoney(draft.amount ?? 0);
      avgAfter = averageAfterInflow(pool, draft.quantityMilli, amount);
      unitCost = unitCostOf(amount, draft.quantityMilli);
    } else {
      const paired =
        draft.pairedWith === undefined ? undefined : results[draft.pairedWith];
      const cost =
        pool.avgCost ??
        paired?.unitCost ??
        (draft.unitCost === undefined ? null : toMoney(draft.unitCost));
      if (cost === null) {
        throw new DomainValueError(
          POST_MESSAGES.noCost(info.code, draft.condition),
        );
      }
      unitCost = cost;
      amount = lineAmount(draft.quantityMilli, cost);
      avgAfter = cost;
    }
    pool.poolMilli += draft.quantityMilli;
    pool.avgCost = avgAfter;
    results.push({
      itemId: draft.itemId,
      condition: draft.condition,
      locationId: draft.locationId,
      movement: draft.movement,
      quantityMilli: draft.quantityMilli,
      unitCost,
      amount,
      avgCostAfter: avgAfter,
      poolMilliAfter: pool.poolMilli,
    });
  }

  // No (item, condition, location) may go below zero (spec: Tồn không âm).
  const changes = new Map<string, number>();
  const outgoing: MovementDraft[] = [];
  for (const draft of drafts) {
    const key = placeKey(draft.itemId, draft.condition, draft.locationId);
    changes.set(key, (changes.get(key) ?? 0) + draft.quantityMilli);
    if (draft.quantityMilli < 0) outgoing.push(draft);
  }
  const stock = await stockAt(tx, outgoing);
  for (const draft of outgoing) {
    const key = placeKey(draft.itemId, draft.condition, draft.locationId);
    const before = stock.get(key) ?? 0;
    if (before + (changes.get(key) ?? 0) < 0) {
      const info = items.get(draft.itemId) as ItemInfo;
      const left = toQuantity(before, info.unit);
      throw new ServiceFailure(
        conflict(
          POST_MESSAGES.shortage(
            info.code,
            draft.condition,
            places.get(draft.locationId) ?? "",
            `${formatQuantity(left)} ${QUANTITY_UNIT_LABELS[info.unit]}`,
          ),
        ),
      );
    }
  }

  const postingId = randomUUID();
  const inserted = await tx
    .insert(inventoryLedger)
    .values(
      results.map((line, index) => {
        const draft = drafts[index] as MovementDraft;
        const unit = (items.get(line.itemId) as ItemInfo).unit;
        return {
          postingId,
          businessDate: posting.businessDate,
          itemId: line.itemId,
          condition: line.condition,
          locationId: line.locationId,
          movement: line.movement,
          quantity: quantityToDb(toQuantity(line.quantityMilli, unit)),
          unitCost: line.unitCost,
          amount: line.amount,
          avgCostAfter: line.avgCostAfter,
          poolQuantityAfter: quantityToDb(
            toQuantity(line.poolMilliAfter, "KG"),
          ),
          weighedKg:
            draft.weighedKgMilli === undefined
              ? null
              : quantityToDb(toQuantity(draft.weighedKgMilli, "KG")),
          documentType: posting.documentType,
          documentId: posting.documentId,
          documentCode: posting.documentCode,
          description: draft.description,
          createdBy: actor.id,
        };
      }),
    )
    .returning({ id: inventoryLedger.id });

  const lines = results.map((line, index) => ({
    ...line,
    id: inserted[index]?.id ?? 0,
  }));
  for (const pair of pairs) {
    const key = pairKey(pair.itemId, pair.condition);
    const pool = pools.get(key) as PoolState;
    const last = lines
      .filter((l) => pairKey(l.itemId, l.condition) === key)
      .at(-1);
    await tx
      .update(inventoryCost)
      .set({
        avgCost: pool.avgCost,
        poolQuantity: quantityToDb(toQuantity(pool.poolMilli, "KG")),
        lastBusinessDate: posting.businessDate,
        lastLedgerId: last?.id ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryCost.itemId, pair.itemId),
          eq(inventoryCost.condition, pair.condition),
        ),
      );
  }
  return { postingId, lines };
}

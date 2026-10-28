// M6 counting model (stocktake design D5, D7, D8): the draft keeps what the
// phone counted per item, the server view says which lines still need a
// count. Pure functions, unit tested; the form only renders them.
import { CONDITIONS, type Condition } from "@/domain/condition";
import { DomainValueError } from "@/domain/errors";
import {
  parseQuantity,
  quantityFromDb,
  quantityToDb,
  type QuantityUnit,
} from "@/domain/quantity";
import { STOCKTAKE_MESSAGES } from "@/domain/stocktake";

export interface CountViewLine {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  groupName: string;
  condition: Condition;
  origin: "LISTED" | "ADDED";
  /** Own count from the server, "1226.000". */
  counted: string | null;
  recount: boolean;
}

export interface CountViewData {
  code: string;
  status: "COUNTING" | "SUBMITTED" | "DONE" | "CANCELLED";
  round: number;
  locationCode: string;
  locationName: string;
  startedAt: string;
  scope: string[] | null;
  returnedReason: string | null;
  lines: CountViewLine[];
}

export interface CatalogItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
}

/** One item the phone works on: typed numbers by condition. */
export interface ItemCount {
  startedAt: string;
  /** Set by "Xong mã này"; null while counting. */
  countedAt: string | null;
  values: Partial<Record<Condition, string>>;
}

export interface StocktakeDraftPayload {
  round: number;
  counts: Record<string, ItemCount>;
  /** Items found that the session did not list. */
  added: CatalogItem[];
  /** Conditions added to an item ("Thêm tình trạng"). */
  extraConditions: Record<string, Condition[]>;
  /** Filled when the count is queued to be sent. */
  body: { items: SubmitItem[] } | null;
}

export interface SubmitItem {
  itemId: string;
  startedAt: string;
  countedAt: string;
  lines: { condition: Condition; quantity: string }[];
}

export type ItemState = "TODO" | "COUNTING" | "DONE" | "LOCKED";

export interface ItemView extends CatalogItem {
  groupName: string;
  conditions: Condition[];
  /** Conditions the server asked to count again. */
  recount: Condition[];
  /** Server counts by condition (kept lines). */
  server: Partial<Record<Condition, string>>;
  state: ItemState;
  added: boolean;
}

export function emptyPayload(round: number): StocktakeDraftPayload {
  return { round, counts: {}, added: [], extraConditions: {}, body: null };
}

const conditionOrder = (a: Condition, b: Condition) =>
  CONDITIONS.indexOf(a) - CONDITIONS.indexOf(b);

/** "1226.000" → "1226", "1248.250" → "1248,25" for an input. */
export function inputText(value: string, unit: QuantityUnit): string {
  const milli = quantityFromDb(value, unit).milli;
  const text = String(milli / 1000);
  return text.replace(".", ",");
}

/**
 * Brings a draft up to the server's round: lines sent back for a recount
 * lose their old number, the rest of the draft stays (design D8).
 */
export function alignDraft(
  payload: StocktakeDraftPayload,
  view: CountViewData,
): StocktakeDraftPayload {
  if (payload.round >= view.round) return payload;
  const counts: Record<string, ItemCount> = {};
  for (const [itemId, count] of Object.entries(payload.counts)) {
    const asked = view.lines.filter(
      (line) => line.itemId === itemId && line.recount,
    );
    if (asked.length === 0) {
      counts[itemId] = count;
      continue;
    }
    const values = { ...count.values };
    for (const line of asked) delete values[line.condition];
    counts[itemId] = { ...count, values, countedAt: null };
  }
  return { ...payload, round: view.round, counts, body: null };
}

/** The session's items, with added ones last (M6 cards). */
export function itemsOf(
  view: CountViewData,
  payload: StocktakeDraftPayload,
): ItemView[] {
  const recountRound = view.lines.some((line) => line.recount);
  const byItem = new Map<string, ItemView>();
  for (const line of view.lines) {
    const found = byItem.get(line.itemId) ?? {
      itemId: line.itemId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      unit: line.unit,
      groupName: line.groupName,
      conditions: [],
      recount: [],
      server: {},
      state: "TODO" as ItemState,
      added: line.origin === "ADDED",
    };
    found.conditions.push(line.condition);
    if (line.recount) found.recount.push(line.condition);
    if (line.counted !== null) found.server[line.condition] = line.counted;
    byItem.set(line.itemId, found);
  }
  for (const item of payload.added) {
    if (byItem.has(item.itemId)) continue;
    byItem.set(item.itemId, {
      ...item,
      groupName: "",
      conditions: [],
      recount: [],
      server: {},
      state: "TODO",
      added: true,
    });
  }
  return [...byItem.values()].map((item) => {
    const extra = payload.extraConditions[item.itemId] ?? [];
    const conditions = [...new Set([...item.conditions, ...extra])].sort(
      conditionOrder,
    );
    const count = payload.counts[item.itemId];
    const serverDone =
      item.conditions.length > 0 &&
      item.conditions.every(
        (condition) => item.server[condition] !== undefined,
      );
    let state: ItemState;
    if (count?.countedAt) state = "DONE";
    else if (count) state = "COUNTING";
    else if (recountRound && item.recount.length === 0 && serverDone) {
      state = "LOCKED";
    } else if (serverDone && item.recount.length === 0) state = "DONE";
    else state = "TODO";
    return { ...item, conditions, state };
  });
}

/** Conditions that need a number before "Xong mã này". */
export function requiredConditions(
  item: ItemView,
  recountRound: boolean,
): Condition[] {
  if (!recountRound) return item.conditions;
  return item.conditions.filter(
    (condition) =>
      item.recount.includes(condition) || item.server[condition] === undefined,
  );
}

/** The first condition still empty, or a typed number that is wrong. */
export function finishError(
  item: ItemView,
  count: ItemCount | undefined,
  recountRound: boolean,
): string | null {
  for (const condition of requiredConditions(item, recountRound)) {
    const text = count?.values[condition]?.trim() ?? "";
    if (text === "") return STOCKTAKE_MESSAGES.missingCondition(condition);
    try {
      const quantity = parseQuantity(text, item.unit);
      if (quantity.milli < 0) return STOCKTAKE_MESSAGES.negative(item.itemCode);
    } catch (error) {
      if (error instanceof DomainValueError) {
        return item.unit === "PIECE"
          ? STOCKTAKE_MESSAGES.wholePieces(item.itemCode)
          : error.message;
      }
      throw error;
    }
  }
  return null;
}

/** Lines counted out of all lines, as M6 shows "17 / 28 dòng". */
export function progressOf(
  view: CountViewData,
  payload: StocktakeDraftPayload,
): { counted: number; total: number } {
  const items = itemsOf(view, payload);
  let counted = 0;
  let total = 0;
  for (const item of items) {
    total += item.conditions.length;
    if (item.state === "DONE" || item.state === "LOCKED") {
      counted += item.conditions.filter(
        (condition) =>
          payload.counts[item.itemId]?.values[condition] !== undefined ||
          item.server[condition] !== undefined,
      ).length;
    }
  }
  return { counted, total };
}

/** What "Gửi văn phòng" sends: every item finished in this draft. */
export function toSubmitItems(
  view: CountViewData,
  payload: StocktakeDraftPayload,
): SubmitItem[] {
  const recountRound = view.lines.some((line) => line.recount);
  const result: SubmitItem[] = [];
  for (const item of itemsOf(view, payload)) {
    const count = payload.counts[item.itemId];
    if (!count?.countedAt) continue;
    const required = requiredConditions(item, recountRound);
    const lines = item.conditions
      .filter((condition) => required.includes(condition))
      .map((condition) => ({
        condition,
        quantity: quantityToDb(
          parseQuantity(count.values[condition] ?? "0", item.unit),
        ),
      }));
    result.push({
      itemId: item.itemId,
      startedAt: count.startedAt,
      countedAt: count.countedAt,
      lines,
    });
  }
  return result;
}

/** Lines that would be sent without a count ("Còn N dòng chưa đếm"). */
export function uncountedLines(
  view: CountViewData,
  payload: StocktakeDraftPayload,
): number {
  const { counted, total } = progressOf(view, payload);
  return total - counted;
}

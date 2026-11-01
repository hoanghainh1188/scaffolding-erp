// Stocktakes (stocktake design D2, D3, D6, D7, D9, D13; requirements 0.2
// #31, #32): blind counts at a yard or workshop, compared with the book at
// "Xong mã này". Pure functions shared by the phone, D13 and the server.
import { dict } from "../locales";
import { lineAmount } from "./average-cost";
import { CONDITION_LABELS, type Condition } from "./condition";
import { DomainValueError } from "./errors";
import type { LocationType } from "./location-type";
import type { Money } from "./money";
import type { MovementDraft } from "./movement";
import type { QuantityUnit } from "./quantity";
import {
  adjustmentMovements,
  type AdjustmentLineInput,
} from "./stock-adjustment";

export const STOCKTAKE_PREFIX = "KK";
export const STOCKTAKE_DOCUMENT_TYPE = "STOCKTAKE";
/** A line is flagged when it is off by more than this share of the book. */
export const OVER_PCT_THRESHOLD = 1;

export const STOCKTAKE_STATUSES = [
  "COUNTING",
  "SUBMITTED",
  "DONE",
  "CANCELLED",
] as const;
export type StocktakeStatus = (typeof STOCKTAKE_STATUSES)[number];

export const STOCKTAKE_STATUS_LABELS: Readonly<
  Record<StocktakeStatus, string>
> = dict.stocktake.statuses;

export const STOCKTAKE_FLAGS = ["MOVED", "OVER_PCT", "CONDITION_SWAP"] as const;
export type StocktakeFlag = (typeof STOCKTAKE_FLAGS)[number];

const K = 1000;
const groupFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 3,
});
const percentFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 1,
});

export const STOCKTAKE_MESSAGES = {
  siteRefused: dict.stocktake.messages.siteRefused,
  emptyScope: dict.stocktake.messages.emptyScope,
  openSession: dict.stocktake.messages.openSession,
  nothingCounted: dict.stocktake.messages.nothingCounted,
  missingCondition: (condition: Condition) =>
    dict.stocktake.messages.missingCondition(CONDITION_LABELS[condition]),
  wholePieces: dict.stocktake.messages.wholePieces,
  negative: dict.stocktake.messages.negative,
  duplicateItem: dict.stocktake.messages.duplicateItem,
  duplicateCondition: (code: string, condition: Condition) =>
    dict.stocktake.messages.duplicateCondition(code, CONDITION_LABELS[condition]),
  noRecount: dict.stocktake.messages.noRecount,
  noLines: dict.stocktake.messages.noLines,
  recountMissing: dict.stocktake.messages.recountMissing,
  alreadySubmitted: dict.stocktake.messages.alreadySubmitted,
  cancelAfterSubmit: dict.stocktake.messages.cancelAfterSubmit,
  alreadyPosted: dict.stocktake.messages.alreadyPosted,
  cancelled: dict.stocktake.messages.cancelled,
  notSubmitted: dict.stocktake.messages.notSubmitted,
  notCounting: dict.stocktake.messages.notCounting,
  recountNothing: dict.stocktake.messages.recountNothing,
  recountUncounted: dict.stocktake.messages.recountUncounted,
  cancelReason: dict.stocktake.messages.cancelReason,
  offlineStart: dict.stocktake.messages.offlineStart,
} as const;

/** A rule broken by one field of a submission ("items.0.lines.1.quantity"). */
export class StocktakeFieldError extends DomainValueError {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.field = field;
  }
}

/** Only yards and workshops are counted (0.2 #31). */
export function isCountableLocation(type: LocationType): boolean {
  return type === "YARD" || type === "WORKSHOP";
}

export function assertCountableLocation(type: LocationType): void {
  if (!isCountableLocation(type)) {
    throw new DomainValueError(STOCKTAKE_MESSAGES.siteRefused);
  }
}

/**
 * A time the phone recorded, moved by how far the phone clock is from the
 * server clock when it sent, then kept inside [session start, server now]
 * (design D3).
 */
export function adjustDeviceTime(input: {
  at: Date;
  deviceNow: Date;
  serverNow: Date;
  startedAt: Date;
}): Date {
  const offset = input.serverNow.getTime() - input.deviceNow.getTime();
  const moved = input.at.getTime() + offset;
  const clamped = Math.min(
    Math.max(moved, input.startedAt.getTime()),
    input.serverNow.getTime(),
  );
  return new Date(clamped);
}

/** Counted − book at "Xong mã này", in thousandths (design D2). */
export function lineDifference(
  countedMilli: number,
  bookMilli: number,
): number {
  return countedMilli - bookMilli;
}

export interface FlagInput {
  readonly itemId: string;
  readonly countedMilli: number | null;
  readonly bookMilli: number | null;
  /** The ledger had a line of this pair here while the item was counted. */
  readonly moved: boolean;
}

/** |difference| above OVER_PCT_THRESHOLD % of the book, or stock off the book. */
function overThreshold(countedMilli: number, bookMilli: number): boolean {
  const off = Math.abs(lineDifference(countedMilli, bookMilli));
  if (bookMilli <= 0) return off > 0;
  return off * 100 > OVER_PCT_THRESHOLD * bookMilli;
}

/** The warning flags of each line, in line order (design D6). */
export function stocktakeFlags(lines: readonly FlagInput[]): StocktakeFlag[][] {
  const short = new Set<string>();
  const surplus = new Set<string>();
  for (const line of lines) {
    if (line.countedMilli === null || line.bookMilli === null) continue;
    const difference = lineDifference(line.countedMilli, line.bookMilli);
    if (difference < 0) short.add(line.itemId);
    if (difference > 0) surplus.add(line.itemId);
  }
  return lines.map((line) => {
    if (line.countedMilli === null || line.bookMilli === null) return [];
    const flags: StocktakeFlag[] = [];
    if (line.moved) flags.push("MOVED");
    if (overThreshold(line.countedMilli, line.bookMilli)) {
      flags.push("OVER_PCT");
    }
    const difference = lineDifference(line.countedMilli, line.bookMilli);
    if (
      difference !== 0 &&
      short.has(line.itemId) &&
      surplus.has(line.itemId)
    ) {
      flags.push("CONDITION_SWAP");
    }
    return flags;
  });
}

/** "Lệch 1,2 %", "Sổ 0, đếm được 6", "Có nhập/xuất trong lúc đếm". */
export function flagLabel(
  flag: StocktakeFlag,
  line: { countedMilli: number; bookMilli: number },
): string {
  switch (flag) {
    case "MOVED":
      return "Có nhập/xuất trong lúc đếm";
    case "CONDITION_SWAP":
      return "Nghi nhầm tình trạng";
    case "OVER_PCT": {
      if (line.bookMilli <= 0) {
        return `Sổ ${groupFormatter.format(line.bookMilli / K)}, đếm được ${groupFormatter.format(line.countedMilli / K)}`;
      }
      const share =
        (Math.abs(lineDifference(line.countedMilli, line.bookMilli)) * 100) /
        line.bookMilli;
      return `Lệch ${percentFormatter.format(Math.round(share * 10) / 10)} %`;
    }
  }
}

export interface SummaryLine {
  readonly unit: QuantityUnit;
  readonly countedMilli: number | null;
  readonly bookMilli: number | null;
  /** Average cost now (or booked, once posted); null when never priced. */
  readonly unitCost: Money | null;
  readonly flags: readonly StocktakeFlag[];
}

export interface SummaryBucket {
  readonly lines: number;
  /** Thousandths by unit, signed. */
  readonly quantity: Readonly<Record<QuantityUnit, number>>;
  readonly value: number;
}

export interface StocktakeSummary {
  readonly counted: number;
  readonly total: number;
  readonly shortage: SummaryBucket;
  readonly surplus: SummaryBucket;
  readonly matched: number;
  readonly flagged: number;
  /** Σ difference × unit cost of the lines with a cost. */
  readonly value: number;
}

/** Value of one line: difference × unit cost; null without a cost. */
export function differenceValue(line: SummaryLine): Money | null {
  if (line.countedMilli === null || line.bookMilli === null) return null;
  if (line.unitCost === null) return null;
  return lineAmount(
    lineDifference(line.countedMilli, line.bookMilli),
    line.unitCost,
  );
}

/** The four D13 tiles and the total (design D13). */
export function stocktakeSummary(
  lines: readonly SummaryLine[],
): StocktakeSummary {
  const bucket = () => ({
    lines: 0,
    quantity: { PIECE: 0, KG: 0 } as Record<QuantityUnit, number>,
    value: 0,
  });
  const shortage = bucket();
  const surplus = bucket();
  let counted = 0;
  let matched = 0;
  let flagged = 0;
  for (const line of lines) {
    if (line.countedMilli === null || line.bookMilli === null) continue;
    counted += 1;
    if (line.flags.length > 0) flagged += 1;
    const difference = lineDifference(line.countedMilli, line.bookMilli);
    if (difference === 0) {
      matched += 1;
      continue;
    }
    const target = difference < 0 ? shortage : surplus;
    target.lines += 1;
    target.quantity[line.unit] += difference;
    target.value += differenceValue(line) ?? 0;
  }
  return {
    counted,
    total: lines.length,
    shortage,
    surplus,
    matched,
    flagged,
    value: shortage.value + surplus.value,
  };
}

export interface PostingLine {
  readonly itemId: string;
  readonly condition: Condition;
  readonly countedMilli: number | null;
  readonly bookMilli: number | null;
  readonly unitCost: number | null;
}

/**
 * The quantity adjustment lines an approved session posts: one per line
 * off the book, none for matched or uncounted lines (design D9).
 */
export function stocktakeAdjustmentLines(
  locationId: string,
  lines: readonly PostingLine[],
): AdjustmentLineInput[] {
  const result: AdjustmentLineInput[] = [];
  for (const line of lines) {
    if (line.countedMilli === null || line.bookMilli === null) continue;
    const difference = lineDifference(line.countedMilli, line.bookMilli);
    if (difference === 0) continue;
    result.push({
      lineType: "QUANTITY",
      itemId: line.itemId,
      condition: line.condition,
      toCondition: null,
      locationId,
      toLocationId: null,
      quantityMilli: difference,
      unitCost: line.unitCost,
      valueDelta: null,
    });
  }
  return result;
}

/** ADJUST_IN / ADJUST_OUT drafts of a session; empty when all match. */
export function stocktakeMovements(
  code: string,
  locationCode: string,
  locationId: string,
  lines: readonly PostingLine[],
): MovementDraft[] {
  const adjustments = stocktakeAdjustmentLines(locationId, lines);
  if (adjustments.length === 0) return [];
  return adjustmentMovements(code, `Kiểm kê ${locationCode}`, adjustments);
}

export interface SessionLine {
  readonly itemId: string;
  readonly condition: Condition;
  readonly counted: boolean;
  readonly recount: boolean;
}

export interface SubmittedItem {
  readonly itemId: string;
  readonly itemCode: string;
  readonly unit: QuantityUnit;
  readonly lines: readonly {
    readonly condition: Condition;
    readonly quantityMilli: number;
  }[];
}

/**
 * Checks one submission against the session (design D7, D10): every line
 * still to count of a sent item has a number, pieces are whole, and a
 * recount round only takes the lines asked for (or new ones).
 */
export function assertSubmission(
  session: readonly SessionLine[],
  items: readonly SubmittedItem[],
): void {
  const recountRound = session.some((line) => line.recount);
  if (items.length === 0 && !session.some((line) => line.counted)) {
    throw new DomainValueError(STOCKTAKE_MESSAGES.nothingCounted);
  }
  const seenItems = new Set<string>();
  items.forEach((item, index) => {
    const field = `items.${index}`;
    if (seenItems.has(item.itemId)) {
      throw new StocktakeFieldError(
        STOCKTAKE_MESSAGES.duplicateItem(item.itemCode),
        field,
      );
    }
    seenItems.add(item.itemId);
    if (item.lines.length === 0) {
      throw new StocktakeFieldError(
        STOCKTAKE_MESSAGES.noLines(item.itemCode),
        field,
      );
    }
    const own = session.filter((line) => line.itemId === item.itemId);
    const sent = new Set<Condition>();
    item.lines.forEach((line, lineIndex) => {
      const lineField = `${field}.lines.${lineIndex}.quantity`;
      if (sent.has(line.condition)) {
        throw new StocktakeFieldError(
          STOCKTAKE_MESSAGES.duplicateCondition(item.itemCode, line.condition),
          lineField,
        );
      }
      sent.add(line.condition);
      if (!Number.isInteger(line.quantityMilli) || line.quantityMilli < 0) {
        throw new StocktakeFieldError(
          STOCKTAKE_MESSAGES.negative(item.itemCode),
          lineField,
        );
      }
      if (item.unit === "PIECE" && line.quantityMilli % K !== 0) {
        throw new StocktakeFieldError(
          STOCKTAKE_MESSAGES.wholePieces(item.itemCode),
          lineField,
        );
      }
      const existing = own.find((row) => row.condition === line.condition);
      if (
        recountRound &&
        existing !== undefined &&
        existing.counted &&
        !existing.recount
      ) {
        throw new StocktakeFieldError(
          STOCKTAKE_MESSAGES.noRecount(item.itemCode),
          lineField,
        );
      }
    });
    for (const line of own) {
      const required = recountRound ? !line.counted || line.recount : true;
      if (required && !sent.has(line.condition)) {
        throw new StocktakeFieldError(
          STOCKTAKE_MESSAGES.missingCondition(line.condition),
          field,
        );
      }
    }
  });
  // A line the director sent back must come back counted: sending without
  // it would drop its difference at approval.
  const missing = session.filter(
    (line) =>
      line.recount &&
      !items.some(
        (item) =>
          item.itemId === line.itemId &&
          item.lines.some((sent) => sent.condition === line.condition),
      ),
  ).length;
  if (missing > 0) {
    throw new StocktakeFieldError(
      STOCKTAKE_MESSAGES.recountMissing(missing),
      "items",
    );
  }
}

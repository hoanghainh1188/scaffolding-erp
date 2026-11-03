// Return notes (returns-and-compensation design D1, D2, D6; 0.2 #61–#63):
// what a storekeeper may count back from a site, how the site's Mới / Tốt
// stock is drawn for each outcome, the first price of Phế liệu and the value
// lost on the way. Pure: the service reads stock and costs, then calls these.
import { lineAmount } from "./average-cost";
import { type Condition } from "./condition";
import { DomainValueError } from "./errors";
import { lineWeightKgMilli } from "./landed-cost";
import { toMoney, type Money } from "./money";
import type { MovementDraft } from "./movement";
import {
  formatQuantity,
  isCountUnit,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "./quantity";

export const RETURN_NOTE_PREFIX = "PTH";
export const RETURN_PLATE_MAX = 20;
export const RETURN_NOTE_MAX = 500;

/** Where a returned piece ends up; LOST leaves the books at the site. */
export const RETURN_OUTCOMES = [
  "GOOD",
  "NEEDS_REPAIR",
  "SCRAP",
  "LOST",
] as const;
export type ReturnOutcome = (typeof RETURN_OUTCOMES)[number];

export const RETURN_OUTCOME_LABELS: Readonly<Record<ReturnOutcome, string>> = {
  GOOD: "Tốt",
  NEEDS_REPAIR: "Chờ sửa",
  SCRAP: "Phế liệu",
  LOST: "Mất",
};

/** The site is drawn in this order for every outcome (design D1). */
export const SITE_DRAW_ORDER = ["NEW", "GOOD"] as const;
export type SiteCondition = (typeof SITE_DRAW_ORDER)[number];

const amount = (milli: number, unit: QuantityUnit) =>
  `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;

export const RETURN_MESSAGES = {
  noLines:
    "Phiếu thu hồi chưa có hàng nào. Nhập số trả về hoặc số mất của ít nhất một mã.",
  negative: (code: string) => `${code}: số lượng không được âm.`,
  wholePieces: (code: string, unit: QuantityUnit) =>
    `${code} tính theo ${QUANTITY_UNIT_LABELS[unit]}, số lượng phải là số nguyên`,
  duplicate: (code: string) =>
    `${code} có hai dòng trên phiếu. Gộp lại thành một dòng.`,
  notOnSite: (code: string, contractCode: string) =>
    `${code} không có ở công trình của hợp đồng ${contractCode}. Hàng của hợp đồng khác cần lập phiếu thu hồi riêng.`,
  tooMany: (
    code: string,
    unit: QuantityUnit,
    countedMilli: number,
    onSiteMilli: number,
  ) =>
    `${code}: trả về và mất (${amount(countedMilli, unit)}) nhiều hơn số đang ở công trình (${amount(onSiteMilli, unit)}). Kiểm tra lại số đếm.`,
  notRental: "Chỉ thu hồi được hàng của hợp đồng thuê đang thực hiện",
  notYard: "Hàng thu hồi phải về một bãi. Chọn bãi nhận hàng.",
  plateLong: `Biển số xe tối đa ${RETURN_PLATE_MAX} ký tự.`,
  noteLong: `Ghi chú tối đa ${RETURN_NOTE_MAX} ký tự.`,
  noScrapPrice:
    "Chưa có đơn giá sắt vụn tham chiếu. Vui lòng cập nhật đơn giá trong Cài đặt.",
  noWeight: (code: string) =>
    `${code} chưa được khai báo trọng lượng chuẩn, không thể tính giá vốn phế liệu`,
} as const;

/** Counts of one item on a note, in thousandths of the item's unit. */
export interface ReturnCounts {
  readonly goodMilli: number;
  readonly repairMilli: number;
  readonly scrapMilli: number;
  readonly lostMilli: number;
}

export interface ReturnLineInput {
  readonly itemId: string;
  readonly itemCode: string;
  readonly unit: QuantityUnit;
  readonly counts: ReturnCounts;
}

/** Stock of an item at the contract's site, by condition. */
export type OnSite = Readonly<Record<SiteCondition, number>>;

export const returnedMilli = (counts: ReturnCounts): number =>
  counts.goodMilli + counts.repairMilli + counts.scrapMilli;

export const countedMilli = (counts: ReturnCounts): number =>
  returnedMilli(counts) + counts.lostMilli;

const outcomeMilli = (counts: ReturnCounts, outcome: ReturnOutcome): number =>
  ({
    GOOD: counts.goodMilli,
    NEEDS_REPAIR: counts.repairMilli,
    SCRAP: counts.scrapMilli,
    LOST: counts.lostMilli,
  })[outcome];

const siteTotal = (stock: OnSite | undefined) =>
  stock ? stock.NEW + stock.GOOD : 0;

/**
 * The lines a note may post (design D6): no negative or fractional pieces,
 * no empty lines, only items at the contract's site, never more than is
 * there. Empty lines are dropped; a note with none left is refused.
 */
export function assertReturnLines(
  contractCode: string,
  lines: readonly ReturnLineInput[],
  onSite: ReadonlyMap<string, OnSite>,
): ReturnLineInput[] {
  const seen = new Set<string>();
  const kept: ReturnLineInput[] = [];
  for (const line of lines) {
    const values = Object.values(line.counts);
    if (values.some((value) => value < 0)) {
      throw new DomainValueError(RETURN_MESSAGES.negative(line.itemCode));
    }
    if (isCountUnit(line.unit) && values.some((value) => value % 1000 !== 0)) {
      throw new DomainValueError(
        RETURN_MESSAGES.wholePieces(line.itemCode, line.unit),
      );
    }
    if (seen.has(line.itemId)) {
      throw new DomainValueError(RETURN_MESSAGES.duplicate(line.itemCode));
    }
    seen.add(line.itemId);
    const counted = countedMilli(line.counts);
    if (counted === 0) continue;
    const stock = siteTotal(onSite.get(line.itemId));
    if (stock <= 0) {
      throw new DomainValueError(
        RETURN_MESSAGES.notOnSite(line.itemCode, contractCode),
      );
    }
    if (counted > stock) {
      throw new DomainValueError(
        RETURN_MESSAGES.tooMany(line.itemCode, line.unit, counted, stock),
      );
    }
    kept.push(line);
  }
  if (kept.length === 0) throw new DomainValueError(RETURN_MESSAGES.noLines);
  return kept;
}

/** Inputs for the first price of Phế liệu (0.2 #62). */
export interface ScrapPricing {
  /** Company average of the item's Phế liệu; null = never had a line. */
  readonly scrapAvg: Money | null;
  /** Company average of the site conditions, to cap the scrap price. */
  readonly siteAvg: Readonly<Record<SiteCondition, Money | null>>;
  /** kg per unit as numeric(10,3) text; null when the item has none. */
  readonly standardWeightKg: string | null;
  /** Reference scrap price per kg at posting; null when none was set. */
  readonly scrapPricePerKg: Money | null;
}

/**
 * Unit cost of Phế liệu that has no average yet: min(kg of one unit × scrap
 * price, cost of the condition it leaves the site as), to 1 ₫.
 */
export function firstScrapUnitCost(
  itemCode: string,
  unit: QuantityUnit,
  pricing: ScrapPricing,
  source: SiteCondition,
): Money {
  if (pricing.scrapPricePerKg === null) {
    throw new DomainValueError(RETURN_MESSAGES.noScrapPrice);
  }
  const kgMilli = lineWeightKgMilli(unit, 1000, pricing.standardWeightKg);
  if (kgMilli <= 0)
    throw new DomainValueError(RETURN_MESSAGES.noWeight(itemCode));
  const atScrapPrice = lineAmount(kgMilli, pricing.scrapPricePerKg);
  const sourceCost = pricing.siteAvg[source];
  return toMoney(
    sourceCost === null ? atScrapPrice : Math.min(atScrapPrice, sourceCost),
  );
}

export interface AllocateInput {
  readonly code: string;
  readonly siteLocationId: string;
  readonly yardLocationId: string;
  readonly line: ReturnLineInput;
  readonly onSite: OnSite;
  /** Needed only when the line has Phế liệu. */
  readonly scrap?: ScrapPricing;
}

interface Chunk {
  source: SiteCondition;
  outcome: ReturnOutcome;
  milli: number;
}

/** Splits each outcome over the site's Mới, then Tốt (design D1). */
export function drawFromSite(counts: ReturnCounts, onSite: OnSite): Chunk[] {
  const left: Record<SiteCondition, number> = { ...onSite };
  const chunks: Chunk[] = [];
  for (const outcome of RETURN_OUTCOMES) {
    let need = outcomeMilli(counts, outcome);
    for (const source of SITE_DRAW_ORDER) {
      const take = Math.min(need, left[source]);
      if (take <= 0) continue;
      chunks.push({ source, outcome, milli: take });
      left[source] -= take;
      need -= take;
    }
  }
  return chunks;
}

/**
 * The ledger lines of one item (design D1, D2): one RETURN_OUT per site
 * condition, one RETURN_IN per outcome at the yard (paired with the first
 * out line it draws on), one LOSS_OUT per site condition for lost pieces.
 */
export function allocateReturn(input: AllocateInput): MovementDraft[] {
  const { line } = input;
  const chunks = drawFromSite(line.counts, input.onSite);
  const drafts: MovementDraft[] = [];
  const outIndex = new Map<SiteCondition, number>();
  const base = { itemId: line.itemId };

  for (const source of SITE_DRAW_ORDER) {
    const milli = chunks
      .filter((c) => c.source === source && c.outcome !== "LOST")
      .reduce((sum, c) => sum + c.milli, 0);
    if (milli === 0) continue;
    outIndex.set(source, drafts.length);
    drafts.push({
      ...base,
      condition: source,
      locationId: input.siteLocationId,
      movement: "RETURN_OUT",
      quantityMilli: -milli,
      description: `${input.code}: Thu hồi về bãi`,
    });
  }

  for (const outcome of RETURN_OUTCOMES) {
    if (outcome === "LOST") continue;
    const parts = chunks.filter((c) => c.outcome === outcome);
    const milli = parts.reduce((sum, c) => sum + c.milli, 0);
    const first = parts[0];
    if (milli === 0 || !first) continue;
    const condition: Condition = outcome;
    const draft: MovementDraft = {
      ...base,
      condition,
      locationId: input.yardLocationId,
      movement: "RETURN_IN",
      quantityMilli: milli,
      description: `${input.code}: Nhập thu hồi`,
    };
    const firstScrap =
      outcome === "SCRAP" &&
      (input.scrap === undefined || input.scrap.scrapAvg === null);
    if (firstScrap) {
      if (!input.scrap)
        throw new DomainValueError(RETURN_MESSAGES.noScrapPrice);
      // No pair: postMovements prefers a paired cost to unitCost.
      drafts.push({
        ...draft,
        unitCost: firstScrapUnitCost(
          line.itemCode,
          line.unit,
          input.scrap,
          first.source,
        ),
      });
    } else {
      drafts.push({ ...draft, pairedWith: outIndex.get(first.source) ?? 0 });
    }
  }

  for (const source of SITE_DRAW_ORDER) {
    const milli = chunks
      .filter((c) => c.source === source && c.outcome === "LOST")
      .reduce((sum, c) => sum + c.milli, 0);
    if (milli === 0) continue;
    drafts.push({
      ...base,
      condition: source,
      locationId: input.siteLocationId,
      movement: "LOSS_OUT",
      quantityMilli: -milli,
      description: `${input.code}: Mất ở công trình`,
    });
  }
  return drafts;
}

export interface PostedValueLine {
  readonly movement: string;
  readonly amount: number;
}

export interface ReturnValueSummary {
  /** Value that left the books as goods turned worse (design D1). */
  readonly conditionLoss: Money;
  /** Cost of the lost pieces (design D2). */
  readonly lostValue: Money;
}

/** "Giá trị giảm do đổi tình trạng" and "Giá trị hàng mất", from the ledger. */
export function returnValueSummary(
  lines: readonly PostedValueLine[],
): ReturnValueSummary {
  let out = 0;
  let into = 0;
  let lost = 0;
  for (const row of lines) {
    if (row.movement === "RETURN_OUT") out += -row.amount;
    else if (row.movement === "RETURN_IN") into += row.amount;
    else if (row.movement === "LOSS_OUT") lost += -row.amount;
  }
  return { conditionLoss: toMoney(out - into), lostValue: toMoney(lost) };
}

// Simple repair slips (simple-repair design D1, D6, D9; requirements 0.2
// #3, #10, #23): needs-repair stock goes to Good or Scrap. Scrap is valued
// at the reference scrap price (never above its needs-repair cost); what
// the scrap loses is carried by the repaired pieces, or booked as a damage
// loss when nothing was repaired. Pure functions, shared by D12 and the
// server.
import { dict } from "../locales";
import { averageAfterInflow, lineAmount, roundHalfUp } from "./average-cost";
import type { BusinessDate } from "./business-date";
import { DomainValueError } from "./errors";
import { LANDED_COST_MESSAGES, lineWeightKgMilli } from "./landed-cost";
import { formatMoney, toMoney, type Money } from "./money";
import type { MovementDraft } from "./movement";
import type { QuantityUnit } from "./quantity";
import type { Anomaly } from "./receipt-anomalies";

export const REPAIR_PREFIX = "PSC";
export const REPAIR_DOCUMENT_TYPE = "REPAIR";
export const REPAIRED_BY_MAX = 100;
export const REPAIR_NOTE_MAX = 500;

const K = 1000;

export const REPAIR_MESSAGES = {
  noLines: dict.repairs.messages.noLines,
  tooManyLines: dict.repairs.messages.tooManyLines,
  kgItem: dict.repairs.messages.kgItem,
  duplicate: dict.repairs.messages.duplicateItem,
  wholePieces: dict.repairs.messages.wholePieces,
  negative: dict.repairs.messages.quantityNegative,
  takenZero: dict.repairs.messages.takenZero,
  sumMismatch: (code: string, sum: number, taken: number) =>
    `${code}: ${sumMismatchText(sum, taken)}`,
  cost: dict.repairs.messages.cost,
  costWithoutGood: dict.repairs.messages.costWithoutGood,
  futureDate: dict.repairs.messages.futureDate,
  noScrapPrice: LANDED_COST_MESSAGES.noScrapPrice,
  noWeight: dict.repairs.messages.noWeight,
  repairedByTooLong: dict.repairs.messages.repairedByTooLong(REPAIRED_BY_MAX),
  noteTooLong: dict.repairs.messages.noteTooLong(REPAIR_NOTE_MAX),
} as const;

/** "sửa xong + phế liệu (34) phải bằng số lấy ra (40)", for the D12 row. */
export function sumMismatchText(sum: number, taken: number): string {
  return dict.repairs.messages.sumMismatch(pieces(sum), pieces(taken));
}

const groupFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

/** Whole pieces from thousandths, grouped like the rest of the app. */
function pieces(milli: number): string {
  return groupFormatter.format(milli / K);
}

/** A rule broken by one field of the slip ("lines.0.quantityGood"). */
export class RepairFieldError extends DomainValueError {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.field = field;
  }
}

export interface RepairLineInput {
  readonly itemId: string;
  readonly itemCode: string;
  readonly unit: QuantityUnit;
  /** Quantities in thousandths of a piece. */
  readonly takenMilli: number;
  readonly goodMilli: number;
  readonly scrapMilli: number;
  readonly repairCost: number;
}

function assertWhole(
  line: RepairLineInput,
  index: number,
  name: "quantityTaken" | "quantityGood" | "quantityScrap",
  milli: number,
): void {
  const field = `lines.${index}.${name}`;
  if (!Number.isInteger(milli) || milli % K !== 0) {
    throw new RepairFieldError(
      REPAIR_MESSAGES.wholePieces(line.itemCode),
      field,
    );
  }
  if (milli < 0) {
    throw new RepairFieldError(REPAIR_MESSAGES.negative(line.itemCode), field);
  }
}

function checkLine(line: RepairLineInput, index: number): void {
  if (line.unit !== "PIECE") {
    throw new RepairFieldError(
      REPAIR_MESSAGES.kgItem(line.itemCode),
      `lines.${index}.itemId`,
    );
  }
  assertWhole(line, index, "quantityTaken", line.takenMilli);
  assertWhole(line, index, "quantityGood", line.goodMilli);
  assertWhole(line, index, "quantityScrap", line.scrapMilli);
  if (line.takenMilli === 0) {
    throw new RepairFieldError(
      REPAIR_MESSAGES.takenZero(line.itemCode),
      `lines.${index}.quantityTaken`,
    );
  }
  const sum = line.goodMilli + line.scrapMilli;
  if (sum !== line.takenMilli) {
    throw new RepairFieldError(
      REPAIR_MESSAGES.sumMismatch(line.itemCode, sum, line.takenMilli),
      `lines.${index}.quantityGood`,
    );
  }
  if (!Number.isSafeInteger(line.repairCost) || line.repairCost < 0) {
    throw new RepairFieldError(
      REPAIR_MESSAGES.cost,
      `lines.${index}.repairCost`,
    );
  }
  if (line.repairCost > 0 && line.goodMilli === 0) {
    throw new RepairFieldError(
      REPAIR_MESSAGES.costWithoutGood(line.itemCode),
      `lines.${index}.repairCost`,
    );
  }
}

/**
 * The line rules of a slip (spec "Luật số lượng của dòng hàng", "Mã hàng
 * trên phiếu", "Chi phí sửa theo từng mã"). Throws on the first broken one.
 */
export function checkRepairLines(lines: readonly RepairLineInput[]): void {
  if (lines.length === 0) {
    throw new RepairFieldError(REPAIR_MESSAGES.noLines, "lines");
  }
  if (lines.length > 200) {
    throw new RepairFieldError(REPAIR_MESSAGES.tooManyLines, "lines");
  }
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    if (seen.has(line.itemId)) {
      throw new RepairFieldError(
        REPAIR_MESSAGES.duplicate(line.itemCode),
        `lines.${index}.itemId`,
      );
    }
    seen.add(line.itemId);
    checkLine(line, index);
  });
}

/** Ngày sửa xong: any day up to today (it never reaches the ledger). */
export function assertRepairDate(
  date: BusinessDate,
  today: BusinessDate,
): void {
  if (date > today) {
    throw new RepairFieldError(REPAIR_MESSAGES.futureDate, "repairDate");
  }
}

export interface RepairTotals {
  readonly cost: Money;
  readonly goodMilli: number;
  readonly scrapMilli: number;
}

/** Header of D12: total cost, pieces to Good, pieces to Scrap. */
export function repairTotals(
  lines: readonly Pick<
    RepairLineInput,
    "goodMilli" | "scrapMilli" | "repairCost"
  >[],
): RepairTotals {
  return lines.reduce(
    (sum, line) => ({
      cost: toMoney(sum.cost + line.repairCost),
      goodMilli: sum.goodMilli + line.goodMilli,
      scrapMilli: sum.scrapMilli + line.scrapMilli,
    }),
    { cost: toMoney(0), goodMilli: 0, scrapMilli: 0 },
  );
}

export interface ScrapValueInput {
  readonly itemCode: string;
  readonly scrapMilli: number;
  /** kg per piece as numeric(10,3) text; null when the item has none. */
  readonly standardWeightKg: string | null;
  readonly scrapPricePerKg: Money | null;
  /** B: average cost of the item in Chờ sửa, read when posting. */
  readonly needsRepairAvg: Money;
}

/** Kg of the scrap pieces, in thousandths (shown next to the count). */
export function scrapKgMilli(
  scrapMilli: number,
  standardWeightKg: string | null,
): number {
  return lineWeightKgMilli("PIECE", scrapMilli, standardWeightKg);
}

/**
 * V = min(kg × scrap price, pieces × B), to 1 ₫ with halves up. No scrap,
 * no price needed. Missing price or weight is refused, never guessed.
 */
export function scrapValue(input: ScrapValueInput): Money {
  if (input.scrapMilli === 0) return toMoney(0);
  if (input.scrapPricePerKg === null) {
    throw new DomainValueError(REPAIR_MESSAGES.noScrapPrice);
  }
  const kgMilli = scrapKgMilli(input.scrapMilli, input.standardWeightKg);
  if (kgMilli <= 0) {
    throw new DomainValueError(REPAIR_MESSAGES.noWeight(input.itemCode));
  }
  const atScrapPrice = lineAmount(kgMilli, input.scrapPricePerKg);
  const atRepairCost = lineAmount(input.scrapMilli, input.needsRepairAvg);
  return toMoney(Math.min(atScrapPrice, atRepairCost));
}

export interface RepairLineCost {
  /** B used for the line. */
  readonly needsRepairAvg: Money;
  /** Value booked into Scrap (V). */
  readonly scrapValue: Money;
  /** Pieces × B − V: carried by the repaired pieces or lost (D). */
  readonly damage: Money;
  /** D when nothing was repaired; 0 otherwise. */
  readonly loss: Money;
  /** Value booked into Good: G × B + C + D (0 without repaired pieces). */
  readonly goodAmount: Money;
  /** Good amount ÷ G to 1 ₫; null without repaired pieces. */
  readonly goodUnitCost: Money | null;
}

/** Unit cost into Good: (G × B + C + D) ÷ G, halves up (spec, 0.2 #10). */
export function goodUnitCost(
  needsRepairAvg: Money,
  goodMilli: number,
  repairCost: Money,
  damage: Money,
): Money {
  if (goodMilli <= 0) throw new RangeError("goodMilli must be > 0");
  const amount =
    BigInt(goodMilli) * BigInt(needsRepairAvg) +
    (BigInt(repairCost) + BigInt(damage)) * BigInt(K);
  return toMoney(Number(roundHalfUp(amount, BigInt(goodMilli))));
}

/** "÷ G" parts of the D12 cost block, each rounded on its own. */
export function perRepairedPiece(amount: Money, goodMilli: number): Money {
  if (goodMilli <= 0) throw new RangeError("goodMilli must be > 0");
  return toMoney(
    Number(roundHalfUp(BigInt(amount) * BigInt(K), BigInt(goodMilli))),
  );
}

/** Every figure of one slip line (design D1). */
export function costRepairLine(
  line: Pick<
    RepairLineInput,
    "itemCode" | "goodMilli" | "scrapMilli" | "repairCost"
  >,
  facts: {
    needsRepairAvg: Money;
    standardWeightKg: string | null;
    scrapPricePerKg: Money | null;
  },
): RepairLineCost {
  const B = facts.needsRepairAvg;
  const value = scrapValue({
    itemCode: line.itemCode,
    scrapMilli: line.scrapMilli,
    standardWeightKg: facts.standardWeightKg,
    scrapPricePerKg: facts.scrapPricePerKg,
    needsRepairAvg: B,
  });
  const damage = toMoney(lineAmount(line.scrapMilli, B) - value);
  const cost = toMoney(line.repairCost);
  if (line.goodMilli === 0) {
    return {
      needsRepairAvg: B,
      scrapValue: value,
      damage,
      loss: damage,
      goodAmount: toMoney(0),
      goodUnitCost: null,
    };
  }
  return {
    needsRepairAvg: B,
    scrapValue: value,
    damage,
    loss: toMoney(0),
    goodAmount: toMoney(lineAmount(line.goodMilli, B) + cost + damage),
    goodUnitCost: goodUnitCost(B, line.goodMilli, cost, damage),
  };
}

export interface PostingLine {
  readonly itemId: string;
  readonly itemCode: string;
  readonly takenMilli: number;
  readonly goodMilli: number;
  readonly scrapMilli: number;
  readonly cost: RepairLineCost;
}

/**
 * Ledger lines of a slip, per line in this order (design D1): REPAIR_OUT
 * from Chờ sửa at B, REPAIR_IN to Tốt, REPAIR_IN to Phế liệu. Zero lines
 * are left out.
 */
export function repairPostingLines(
  code: string,
  lines: readonly PostingLine[],
  places: { fromLocationId: string; toLocationId: string },
): MovementDraft[] {
  const drafts: MovementDraft[] = [];
  for (const line of lines) {
    const description = `${code}: sửa ${line.itemCode}`;
    drafts.push({
      itemId: line.itemId,
      condition: "NEEDS_REPAIR",
      locationId: places.fromLocationId,
      movement: "REPAIR_OUT",
      quantityMilli: -line.takenMilli,
      description: `${code}: đưa ${line.itemCode} đi sửa`,
    });
    if (line.goodMilli > 0) {
      drafts.push({
        itemId: line.itemId,
        condition: "GOOD",
        locationId: places.toLocationId,
        movement: "REPAIR_IN",
        quantityMilli: line.goodMilli,
        amount: line.cost.goodAmount,
        description,
      });
    }
    if (line.scrapMilli > 0) {
      drafts.push({
        itemId: line.itemId,
        condition: "SCRAP",
        locationId: places.toLocationId,
        movement: "REPAIR_IN",
        quantityMilli: line.scrapMilli,
        amount: line.cost.scrapValue,
        description: `${code}: ${line.itemCode} hỏng hẳn`,
      });
    }
  }
  return drafts;
}

/** Average after the inflow, for the "Giá vốn BQ Tốt: … → …" preview. */
export function previewAverage(
  pool: { poolMilli: number; avgCost: Money | null },
  quantityMilli: number,
  amount: Money,
): Money {
  return averageAfterInflow(pool, quantityMilli, amount);
}

export function repairAnomalyKey(itemCode: string): string {
  return `line:${itemCode}`;
}

export interface RepairAnomalyLine {
  readonly itemCode: string;
  readonly goodMilli: number;
  readonly repairCost: number;
  /** Average cost of the item in Tốt now; null when it never had one. */
  readonly goodAvg: Money | null;
}

/**
 * Lines whose repair cost per piece is above the current Good average
 * (design D6). Compared as C > avg × G in integers; the damage carried
 * from scrap is not part of it.
 */
export function repairAnomalies(
  lines: readonly RepairAnomalyLine[],
): Anomaly[] {
  const found: Anomaly[] = [];
  lines.forEach((line, index) => {
    if (line.goodMilli === 0 || line.goodAvg === null) return;
    const over =
      BigInt(line.repairCost) * BigInt(K) >
      BigInt(line.goodAvg) * BigInt(line.goodMilli);
    if (!over) return;
    const perPiece = formatMoney(
      perRepairedPiece(toMoney(line.repairCost), line.goodMilli),
    );
    found.push({
      key: repairAnomalyKey(line.itemCode),
      field: `lines.${index}.repairCost`,
      question: `${line.itemCode}: chi phí sửa ${perPiece}/cái, cao hơn giá vốn Tốt ${formatMoney(line.goodAvg)}. Đúng không?`,
      note: `chi phí cao ${line.itemCode} ${perPiece}/cái`,
    });
  });
  return found;
}

/** "PSC-2026-024 · đã xác nhận chi phí cao GG-K17 300.000 ₫/cái"; null if none. */
export function repairPostedNote(
  code: string,
  confirmed: readonly Anomaly[],
): string | null {
  if (confirmed.length === 0) return null;
  return `${code} · đã xác nhận ${confirmed.map((anomaly) => anomaly.note).join("; ")}`;
}

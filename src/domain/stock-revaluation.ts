// Value adjustments (stock-value-adjustment design D1, D2, D4; requirements
// 0.2 #10, #24, #35): the new average after a change of value, the ledger
// lines of an approved document, and the lines a corrected trip cost gives.
import { dict } from "../locales";
import { roundHalfUp, type CostPool } from "./average-cost";
import { CONDITION_LABELS, CONDITIONS, type Condition } from "./condition";
import { DomainValueError } from "./errors";
import { formatMoney, toMoney, type Money } from "./money";
import type { MovementDraft } from "./movement";
import { costTrip, type TripCostInput } from "./receipt-cost";

const MILLI = 1000n;

/** "−280.000 ₫" / "+610.000 ₫". */
export function signedMoney(value: number): string {
  const text = formatMoney(toMoney(Math.abs(value)));
  return value < 0 ? `−${text}` : `+${text}`;
}

const pairLabel = (code: string, condition: Condition) =>
  `${code} ${CONDITION_LABELS[condition]}`;

export const REVALUE_MESSAGES = {
  deltaZero: dict.inventory.revalueMessages.deltaZero,
  deltaWhole: dict.inventory.revalueMessages.deltaWhole,
  duplicate: (code: string, condition: Condition) =>
    dict.inventory.revalueMessages.duplicate(pairLabel(code, condition)),
  soldOut: (code: string, condition: Condition) =>
    dict.inventory.revalueMessages.soldOut(pairLabel(code, condition)),
  negative: (code: string, condition: Condition, value: number) =>
    dict.inventory.revalueMessages.negative(
      pairLabel(code, condition),
      signedMoney(value).replace("+", "")
    ),
  relatedMissing: dict.inventory.revalueMessages.relatedMissing,
  relatedNotFound: dict.inventory.revalueMessages.relatedNotFound,
  pairNotInRelated: (related: string, code: string, condition: Condition) =>
    dict.inventory.revalueMessages.pairNotInRelated(related, pairLabel(code, condition)),
  tripCost: dict.inventory.revalueMessages.tripCost,
  tripUnchanged: dict.inventory.revalueMessages.tripUnchanged,
  tripNotReproducible: dict.inventory.revalueMessages.tripNotReproducible,
  tripOpen: dict.inventory.revalueMessages.tripOpen,
} as const;

/** A change of value: a whole number of đồng, not 0. */
export function assertValueDelta(value: number): Money {
  if (!Number.isSafeInteger(value)) {
    throw new DomainValueError(REVALUE_MESSAGES.deltaWhole);
  }
  if (value === 0) throw new DomainValueError(REVALUE_MESSAGES.deltaZero);
  return toMoney(value);
}

export interface ValueLine {
  readonly itemId: string;
  readonly condition: Condition;
  readonly valueDelta: Money;
}

/** Each (item + condition) at most once on a document. */
export function assertValueLines(
  lines: readonly ValueLine[],
  codeOf: (itemId: string) => string,
): void {
  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.itemId}|${line.condition}`;
    if (seen.has(key)) {
      throw new DomainValueError(
        REVALUE_MESSAGES.duplicate(codeOf(line.itemId), line.condition),
      );
    }
    seen.add(key);
  }
}

export interface RevaluedPair {
  readonly code: string;
  readonly condition: Condition;
}

/**
 * (stock × average + delta) ÷ stock over every location, to 1 ₫ with
 * halves up (0.2 #10, #24, #35). Refuses an empty pool and a value that
 * would go below zero; a value of exactly 0 gives an average of 0 ₫.
 */
export function averageAfterRevalue(
  pool: CostPool,
  delta: Money,
  pair: RevaluedPair,
): Money {
  if (pool.poolMilli <= 0 || pool.avgCost === null) {
    throw new DomainValueError(
      REVALUE_MESSAGES.soldOut(pair.code, pair.condition),
    );
  }
  const poolMilli = BigInt(pool.poolMilli);
  const valueMilli = poolMilli * BigInt(pool.avgCost) + BigInt(delta) * MILLI;
  if (valueMilli < 0n) {
    throw new DomainValueError(
      REVALUE_MESSAGES.negative(
        pair.code,
        pair.condition,
        Number(roundHalfUp(valueMilli, MILLI)),
      ),
    );
  }
  return toMoney(Number(roundHalfUp(valueMilli, poolMilli)));
}

/** Current value of a pool: stock × average, to 1 ₫. */
export function poolValue(pool: CostPool): Money {
  if (pool.avgCost === null || pool.poolMilli === 0) return toMoney(0);
  return toMoney(
    Number(roundHalfUp(BigInt(pool.poolMilli) * BigInt(pool.avgCost), MILLI)),
  );
}

/** "Giảm giá trị 1.500.000 ₫ · sửa PN-2026-094". */
export function revalueDescription(delta: number, related: string): string {
  const verb = delta < 0 ? "Giảm" : "Tăng";
  return `${verb} giá trị ${formatMoney(toMoney(Math.abs(delta)))} · sửa ${related}`;
}

/** One REVALUE ledger line per document line: no quantity, no location. */
export function revaluationMovements(
  related: string,
  lines: readonly ValueLine[],
): MovementDraft[] {
  return lines.map((line) => ({
    itemId: line.itemId,
    condition: line.condition,
    locationId: null,
    movement: "REVALUE",
    quantityMilli: 0,
    amount: line.valueDelta,
    description: revalueDescription(line.valueDelta, related),
  }));
}

export interface TripRevaluationInput {
  readonly receiptCode: string;
  /** The receipt as it was costed, without its costs. */
  readonly trip: Omit<TripCostInput, "costs">;
  /** Item of each order line on the trip. */
  readonly itemOf: ReadonlyMap<string, string>;
  /** The trip cost the ledger holds now (receipt, or latest correction). */
  readonly recordedCost: Money;
  readonly correctedCost: number;
  /** Value booked per "itemId|condition": PURCHASE_IN + posted corrections. */
  readonly booked: ReadonlyMap<string, number>;
}

function valueByPair(
  input: TripRevaluationInput,
  costs: Money,
): Map<string, number> {
  const costed = costTrip({ ...input.trip, costs });
  const values = new Map<string, number>();
  for (const line of costed.lines) {
    const itemId = input.itemOf.get(line.orderLineId) ?? "";
    for (const condition of CONDITIONS) {
      const value = line.byCondition[condition];
      if (value === undefined) continue;
      const key = `${itemId}|${condition}`;
      values.set(key, (values.get(key) ?? 0) + value);
    }
  }
  return values;
}

const sameValues = (
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
) => a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);

/**
 * The lines that move a trip from its recorded cost to the corrected one,
 * split exactly as the receipt was (design D4). The recorded cost must
 * first give back what the ledger holds, or the split cannot be trusted.
 */
export function revaluationFromTrip(input: TripRevaluationInput): ValueLine[] {
  if (!Number.isSafeInteger(input.correctedCost) || input.correctedCost < 0) {
    throw new DomainValueError(REVALUE_MESSAGES.tripCost);
  }
  const recorded = valueByPair(input, input.recordedCost);
  if (!sameValues(recorded, input.booked)) {
    throw new DomainValueError(
      REVALUE_MESSAGES.tripNotReproducible(input.receiptCode),
    );
  }
  const corrected = valueByPair(input, toMoney(input.correctedCost));
  const lines: ValueLine[] = [];
  for (const [key, value] of corrected) {
    const delta = value - (recorded.get(key) ?? 0);
    if (delta === 0) continue;
    const [itemId, condition] = key.split("|") as [string, Condition];
    lines.push({ itemId, condition, valueDelta: toMoney(delta) });
  }
  if (lines.length === 0) {
    throw new DomainValueError(REVALUE_MESSAGES.tripUnchanged);
  }
  return lines;
}

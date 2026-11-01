// Landed cost (purchase-orders spec landed-cost, design D3, D5): split the
// purchase costs of an order or a trip over its lines, and split a used lot
// over the conditions it is sorted into. Every split sums to the exact đồng:
// largest remainder, computed in bigint. Pure: purchase orders use it for the
// D3 preview, goods-receipt for the cost that goes into the ledger.
import { dict } from "../locales";

import { lineAmount, unitCostOf } from "./average-cost";
import { DomainValueError } from "./errors";
import { toMoney, type Money } from "./money";
import { quantityFromDb, type QuantityUnit } from "./quantity";

/** How a user splits costs; QUANTITY is only used to split a lot (D5). */
export const ALLOCATION_METHODS = ["VALUE", "WEIGHT"] as const;
export type AllocationMethod = (typeof ALLOCATION_METHODS)[number];
export type AllocationBasis = AllocationMethod | "QUANTITY";

export const ALLOCATION_METHOD_LABELS: Readonly<
  Record<AllocationMethod, string>
> = {
  VALUE: "Theo giá trị",
  WEIGHT: "Theo trọng lượng",
};

export const LANDED_COST_MESSAGES = {
  zeroValue: dict.purchasing.costs.zeroValue,
  noGoods: dict.purchasing.costs.noGoods,
  noScrapPrice: dict.purchasing.costs.noScrapPrice,
  noWeight: dict.purchasing.costs.noWeight,
} as const;

export interface AllocationLine {
  /** Line value in đồng (quantity × unit price). */
  readonly amount: Money;
  /** Weight in thousandths of a kg (lineWeightKgMilli). */
  readonly weightKgMilli: number;
  /** Quantity in thousandths of the line unit; 0 takes no cost. */
  readonly quantityMilli: number;
}

function basisOf(line: AllocationLine, basis: AllocationBasis): bigint {
  if (line.quantityMilli === 0) return 0n;
  switch (basis) {
    case "VALUE":
      return BigInt(line.amount);
    case "WEIGHT":
      return BigInt(line.weightKgMilli);
    case "QUANTITY":
      return BigInt(line.quantityMilli);
  }
}

/**
 * Splits `parts` whole units over `weights`: each gets the floor of its
 * exact share, and the units left go one by one to the largest remainders
 * (the earlier one first on a tie). The parts always add up to `parts`.
 */
function largestRemainder(parts: bigint, weights: readonly bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  const shares = weights.map((weight) => (parts * weight) / sum);
  const remainders = weights.map((weight, index) => ({
    index,
    rest: (parts * weight) % sum,
  }));
  let left = parts - shares.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) =>
    a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1,
  );
  for (const { index } of remainders) {
    if (left === 0n) break;
    shares[index] = (shares[index] ?? 0n) + 1n;
    left -= 1n;
  }
  return shares;
}

function assertNonNegative(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}

/**
 * Splits `total` over the lines by value, weight or quantity (spec
 * landed-cost). Returns one amount per line, in the same order.
 */
export function allocate(
  total: Money,
  lines: readonly AllocationLine[],
  basis: AllocationBasis,
): Money[] {
  assertNonNegative(total, "total");
  for (const line of lines) {
    assertNonNegative(line.amount, "amount");
    assertNonNegative(line.weightKgMilli, "weightKgMilli");
    assertNonNegative(line.quantityMilli, "quantityMilli");
  }
  if (total === 0) return lines.map(() => toMoney(0));
  if (!lines.some((line) => line.quantityMilli > 0)) {
    throw new DomainValueError(LANDED_COST_MESSAGES.noGoods);
  }
  const weights = lines.map((line) => basisOf(line, basis));
  if (weights.every((weight) => weight === 0n)) {
    throw new DomainValueError(
      basis === "VALUE"
        ? LANDED_COST_MESSAGES.zeroValue
        : LANDED_COST_MESSAGES.noGoods,
    );
  }
  return largestRemainder(BigInt(total), weights).map((part) =>
    toMoney(Number(part)),
  );
}

/**
 * Weight of a line in thousandths of a kg: pieces × standard weight for a
 * line ordered by the piece, the kg themselves for a line ordered by kg.
 */
export function lineWeightKgMilli(
  unit: QuantityUnit,
  quantityMilli: number,
  standardWeightKg: string | null,
): number {
  if (unit === "KG") return quantityMilli;
  const weight = standardWeightKg
    ? quantityFromDb(standardWeightKg, "KG")
    : null;
  if (!weight || weight.milli <= 0) return 0;
  return Number((BigInt(quantityMilli) * BigInt(weight.milli)) / 1000n);
}

/** Landed cost of one unit: (value + allocated) ÷ quantity, to 1 ₫. */
export function landedUnitCost(
  amount: Money,
  allocated: Money,
  quantityMilli: number,
): Money {
  return unitCostOf(toMoney(amount + allocated), quantityMilli);
}

export interface LotSplitInput {
  /** T: received goods value + allocated costs of the line. */
  readonly total: Money;
  /** Unit of the item (not of the order line). */
  readonly unit: QuantityUnit;
  readonly standardWeightKg: string | null;
  readonly goodMilli: number;
  readonly repairMilli: number;
  readonly scrapMilli: number;
  /** Reference scrap price per kg; needed when scrap shares a lot. */
  readonly scrapPricePerKg: Money | null;
}

export interface LotSplit {
  readonly GOOD: Money;
  readonly NEEDS_REPAIR: Money;
  readonly SCRAP: Money;
}

/**
 * Splits a used lot over its conditions (design D5, requirements 0.2 #27):
 * scrap takes kg × the reference scrap price (never more than T), good and
 * needs-repair share the rest by count. An all-scrap lot takes all of T.
 */
export function splitLotByCondition(input: LotSplitInput): LotSplit {
  const { total, goodMilli, repairMilli, scrapMilli } = input;
  assertNonNegative(total, "total");
  const zero = toMoney(0);
  const usable = goodMilli + repairMilli;
  if (scrapMilli > 0 && usable === 0) {
    return { GOOD: zero, NEEDS_REPAIR: zero, SCRAP: total };
  }
  let scrap = zero;
  if (scrapMilli > 0) {
    if (input.scrapPricePerKg === null) {
      throw new DomainValueError(LANDED_COST_MESSAGES.noScrapPrice);
    }
    const kgMilli =
      input.unit === "KG"
        ? scrapMilli
        : lineWeightKgMilli("PIECE", scrapMilli, input.standardWeightKg);
    if (kgMilli <= 0) throw new DomainValueError(LANDED_COST_MESSAGES.noWeight);
    const value = lineAmount(kgMilli, input.scrapPricePerKg);
    scrap = toMoney(Math.min(value, total));
  }
  const rest = toMoney(total - scrap);
  if (usable === 0) {
    if (total > 0) throw new DomainValueError(LANDED_COST_MESSAGES.noGoods);
    return { GOOD: zero, NEEDS_REPAIR: zero, SCRAP: zero };
  }
  const [good = zero, repair = zero] = allocate(
    rest,
    [
      { amount: zero, weightKgMilli: 0, quantityMilli: goodMilli },
      { amount: zero, weightKgMilli: 0, quantityMilli: repairMilli },
    ],
    "QUANTITY",
  );
  return { GOOD: good, NEEDS_REPAIR: repair, SCRAP: scrap };
}

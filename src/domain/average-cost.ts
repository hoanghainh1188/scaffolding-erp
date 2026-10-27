// Weighted average cost per (item + condition), pooled over every location
// (inventory-ledger design D2, D3; requirements 0.2 #1, #10, #24). All
// products go through bigint: thousandths of a unit × đồng can pass 2^53.
import { DomainValueError } from "./errors";
import { toMoney, type Money } from "./money";

const MILLI = 1000n;

export const COST_MESSAGES = {
  inflowQuantity: "Dòng làm đổi giá vốn phải có số lượng dương",
  inflowAmount: "Giá trị dòng nhập phải là số nguyên không âm",
  negativePool: "Tồn tính giá vốn không được âm",
} as const;

/**
 * n ÷ d rounded to the nearest integer, halves away from zero (so a
 * positive 100,5 becomes 101, decision 0.2 #10). d must be positive.
 */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be > 0");
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  return sign * ((2n * magnitude + denominator) / (2n * denominator));
}

/** The cost pool of one (item + condition) just before a ledger line. */
export interface CostPool {
  /** Stock at every location, in thousandths of the unit. */
  readonly poolMilli: number;
  /** Null while the pair has never had a ledger line. */
  readonly avgCost: Money | null;
}

/**
 * The average after stock comes in from outside (opening, purchase,
 * repaired): (pool × avg + amount) ÷ (pool + quantity), rounded to 1 ₫.
 * With an empty pool the old average does not count.
 */
export function averageAfterInflow(
  pool: CostPool,
  quantityMilli: number,
  amount: Money,
): Money {
  if (!Number.isInteger(quantityMilli) || quantityMilli <= 0) {
    throw new DomainValueError(COST_MESSAGES.inflowQuantity);
  }
  if (!Number.isInteger(amount) || amount < 0) {
    throw new DomainValueError(COST_MESSAGES.inflowAmount);
  }
  if (pool.poolMilli < 0)
    throw new DomainValueError(COST_MESSAGES.negativePool);
  const before =
    pool.poolMilli > 0 && pool.avgCost !== null
      ? BigInt(pool.poolMilli) * BigInt(pool.avgCost)
      : 0n;
  const poolBefore = pool.avgCost === null ? 0n : BigInt(pool.poolMilli);
  const total = before + BigInt(amount) * MILLI;
  return toMoney(
    Number(roundHalfUp(total, poolBefore + BigInt(quantityMilli))),
  );
}

/** Signed value of a line booked at a unit cost: quantity × cost, to 1 ₫. */
export function lineAmount(quantityMilli: number, unitCost: Money): Money {
  return toMoney(
    Number(roundHalfUp(BigInt(quantityMilli) * BigInt(unitCost), MILLI)),
  );
}

/** Unit cost shown for an inflow line: amount ÷ quantity, to 1 ₫. */
export function unitCostOf(amount: Money, quantityMilli: number): Money {
  if (!Number.isInteger(quantityMilli) || quantityMilli === 0) {
    throw new DomainValueError(COST_MESSAGES.inflowQuantity);
  }
  const quantity = BigInt(Math.abs(quantityMilli));
  return toMoney(
    Number(roundHalfUp(BigInt(Math.abs(amount)) * MILLI, quantity)),
  );
}

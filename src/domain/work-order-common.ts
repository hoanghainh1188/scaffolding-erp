// What repair work orders and production orders share (production-orders
// design D1): piece-rate labour, supplies split New first then Good, and
// the value of a supply issue. Pure functions.
import { lineAmount } from "./average-cost";
import { DomainValueError } from "./errors";
import { toMoney, type Money } from "./money";

const K = 1000;

/** Labour of a line: finished or repaired pieces × the rate taken on assignment. */
export function laborAmount(goodMilli: number, rate: Money): Money {
  if (!Number.isInteger(goodMilli) || goodMilli < 0 || goodMilli % K !== 0) {
    throw new RangeError("goodMilli must be whole pieces");
  }
  return toMoney((goodMilli / K) * rate);
}

export interface MaterialStock {
  /** New and Good stock of the supply at the workshop, thousandths. */
  readonly newMilli: number;
  readonly goodMilli: number;
}

export interface MaterialIssue {
  readonly newMilli: number;
  readonly goodMilli: number;
}

/**
 * New first, then Good (0.2 số 127). `shortMessage` receives what is left:
 * each kind of order words the refusal itself.
 */
export function splitMaterialIssue(
  needMilli: number,
  stock: MaterialStock,
  shortMessage: (haveMilli: number) => string,
): MaterialIssue {
  const have = stock.newMilli + stock.goodMilli;
  if (needMilli > have) {
    throw new DomainValueError(shortMessage(Math.max(have, 0)));
  }
  const fromNew = Math.min(needMilli, stock.newMilli);
  return { newMilli: fromNew, goodMilli: needMilli - fromNew };
}

/**
 * Value of one supply issue at the average cost, positive: the same
 * rounding as the outflow line postMovements writes, so a line's value and
 * the ledger agree to the đồng.
 */
export function issueAmount(quantityMilli: number, avgCost: Money): Money {
  return toMoney(-lineAmount(-quantityMilli, avgCost));
}

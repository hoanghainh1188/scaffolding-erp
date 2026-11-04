import { DomainValueError } from "./errors";
import {
  addQuantity,
  subtractQuantity,
  toQuantity,
  type Quantity,
} from "./quantity";

export type ConditionSplitStatus = "balanced" | "under" | "over";

export interface ConditionSplitResult {
  /** Sum of the parts entered so far. */
  allocated: Quantity;
  /** total − allocated; negative when the parts exceed the total. */
  remaining: Quantity;
  status: ConditionSplitStatus;
}

/**
 * Checks how a counted total is split into Tốt / Chờ sửa / Phế liệu (/ Mất).
 * Every part must use the total's unit.
 */
export function computeConditionSplit(
  total: Quantity,
  parts: readonly Quantity[],
): ConditionSplitResult {
  const allocated = parts.reduce(addQuantity, toQuantity(0, total.unit));
  const remaining = subtractQuantity(total, allocated);
  const status: ConditionSplitStatus =
    remaining.milli === 0 ? "balanced" : remaining.milli > 0 ? "under" : "over";
  return { allocated, remaining, status };
}

/** Conditions rented goods can have at a site, drawn in this order. */
export const SITE_DRAW_ORDER = ["NEW", "GOOD"] as const;
export type SiteCondition = (typeof SITE_DRAW_ORDER)[number];

/** Stock of one item at a site, by condition, in thousandths. */
export type SiteStock = Readonly<Record<SiteCondition, number>>;

export interface SiteDraw {
  /** What is taken from each condition. */
  taken: SiteStock;
  /** What is left at the site after the draw. */
  left: SiteStock;
}

export const SITE_DRAW_MESSAGE = "Không đủ hàng ở công trình để rút.";

/**
 * Takes `milli` from a site, Mới first, then Tốt (0.2 #62, #66, #67). Callers
 * check the total beforehand with their own message; this is the last guard.
 */
export function drawNewFirst(milli: number, stock: SiteStock): SiteDraw {
  if (milli < 0 || milli > stock.NEW + stock.GOOD) {
    throw new DomainValueError(SITE_DRAW_MESSAGE);
  }
  const fromNew = Math.min(milli, stock.NEW);
  const taken = { NEW: fromNew, GOOD: milli - fromNew };
  return {
    taken,
    left: { NEW: stock.NEW - taken.NEW, GOOD: stock.GOOD - taken.GOOD },
  };
}

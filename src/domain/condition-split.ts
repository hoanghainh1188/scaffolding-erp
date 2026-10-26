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

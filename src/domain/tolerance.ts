// The one weighing tolerance (requirements 0.2 #47, #57): a measured amount
// (kg, m) may go up to 10 % over its limit; exactly 10 % passes (scale or
// tape drift). Receiving more than ordered and delivering a sale by kg both
// read it here. Count units have no tolerance.
const TOLERANCE_NUMERATOR = 11n;
const TOLERANCE_DENOMINATOR = 10n;

/** The tolerance as a percentage, for messages ("quá 10 %"). */
export const WEIGHT_TOLERANCE_PERCENT = 10;

/** actual ≤ limit × 110 %, both in thousandths of the same unit. */
export function withinTolerance(
  actualMilli: number,
  limitMilli: number,
): boolean {
  return (
    BigInt(actualMilli) * TOLERANCE_DENOMINATOR <=
    BigInt(limitMilli) * TOLERANCE_NUMERATOR
  );
}

/** The most that still passes: limit × 110 %, rounded down to 0,001. */
export function toleranceLimit(limitMilli: number): number {
  return Number(
    (BigInt(limitMilli) * TOLERANCE_NUMERATOR) / TOLERANCE_DENOMINATOR,
  );
}

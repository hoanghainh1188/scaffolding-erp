// Numbers on D13 (stocktake design D15): money as domain-values writes it
// ("-930.000 ₫"), with "+" on surpluses so a difference reads at a glance.
import { formatMoney, toMoney } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";

/** "+260.000 ₫", "-2.788.056 ₫", "0 ₫". */
export function signedMoney(value: number): string {
  return `${value > 0 ? "+" : ""}${formatMoney(toMoney(value))}`;
}

/** "+10", "-30", "0" from thousandths. */
export function signedQuantity(milli: number, unit: QuantityUnit): string {
  const text = formatQuantity(toQuantity(Math.abs(milli), unit));
  if (milli > 0) return `+${text}`;
  return milli < 0 ? `-${text}` : text;
}

/** "-42 cái", "+12 cái · +2,25 kg", "0 cái". */
export function signedQuantities(
  byUnit: Readonly<Record<QuantityUnit, number>>,
): string {
  const parts = (["PIECE", "KG"] as const)
    .filter((unit) => byUnit[unit] !== 0)
    .map(
      (unit) =>
        `${signedQuantity(byUnit[unit], unit)} ${QUANTITY_UNIT_LABELS[unit]}`,
    );
  return parts.length ? parts.join(" · ") : `0 ${QUANTITY_UNIT_LABELS.PIECE}`;
}

/** "1.226" from thousandths, or "–" when not counted. */
export function quantityText(milli: number | null, unit: QuantityUnit): string {
  return milli === null ? "–" : formatQuantity(toQuantity(milli, unit));
}

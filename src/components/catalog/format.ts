import { formatMoney, toMoney } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  quantityFromDb,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";

/** "/m", "/bó"; nothing for pieces, the usual unit (design D8). */
function perUnit(unit: QuantityUnit | undefined): string {
  const label = unit === undefined ? null : QUANTITY_UNIT_LABELS[unit];
  return label === null || label === QUANTITY_UNIT_LABELS.PIECE
    ? ""
    : `/${label}`;
}

/** "13,5 kg", "3,56 kg/m", "25 kg/bó", or "–" for items counted in kg. */
export function formatWeight(
  standardWeightKg: string | null,
  unit?: QuantityUnit,
): string {
  return standardWeightKg === null
    ? "–"
    : `${formatQuantity(quantityFromDb(standardWeightKg, "KG"))} kg${perUnit(unit)}`;
}

/** "43,6 kg" from thousandths of a kg. */
export function formatWeightMilli(milli: number): string {
  return `${formatQuantity(toQuantity(milli, "KG"))} kg`;
}

/** "1.200 ₫", "150 ₫/m", or "–" when there is no price. */
export function formatPrice(value: number | null, unit?: QuantityUnit): string {
  return value === null
    ? "–"
    : `${formatMoney(toMoney(value))}${perUnit(unit)}`;
}

/** Monthly rent is always the daily rent × 30 (requirements 0.2 #4). */
export function monthlyPrice(daily: number | null): number | null {
  return daily === null ? null : daily * 30;
}

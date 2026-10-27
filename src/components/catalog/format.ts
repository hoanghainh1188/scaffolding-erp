import { formatMoney, toMoney } from "@/domain/money";
import { formatQuantity, quantityFromDb, toQuantity } from "@/domain/quantity";

/** "13,5 kg", or "–" for items counted in kg. */
export function formatWeight(standardWeightKg: string | null): string {
  return standardWeightKg === null
    ? "–"
    : `${formatQuantity(quantityFromDb(standardWeightKg, "KG"))} kg`;
}

/** "43,6 kg" from thousandths of a kg. */
export function formatWeightMilli(milli: number): string {
  return `${formatQuantity(toQuantity(milli, "KG"))} kg`;
}

/** "1.200 ₫", or "–" when there is no price. */
export function formatPrice(value: number | null): string {
  return value === null ? "–" : formatMoney(toMoney(value));
}

/** Monthly rent is always the daily rent × 30 (requirements 0.2 #4). */
export function monthlyPrice(daily: number | null): number | null {
  return daily === null ? null : daily * 30;
}

import { DomainValueError } from "./errors";
import {
  hasStandardWeight,
  isCountUnit,
  toQuantity,
  type Quantity,
  type QuantityUnit,
} from "./quantity";

const MILLI_PER_UNIT = 1000;

export const WEIGHT_MESSAGES = {
  noWeight: "Nhập trọng lượng chuẩn lớn hơn 0 kg",
  kgItem: "Vật tư tính theo kg, không quy đổi",
  wrongUnit: "Sai đơn vị khi quy đổi kg",
} as const;

/**
 * The standard weight (kg per unit) of an item, for conversions. Items
 * counted in kg have none (requirements 0.2 #3).
 */
export function pieceWeight(
  unit: QuantityUnit,
  standardWeightKg: Quantity | null,
): Quantity {
  if (!hasStandardWeight(unit)) {
    throw new DomainValueError(WEIGHT_MESSAGES.kgItem);
  }
  if (!standardWeightKg || standardWeightKg.milli <= 0) {
    throw new DomainValueError(WEIGHT_MESSAGES.noWeight);
  }
  return standardWeightKg;
}

function assertWeight(weight: Quantity) {
  if (weight.unit !== "KG")
    throw new DomainValueError(WEIGHT_MESSAGES.wrongUnit);
  if (weight.milli <= 0) throw new DomainValueError(WEIGHT_MESSAGES.noWeight);
}

/**
 * Quantity × kg per unit, rounded to 0.001 kg (halves up). Also gives the kg
 * shown next to scrap that stays counted in its own unit (0.2 #3).
 * 120,5 m × 3,56 kg/m = 428,98 kg.
 */
export function unitsToKg(quantity: Quantity, weight: Quantity): Quantity {
  if (!hasStandardWeight(quantity.unit)) {
    throw new DomainValueError(WEIGHT_MESSAGES.wrongUnit);
  }
  assertWeight(weight);
  const sign = quantity.milli < 0 ? -1 : 1;
  const product = Math.abs(quantity.milli) * weight.milli;
  const kgMilli = Math.floor(
    (2 * product + MILLI_PER_UNIT) / (2 * MILLI_PER_UNIT),
  );
  return toQuantity(sign * kgMilli, "KG");
}

/**
 * Estimated quantity in a weight: kg ÷ kg per unit. Count units round to the
 * nearest whole unit, metres to 0.001 m, halves up. Integer arithmetic on
 * thousandths, so no float drift.
 */
export function kgToUnits(
  kg: Quantity,
  weight: Quantity,
  unit: QuantityUnit,
): Quantity {
  if (kg.unit !== "KG") throw new DomainValueError(WEIGHT_MESSAGES.wrongUnit);
  if (!hasStandardWeight(unit)) {
    throw new DomainValueError(WEIGHT_MESSAGES.kgItem);
  }
  assertWeight(weight);
  const sign = kg.milli < 0 ? -1 : 1;
  const magnitude = Math.abs(kg.milli);
  if (isCountUnit(unit)) {
    const whole = Math.floor(
      (2 * magnitude + weight.milli) / (2 * weight.milli),
    );
    return toQuantity(sign * whole * MILLI_PER_UNIT, unit);
  }
  const milli = Math.floor(
    (2 * magnitude * MILLI_PER_UNIT + weight.milli) / (2 * weight.milli),
  );
  return toQuantity(sign * milli, unit);
}

/** Pieces × kg per piece (kept for existing callers). */
export function piecesToKg(pieces: Quantity, weight: Quantity): Quantity {
  return unitsToKg(pieces, weight);
}

/** Estimated pieces in a weight (kept for existing callers). */
export function kgToPieces(kg: Quantity, weight: Quantity): Quantity {
  return kgToUnits(kg, weight, "PIECE");
}

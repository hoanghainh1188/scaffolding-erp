import { DomainValueError } from "./errors";
import { toQuantity, type Quantity, type QuantityUnit } from "./quantity";

const MILLI_PER_UNIT = 1000;

export const WEIGHT_MESSAGES = {
  noWeight: "Nhập trọng lượng chuẩn lớn hơn 0 kg",
  kgItem: "Vật tư tính theo kg, không quy đổi sang cái",
  wrongUnit: "Sai đơn vị khi quy đổi kg và cái",
} as const;

/**
 * The standard weight (kg per piece) of an item, for conversions. Items
 * counted in kg have none (requirements 0.2 #3).
 */
export function pieceWeight(
  unit: QuantityUnit,
  standardWeightKg: Quantity | null,
): Quantity {
  if (unit === "KG") throw new DomainValueError(WEIGHT_MESSAGES.kgItem);
  if (!standardWeightKg || standardWeightKg.milli <= 0) {
    throw new DomainValueError(WEIGHT_MESSAGES.noWeight);
  }
  return standardWeightKg;
}

function assertUnits(value: Quantity, unit: QuantityUnit, weight: Quantity) {
  if (value.unit !== unit || weight.unit !== "KG") {
    throw new DomainValueError(WEIGHT_MESSAGES.wrongUnit);
  }
  if (weight.milli <= 0) throw new DomainValueError(WEIGHT_MESSAGES.noWeight);
}

/**
 * Pieces × kg per piece, exact to 0.001 kg. Also gives the kg shown next to
 * scrap that stays counted in pieces (requirements 0.2 #3).
 */
export function piecesToKg(pieces: Quantity, weight: Quantity): Quantity {
  assertUnits(pieces, "PIECE", weight);
  return toQuantity((pieces.milli / MILLI_PER_UNIT) * weight.milli, "KG");
}

/**
 * Estimated pieces in a weight: kg ÷ kg per piece, rounded to the nearest
 * piece with halves up. Integer arithmetic on thousandths, so no float drift.
 */
export function kgToPieces(kg: Quantity, weight: Quantity): Quantity {
  assertUnits(kg, "KG", weight);
  const sign = kg.milli < 0 ? -1 : 1;
  const magnitude = Math.abs(kg.milli);
  const pieces = Math.floor(
    (2 * magnitude + weight.milli) / (2 * weight.milli),
  );
  return toQuantity(sign * pieces * MILLI_PER_UNIT, "PIECE");
}

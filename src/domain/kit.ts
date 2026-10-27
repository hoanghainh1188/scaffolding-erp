import { toMoney, type Money } from "./money";
import { toQuantity, type Quantity, type QuantityUnit } from "./quantity";

export const KIT_MESSAGES = {
  pieceOnly: "Bộ chỉ gồm vật tư tính theo cái",
  tooSmall: "Bộ phải có ít nhất 2 linh kiện",
  duplicate: "Mỗi vật tư chỉ một dòng trong bộ",
  quantity: "Số lượng mỗi linh kiện là số nguyên từ 1 trở lên",
  archived: (code: string) => `Vật tư ${code} đã ngừng dùng`,
} as const;

export interface KitLineCheck {
  itemId: string;
  code: string;
  unit: QuantityUnit;
  status: "ACTIVE" | "ARCHIVED";
  quantity: number;
}

/** First rule a kit's lines break (master-data design D2), or null. */
export function validateKitComponents(
  lines: readonly KitLineCheck[],
): string | null {
  const seen = new Set<string>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      return KIT_MESSAGES.quantity;
    }
    if (seen.has(line.itemId)) return KIT_MESSAGES.duplicate;
    seen.add(line.itemId);
    if (line.unit !== "PIECE") return KIT_MESSAGES.pieceOnly;
    if (line.status !== "ACTIVE") return KIT_MESSAGES.archived(line.code);
  }
  const pieces = lines.reduce((sum, line) => sum + line.quantity, 0);
  return pieces < 2 ? KIT_MESSAGES.tooSmall : null;
}

export interface KitLineValue {
  quantity: number;
  /** kg per piece. */
  standardWeightKg: Quantity;
  /** null: the item is not for rent. */
  dailyRentalPrice: Money | null;
}

export interface KitTotals {
  weight: Quantity;
  /** null when any part is not for rent. */
  rentalPerDay: Money | null;
}

/**
 * Weight and daily rent of one kit, from its parts' current values. Never
 * stored: a price change on a part shows up at once (requirements 0.2 #4b).
 */
export function kitTotals(lines: readonly KitLineValue[]): KitTotals {
  const weightMilli = lines.reduce(
    (sum, line) => sum + line.quantity * line.standardWeightKg.milli,
    0,
  );
  const forRent = lines.every((line) => line.dailyRentalPrice !== null);
  const rent = lines.reduce(
    (sum, line) => sum + line.quantity * (line.dailyRentalPrice ?? 0),
    0,
  );
  return {
    weight: toQuantity(weightMilli, "KG"),
    rentalPerDay: forRent ? toMoney(rent) : null,
  };
}

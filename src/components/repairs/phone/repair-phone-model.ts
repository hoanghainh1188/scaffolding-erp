// What M8 keeps in its draft and sends (repair-work-orders spec
// repair-mobile): repaired / scrap per item and the supplies used, in
// thousandths so sums are exact. No price anywhere.
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  quantityFromDb,
  quantityToDb,
  sumByUnit,
  toQuantity,
  formatByUnit,
  type QuantityUnit,
} from "@/domain/quantity";
import type { PhoneOrder } from "@/lib/repairs/phone-queries";

export interface PhoneSupplyUse {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  milli: number;
}

export interface PhoneLineDraft {
  goodMilli: number;
  scrapMilli: number;
  materials: PhoneSupplyUse[];
}

export interface RepairPhonePayload {
  lines: Record<string, PhoneLineDraft>;
  /** Filled when the step is sent. */
  step?: "report" | "count";
  body?: object;
}

const milli = (value: string | null, unit: QuantityUnit) =>
  value === null ? 0 : quantityFromDb(value, unit).milli;

/**
 * Start of the draft: the storekeeper starts from what the workshop
 * reported, the workshop from what it reported before (order sent back)
 * or zero.
 */
export function initialPayload(order: PhoneOrder): RepairPhonePayload {
  return {
    lines: Object.fromEntries(
      order.lines.map((line) => [
        line.itemId,
        {
          goodMilli: milli(line.good, line.unit),
          scrapMilli: milli(line.scrap, line.unit),
          materials: line.materials.map((material) => ({
            itemId: material.itemId,
            code: material.code,
            name: material.name,
            unit: material.unit,
            milli: quantityFromDb(material.quantity, material.unit).milli,
          })),
        },
      ]),
    ),
  };
}

export function lineOf(
  payload: RepairPhonePayload,
  itemId: string,
): PhoneLineDraft {
  return (
    payload.lines[itemId] ?? { goodMilli: 0, scrapMilli: 0, materials: [] }
  );
}

/** "Sửa xong + Phế (34) phải bằng số nhận (40)", or null when it adds up. */
export function lineError(
  line: PhoneOrder["lines"][number],
  draft: PhoneLineDraft,
): string | null {
  const taken = milli(line.taken, line.unit);
  const sum = draft.goodMilli + draft.scrapMilli;
  if (sum === taken) return null;
  const text = (value: number) => formatQuantity(toQuantity(value, line.unit));
  return `Sửa xong + Phế (${text(sum)}) phải bằng số nhận (${text(taken)})`;
}

export function allAddUp(order: PhoneOrder, payload: RepairPhonePayload) {
  return order.lines.every(
    (line) => lineError(line, lineOf(payload, line.itemId)) === null,
  );
}

/** "56 sửa xong · 4 phế · đủ 60 / 60". */
export function footerText(
  order: PhoneOrder,
  payload: RepairPhonePayload,
): string {
  const by = (pick: (line: PhoneOrder["lines"][number]) => number) =>
    sumByUnit(
      order.lines.map((line) => ({ unit: line.unit, milli: pick(line) })),
    );
  const good = by((line) => lineOf(payload, line.itemId).goodMilli);
  const scrap = by((line) => lineOf(payload, line.itemId).scrapMilli);
  const done = by(
    (line) =>
      lineOf(payload, line.itemId).goodMilli +
      lineOf(payload, line.itemId).scrapMilli,
  );
  const taken = by((line) => milli(line.taken, line.unit));
  const bare = (amounts: { unit: QuantityUnit; milli: number }[]) =>
    amounts.length === 1 && amounts[0]?.unit === "PIECE"
      ? formatQuantity(toQuantity(amounts[0].milli, "PIECE"))
      : formatByUnit(amounts);
  return `${bare(good)} sửa xong · ${bare(scrap)} phế · đủ ${bare(done)} / ${bare(taken)}`;
}

/** The body of "Báo sửa xong" / "Đếm xong". */
export function stepBody(order: PhoneOrder, payload: RepairPhonePayload) {
  return {
    updatedAt: order.updatedAt,
    lines: order.lines.map((line) => {
      const draft = lineOf(payload, line.itemId);
      return {
        itemId: line.itemId,
        good: quantityToDb(toQuantity(draft.goodMilli, line.unit)),
        scrap: quantityToDb(toQuantity(draft.scrapMilli, line.unit)),
        materials: draft.materials
          .filter((material) => material.milli > 0)
          .map((material) => ({
            itemId: material.itemId,
            quantity: quantityToDb(toQuantity(material.milli, material.unit)),
          })),
      };
    }),
  };
}

/** "nhận 40 cái Chờ sửa". */
export function receivedText(line: PhoneOrder["lines"][number]): string {
  return `nhận ${formatQuantity(quantityFromDb(line.taken, line.unit))} ${QUANTITY_UNIT_LABELS[line.unit]} Chờ sửa`;
}

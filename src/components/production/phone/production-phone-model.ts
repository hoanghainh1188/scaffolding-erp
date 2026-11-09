// What M10 keeps in its draft and sends (spec production-mobile): finished
// pieces, offcuts and the materials used, in thousandths. No price anywhere.
import { normMilli, overuse } from "@/domain/production-order";
import {
  formatByUnit,
  quantityFromDb,
  quantityToDb,
  sumByUnit,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import type {
  ProductionPhoneLine,
  ProductionPhoneMaterial,
  ProductionPhoneOrder,
} from "@/lib/production/phone-queries";

export interface PhoneMaterialDraft {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  /** Per finished piece, thousandths; null: outside the norm. */
  normPerUnitMilli: number | null;
  milli: number;
  /** Typed by hand: changing the pieces leaves it alone. */
  edited: boolean;
}

export interface PhoneLineDraft {
  finishedMilli: number;
  offcutMilli: number;
  materials: PhoneMaterialDraft[];
}

export interface ProductionPhonePayload {
  lines: Record<string, PhoneLineDraft>;
  /** Filled when the step is sent. */
  step?: "report" | "count";
  body?: object;
}

const milli = (value: string | null, unit: QuantityUnit) =>
  value === null ? null : quantityFromDb(value, unit).milli;

function materialDraft(
  material: ProductionPhoneMaterial,
  finishedMilli: number,
): PhoneMaterialDraft {
  const norm = milli(material.normPerUnit, "KG");
  const reported = milli(material.reported, material.unit);
  return {
    itemId: material.itemId,
    code: material.code,
    name: material.name,
    unit: material.unit,
    normPerUnitMilli: norm,
    milli:
      reported ??
      (norm === null ? 0 : normMilli(norm, finishedMilli, material.unit)),
    edited: reported !== null,
  };
}

function lineDraft(line: ProductionPhoneLine): PhoneLineDraft {
  const finishedMilli =
    milli(line.reportedFinished, line.unit) ??
    quantityFromDb(line.planned, line.unit).milli;
  return {
    finishedMilli,
    offcutMilli: milli(line.reportedOffcutKg, "KG") ?? 0,
    materials: line.materials.map((m) => materialDraft(m, finishedMilli)),
  };
}

/**
 * Start of the draft: what the workshop reported (for the storekeeper, or a
 * returned order), else the plan and the norm.
 */
export function initialPayload(
  order: ProductionPhoneOrder,
): ProductionPhonePayload {
  return {
    lines: Object.fromEntries(
      order.lines.map((line) => [line.itemId, lineDraft(line)]),
    ),
  };
}

export function lineOf(
  payload: ProductionPhonePayload,
  itemId: string,
): PhoneLineDraft {
  return (
    payload.lines[itemId] ?? {
      finishedMilli: 0,
      offcutMilli: 0,
      materials: [],
    }
  );
}

const normOf = (material: PhoneMaterialDraft, finishedMilli: number) =>
  material.normPerUnitMilli === null
    ? 0
    : normMilli(material.normPerUnitMilli, finishedMilli, material.unit);

/** New pieces; materials nobody typed follow the norm. */
export function withFinished(
  line: PhoneLineDraft,
  finishedMilli: number,
): PhoneLineDraft {
  return {
    ...line,
    finishedMilli,
    materials: line.materials.map((material) =>
      material.edited
        ? material
        : { ...material, milli: normOf(material, finishedMilli) },
    ),
  };
}

export function withMaterial(
  line: PhoneLineDraft,
  itemId: string,
  value: number,
): PhoneLineDraft {
  return {
    ...line,
    materials: line.materials.map((material) =>
      material.itemId === itemId
        ? { ...material, milli: value, edited: true }
        : material,
    ),
  };
}

/** Rows in the norm go to 0, rows the workshop added disappear. */
export function withoutMaterial(
  line: PhoneLineDraft,
  itemId: string,
): PhoneLineDraft {
  return {
    ...line,
    materials: line.materials.flatMap((material) => {
      if (material.itemId !== itemId) return [material];
      return material.normPerUnitMilli === null
        ? []
        : [{ ...material, milli: 0, edited: true }];
    }),
  };
}

export function withAdded(
  line: PhoneLineDraft,
  added: Pick<PhoneMaterialDraft, "itemId" | "code" | "name" | "unit">,
): PhoneLineDraft {
  return {
    ...line,
    materials: [
      ...line.materials,
      { ...added, normPerUnitMilli: null, milli: 0, edited: true },
    ],
  };
}

/** "Ống D27 vượt định mức 8,6 %: văn phòng sẽ hỏi Giám đốc"; null if fine. */
export function overuseWarning(
  material: PhoneMaterialDraft,
  finishedMilli: number,
): string | null {
  const result = overuse(material.milli, normOf(material, finishedMilli));
  if (!result.over) return null;
  if (result.percentTenths === null) {
    return `${material.name} ngoài định mức: văn phòng sẽ hỏi Giám đốc`;
  }
  const tenths = Math.abs(result.percentTenths);
  const text = `${Math.floor(tenths / 10).toLocaleString("vi-VN")},${tenths % 10}`;
  return `${material.name} vượt định mức ${text} %: văn phòng sẽ hỏi Giám đốc`;
}

/** "300 / 300 cái". */
export function footerText(
  order: ProductionPhoneOrder,
  payload: ProductionPhonePayload,
): string {
  const finished = sumByUnit(
    order.lines.map((line) => ({
      unit: line.unit,
      milli: lineOf(payload, line.itemId).finishedMilli,
    })),
  );
  const planned = sumByUnit(
    order.lines.map((line) => ({
      unit: line.unit,
      milli: quantityFromDb(line.planned, line.unit).milli,
    })),
  );
  const left = finished
    .map((amount) => formatByUnit([amount]).split(" ")[0])
    .join(", ");
  return `${left} / ${formatByUnit(planned)}`;
}

/** "200 / 200 cái · 2 nguyên liệu · 9 kg đầu thừa" of a closed line. */
export function lineSummary(
  line: ProductionPhoneLine,
  draft: PhoneLineDraft,
): string {
  const finished = formatByUnit([
    { unit: line.unit, milli: draft.finishedMilli },
  ]).split(" ")[0];
  const planned = formatByUnit([
    { unit: line.unit, milli: quantityFromDb(line.planned, line.unit).milli },
  ]);
  const used = draft.materials.filter((m) => m.milli > 0).length;
  const offcut = formatByUnit([{ unit: "KG", milli: draft.offcutMilli }]);
  return `${finished} / ${planned} · ${used} nguyên liệu · ${offcut} đầu thừa`;
}

/**
 * The body of "Báo làm xong" / "Đếm xong". `version` is the order's updatedAt
 * stored with the draft, so numbers typed before a change get a 409.
 */
export function stepBody(
  order: ProductionPhoneOrder,
  payload: ProductionPhonePayload,
  version: string,
) {
  return {
    updatedAt: version,
    lines: order.lines.map((line) => {
      const draft = lineOf(payload, line.itemId);
      return {
        itemId: line.itemId,
        finished: quantityToDb(toQuantity(draft.finishedMilli, line.unit)),
        offcutKg: quantityToDb(toQuantity(draft.offcutMilli, "KG")),
        materials: draft.materials.map((material) => ({
          itemId: material.itemId,
          quantity: quantityToDb(toQuantity(material.milli, material.unit)),
        })),
      };
    }),
  };
}

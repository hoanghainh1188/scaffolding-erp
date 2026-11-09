// Production BOMs (production-orders spec production-boms, design D9): one
// per finished item, materials per piece and a piece-rate labour. The
// estimate on D19 is for reference only. Pure functions.
import { lineAmount } from "./average-cost";
import { DomainValueError } from "./errors";
import { toMoney, type Money } from "./money";
import { hasStandardWeight, isCountUnit, type QuantityUnit } from "./quantity";

export type ItemCategory = "EQUIPMENT" | "MATERIAL";

export const BOM_NOTE_MAX = 500;
/** More than this many material rows is a mistake, not a product. */
export const BOM_MATERIALS_MAX = 50;

export const BOM_MESSAGES = {
  finishedKind: "Thành phẩm phải là mã nhóm Thiết bị, đơn vị đếm",
  finishedArchived: (code: string) => `${code} đã ngừng dùng`,
  noMaterials: "Định mức cần ít nhất 1 nguyên liệu",
  tooManyMaterials: `Định mức có tối đa ${BOM_MATERIALS_MAX} nguyên liệu`,
  materialKind: "Nguyên liệu phải là mã nhóm Vật tư",
  materialArchived: (code: string) => `Vật tư ${code} đã ngừng dùng`,
  quantity: "Số lượng / 1 cái phải lớn hơn 0",
  duplicate: (code: string) => `${code} đã có trong định mức`,
  labor: "Đơn giá công phải là số nguyên từ 0 trở lên",
  noteTooLong: `Ghi chú tối đa ${BOM_NOTE_MAX} ký tự`,
  exists: (code: string) => `${code} đã có định mức`,
  stale: "Định mức vừa được người khác sửa, tải lại trang",
  notFound: "Không tìm thấy định mức",
  scrapItem: "Mã sắt vụn phải tính theo kg, nhóm Vật tư",
} as const;

/** A wrong value on a form field; the API answers 422 with the field. */
export class ProductionFieldError extends DomainValueError {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.field = field;
  }
}

export interface BomItem {
  readonly itemId: string;
  readonly itemCode: string;
  readonly unit: QuantityUnit;
  readonly category: ItemCategory;
  readonly active: boolean;
}

export interface BomMaterialInput extends BomItem {
  readonly perUnitMilli: number;
}

export interface BomInput {
  readonly finished: BomItem;
  readonly laborRate: number;
  readonly materials: readonly BomMaterialInput[];
}

/** The finished goods of a BOM or an order line: equipment counted whole. */
export function isFinishedKind(
  item: Pick<BomItem, "category" | "unit">,
): boolean {
  return item.category === "EQUIPMENT" && isCountUnit(item.unit);
}

/** Spec "Định mức của một thành phẩm": throws on the first broken rule. */
export function checkBom(input: BomInput): void {
  if (!isFinishedKind(input.finished)) {
    throw new ProductionFieldError(BOM_MESSAGES.finishedKind, "itemId");
  }
  if (!input.finished.active) {
    throw new ProductionFieldError(
      BOM_MESSAGES.finishedArchived(input.finished.itemCode),
      "itemId",
    );
  }
  if (!Number.isSafeInteger(input.laborRate) || input.laborRate < 0) {
    throw new ProductionFieldError(BOM_MESSAGES.labor, "laborRate");
  }
  if (input.materials.length === 0) {
    throw new ProductionFieldError(BOM_MESSAGES.noMaterials, "materials");
  }
  if (input.materials.length > BOM_MATERIALS_MAX) {
    throw new ProductionFieldError(BOM_MESSAGES.tooManyMaterials, "materials");
  }
  const seen = new Set<string>();
  input.materials.forEach((material, index) => {
    const field = `materials.${index}`;
    if (material.category !== "MATERIAL") {
      throw new ProductionFieldError(
        BOM_MESSAGES.materialKind,
        `${field}.itemId`,
      );
    }
    if (!material.active) {
      throw new ProductionFieldError(
        BOM_MESSAGES.materialArchived(material.itemCode),
        `${field}.itemId`,
      );
    }
    if (seen.has(material.itemId)) {
      throw new ProductionFieldError(
        BOM_MESSAGES.duplicate(material.itemCode),
        `${field}.itemId`,
      );
    }
    seen.add(material.itemId);
    if (
      !Number.isInteger(material.perUnitMilli) ||
      material.perUnitMilli <= 0
    ) {
      throw new ProductionFieldError(
        BOM_MESSAGES.quantity,
        `${field}.quantity`,
      );
    }
  });
}

/** Spec "Mã sắt vụn nhận đầu thừa": kg, material group, in use. */
export function isScrapItemKind(item: {
  unit: QuantityUnit;
  category: ItemCategory;
  active: boolean;
}): boolean {
  return (
    !hasStandardWeight(item.unit) && item.category === "MATERIAL" && item.active
  );
}

export interface EstimateMaterial {
  readonly perUnitMilli: number;
  readonly newAvg: Money | null;
  readonly goodAvg: Money | null;
}

export interface EstimateLine {
  readonly unitPrice: Money | null;
  readonly amount: Money | null;
}

export interface BomEstimate {
  readonly lines: readonly EstimateLine[];
  /** Sum of the priced materials. */
  readonly materials: Money;
  readonly labor: Money;
  /** Null when a material has no price ("chưa đủ giá"). */
  readonly total: Money | null;
}

/** New price, or Good when New has none (spec "Giá thành dự tính"). */
export function bomEstimate(
  materials: readonly EstimateMaterial[],
  laborRate: Money,
): BomEstimate {
  const lines = materials.map((material): EstimateLine => {
    const unitPrice = material.newAvg ?? material.goodAvg;
    return {
      unitPrice,
      amount:
        unitPrice === null
          ? null
          : lineAmount(material.perUnitMilli, unitPrice),
    };
  });
  const sum = lines.reduce((total, line) => total + (line.amount ?? 0), 0);
  const complete = lines.every((line) => line.amount !== null);
  return {
    lines,
    materials: toMoney(sum),
    labor: laborRate,
    total: complete ? toMoney(sum + laborRate) : null,
  };
}

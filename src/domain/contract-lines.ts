// Lines of a contract (contracts design D9): kits split into parts with one
// line (one price) per item on a rental, sale lines by piece or by kg, the
// "khác danh mục" marks and the VAT rate rule.
import { lineAmount } from "./average-cost";
import { DomainValueError } from "./errors";
import type { Money } from "./money";

export const SALE_CONDITIONS = ["NEW", "GOOD", "SCRAP"] as const;
export type SaleCondition = (typeof SALE_CONDITIONS)[number];

export const PRICING_UNITS = ["ITEM", "KG"] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];

const BY_WEIGHT: PricingUnit = "KG";

/** A sale line priced per kg rather than per unit of the item. */
export function byWeight(pricingUnit: string): boolean {
  return pricingUnit === BY_WEIGHT;
}

export const VAT_MAX = 20;

/** Rate the form suggests when VAT is ticked (drawing D5a); editable. */
export const DEFAULT_VAT_RATE = 8;

export const LINE_MESSAGES = {
  quantity: "Số lượng phải lớn hơn 0. Bạn bỏ dòng nếu không thuê mã này.",
  kitQuantity: "Số bộ phải là số nguyên từ 1 trở lên.",
  kitTwice: "Mỗi bộ chỉ thêm một lần. Bạn sửa số bộ ở dòng đã có.",
  lineTwice: (code: string) =>
    `Mã ${code} đã có dòng trên hợp đồng. Bạn sửa số lượng ở dòng đó.`,
  scrapByPiece: "Phế liệu chỉ bán theo kg.",
  noWeight: (code: string) =>
    `Mã ${code} chưa có trọng lượng chuẩn nên chưa bán theo kg được.`,
  condition: "Chọn tình trạng hàng bán (Mới, Tốt hoặc Phế liệu).",
  price: "Giá phải là số nguyên từ 0 ₫ trở lên.",
  vatMissing: "Bạn nhập thuế suất VAT.",
  vatRange: `Thuế suất VAT lớn hơn 0 % và tối đa ${VAT_MAX} %, tối đa 2 chữ số lẻ.`,
} as const;

const fail = (message: string): never => {
  throw new DomainValueError(message);
};

// ----------------------------------------------------------- kits

export interface KitPick {
  kitId: string;
  /** Number of kits. */
  quantity: number;
  /** Parts per kit. */
  components: readonly { itemId: string; quantity: number }[];
}

export interface OwnLine {
  itemId: string;
  /** For the message when the item is listed twice. */
  itemCode?: string;
  /** Pieces added outside kits, in thousandths. */
  ownMilli: number;
}

export interface ExplodedLine {
  itemId: string;
  ownMilli: number;
  kitMilli: number;
  quantityMilli: number;
}

/**
 * Kit × n into parts, merged with the lines added one by one: each item
 * ends on one line. Kit parts come first, in kit order, then the rest.
 */
export function explodeKits(
  kits: readonly KitPick[],
  own: readonly OwnLine[],
): ExplodedLine[] {
  const lines = new Map<string, ExplodedLine>();
  const line = (itemId: string) => {
    const found = lines.get(itemId);
    if (found) return found;
    const fresh = { itemId, ownMilli: 0, kitMilli: 0, quantityMilli: 0 };
    lines.set(itemId, fresh);
    return fresh;
  };
  const seenKits = new Set<string>();
  for (const pick of kits) {
    if (!Number.isInteger(pick.quantity) || pick.quantity < 1) {
      fail(LINE_MESSAGES.kitQuantity);
    }
    if (seenKits.has(pick.kitId)) fail(LINE_MESSAGES.kitTwice);
    seenKits.add(pick.kitId);
    for (const part of pick.components) {
      line(part.itemId).kitMilli += part.quantity * pick.quantity * 1000;
    }
  }
  const seenOwn = new Set<string>();
  for (const entry of own) {
    if (!Number.isInteger(entry.ownMilli) || entry.ownMilli < 0) {
      fail(LINE_MESSAGES.quantity);
    }
    if (seenOwn.has(entry.itemId))
      fail(LINE_MESSAGES.lineTwice(entry.itemCode ?? entry.itemId));
    seenOwn.add(entry.itemId);
    line(entry.itemId).ownMilli += entry.ownMilli;
  }
  return [...lines.values()].map((entry) => {
    const quantityMilli = entry.ownMilli + entry.kitMilli;
    if (quantityMilli <= 0) fail(LINE_MESSAGES.quantity);
    return { ...entry, quantityMilli };
  });
}

// ----------------------------------------------------------- sale lines

export interface SaleLineCheck {
  itemCode: string;
  /** The item is counted in kg already (sắt vụn mua về). */
  itemByKg: boolean;
  hasStandardWeight: boolean;
  condition: string | null;
  pricingUnit: PricingUnit;
}

/** Sale line rules (contracts spec "Hợp đồng bán theo cái hoặc theo kg"). */
export function checkSaleLine(line: SaleLineCheck): SaleCondition {
  if (
    !(SALE_CONDITIONS as readonly (string | null)[]).includes(line.condition)
  ) {
    fail(LINE_MESSAGES.condition);
  }
  if (
    line.condition === "SCRAP" &&
    !byWeight(line.pricingUnit) &&
    !line.itemByKg
  ) {
    fail(LINE_MESSAGES.scrapByPiece);
  }
  if (byWeight(line.pricingUnit) && !line.itemByKg && !line.hasStandardWeight) {
    fail(LINE_MESSAGES.noWeight(line.itemCode));
  }
  return line.condition as SaleCondition;
}

/** quantity × unit price, to 1 ₫ half up: 1.250,5 kg × 14.000 ₫. */
export function saleLineAmount(quantityMilli: number, price: Money): Money {
  return lineAmount(quantityMilli, price);
}

/** A price typed on a line: whole đồng, 0 or more; null while drafting. */
export function checkPrice(price: number | null | undefined): number | null {
  if (price === null || price === undefined) return null;
  if (!Number.isSafeInteger(price) || price < 0) fail(LINE_MESSAGES.price);
  return price;
}

// ----------------------------------------------------------- marks

/** A price differs from the catalog value saved with it. */
export function differs(price: number | null, catalog: number | null): boolean {
  return price !== null && catalog !== null && price !== catalog;
}

export interface MarkedLine {
  price: number | null;
  catalogPrice: number | null;
}

export interface MarkedCompensation {
  lostPrice: number | null;
  damagePrice: number | null;
  catalogLostPrice: number | null;
  catalogDamagePrice: number | null;
}

export interface OffCatalog {
  rent: number;
  compensation: number;
}

/** "1 giá thuê và 1 giá đền bù khác danh mục" on the check box. */
export function offCatalogCounts(
  lines: readonly MarkedLine[],
  compensations: readonly MarkedCompensation[],
): OffCatalog {
  return {
    rent: lines.filter((line) => differs(line.price, line.catalogPrice)).length,
    compensation: compensations.filter(
      (entry) =>
        differs(entry.lostPrice, entry.catalogLostPrice) ||
        differs(entry.damagePrice, entry.catalogDamagePrice),
    ).length,
  };
}

// ----------------------------------------------------------- VAT

const VAT_TEXT = /^\d{1,2}([.,]\d{1,2})?$/;

/**
 * The VAT rate to store, "8.00", or null when the customer takes no
 * invoice. Accepts "8", "8,5", "8.5".
 */
export function vatRate(
  enabled: boolean,
  rate: string | number | null | undefined,
): string | null {
  if (!enabled) return null;
  const text = String(rate ?? "").trim();
  if (text === "") return fail(LINE_MESSAGES.vatMissing);
  if (!VAT_TEXT.test(text)) return fail(LINE_MESSAGES.vatRange);
  const value = Number(text.replace(",", "."));
  if (!(value > 0) || value > VAT_MAX) return fail(LINE_MESSAGES.vatRange);
  return value.toFixed(2);
}

/** "8 %", "8,5 %" from a stored "8.00" / "8.50". */
export function formatVatRate(rate: string): string {
  const value = Number(rate);
  return `${String(value).replace(".", ",")} %`;
}

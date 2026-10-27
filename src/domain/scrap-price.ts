// Reference scrap price per kg (goods-receipt spec scrap-price, design D9).
import { DomainValueError } from "./errors";
import type { Money } from "./money";

export const SCRAP_NOTE_MAX = 200;

export const SCRAP_PRICE_MESSAGES = {
  price: "Giá sắt vụn phải là số nguyên lớn hơn 0",
  noteTooLong: `Ghi chú dài tối đa ${SCRAP_NOTE_MAX} ký tự`,
  none: "Chưa có giá. Lô hàng cũ có phế liệu chưa nhập kho được cho tới khi có giá.",
} as const;

/** A new price: whole đồng per kg, above 0. */
export function checkScrapPrice(value: number): Money {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainValueError(SCRAP_PRICE_MESSAGES.price);
  }
  return value as Money;
}

export function checkScrapNote(note: string | null | undefined): string | null {
  const text = (note ?? "").trim();
  if (text === "") return null;
  if (text.length > SCRAP_NOTE_MAX) {
    throw new DomainValueError(SCRAP_PRICE_MESSAGES.noteTooLong);
  }
  return text;
}

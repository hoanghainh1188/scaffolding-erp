import { DomainValueError } from "./errors";

// Item and kit codes are the company's real codes (requirements 0.2 #37):
// H1,7 · X5*10*3 · KB+KU34 · NỐI 34. Blocks of upper-case letters (accents
// allowed) or digits, joined by exactly one of , * + - or a space
// (catalog-extensions design D1). The QR label carries exactly this string.
export const ITEM_CODE_MIN_LENGTH = 2;
export const ITEM_CODE_MAX_LENGTH = 30;
const ITEM_CODE_PATTERN = /^[\p{Lu}\p{N}]+(?:[,*+\- ][\p{Lu}\p{N}]+)*$/u;

// Yard and workshop codes keep the stricter rule: they sit in URLs and
// documents and no real data needs more (design D1).
export const PLACE_CODE_MIN_LENGTH = 2;
export const PLACE_CODE_MAX_LENGTH = 20;
const PLACE_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export const ITEM_CODE_MESSAGES = {
  format:
    "Mã chỉ gồm chữ in hoa, số và các dấu , * + - hoặc khoảng trắng; không bắt đầu, kết thúc hay lặp hai dấu liền nhau",
  length: `Mã dài từ ${ITEM_CODE_MIN_LENGTH} đến ${ITEM_CODE_MAX_LENGTH} ký tự`,
} as const;

export const PLACE_CODE_MESSAGES = {
  format: "Mã chỉ gồm chữ in hoa không dấu, số và dấu gạch ngang",
  length: `Mã dài từ ${PLACE_CODE_MIN_LENGTH} đến ${PLACE_CODE_MAX_LENGTH} ký tự`,
} as const;

/** "nối  34 " → "NỐI 34": the user may type lower case and extra spaces. */
export function normalizeItemCode(input: string): string {
  return input
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("vi");
}

export function isValidItemCode(code: string): boolean {
  const length = [...code].length;
  return (
    length >= ITEM_CODE_MIN_LENGTH &&
    length <= ITEM_CODE_MAX_LENGTH &&
    ITEM_CODE_PATTERN.test(code)
  );
}

/** Normalizes and checks a typed item, kit or old code. */
export function parseItemCode(input: string): string {
  const code = normalizeItemCode(input);
  if (!ITEM_CODE_PATTERN.test(code)) {
    throw new DomainValueError(ITEM_CODE_MESSAGES.format);
  }
  if (!isValidItemCode(code)) {
    throw new DomainValueError(ITEM_CODE_MESSAGES.length);
  }
  return code;
}

/**
 * What uniqueness compares: no accents (Đ → D), no spaces, lower case.
 * "NỐI 34" and "NOI34" clash; "H1,7" and "H17" do not (the joiners stay).
 */
export function itemCodeKey(code: string): string {
  return code
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** "bai-01 " → "BAI-01". */
export function normalizePlaceCode(input: string): string {
  return input.trim().toUpperCase();
}

/** Normalizes and checks a typed yard or workshop code. */
export function parsePlaceCode(input: string): string {
  const code = normalizePlaceCode(input);
  if (!PLACE_CODE_PATTERN.test(code)) {
    throw new DomainValueError(PLACE_CODE_MESSAGES.format);
  }
  if (
    code.length < PLACE_CODE_MIN_LENGTH ||
    code.length > PLACE_CODE_MAX_LENGTH
  ) {
    throw new DomainValueError(PLACE_CODE_MESSAGES.length);
  }
  return code;
}

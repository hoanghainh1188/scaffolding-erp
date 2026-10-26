import { DomainValueError } from "./errors";

export const QUANTITY_UNITS = ["PIECE", "KG"] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const QUANTITY_UNIT_LABELS: Readonly<Record<QuantityUnit, string>> = {
  PIECE: "cái",
  KG: "kg",
};

/**
 * A quantity in thousandths of its unit, so sums are exact integers.
 * 250,5 kg is { unit: "KG", milli: 250500 }. Matches numeric(14,3) in the DB.
 */
export interface Quantity {
  readonly unit: QuantityUnit;
  readonly milli: number;
}

const MILLI_PER_UNIT = 1000;
/** 99.999.999.999,999: the largest numeric(14,3) value, in thousandths. */
export const MAX_QUANTITY_MILLI = 99_999_999_999_999;

const MESSAGES = {
  invalid: "Số lượng không hợp lệ",
  multipleDots:
    "Số lượng không hợp lệ. Không dùng dấu chấm ngăn cách hàng nghìn",
  ambiguous: "Chưa rõ số này. Gõ 1234 hoặc 1,234",
  wholePieces: "Số lượng cái phải là số nguyên",
  kgDecimals: "Số lượng kg tối đa 3 chữ số thập phân",
  outOfRange: "Số lượng vượt giới hạn",
  unitMismatch: "Không tính được hai số lượng khác đơn vị",
} as const;

export function toQuantity(milli: number, unit: QuantityUnit): Quantity {
  if (!Number.isInteger(milli)) {
    throw new DomainValueError(MESSAGES.invalid);
  }
  if (Math.abs(milli) > MAX_QUANTITY_MILLI) {
    throw new DomainValueError(MESSAGES.outOfRange);
  }
  if (unit === "PIECE" && milli % MILLI_PER_UNIT !== 0) {
    throw new DomainValueError(MESSAGES.wholePieces);
  }
  return { unit, milli: milli === 0 ? 0 : milli };
}

/** For code and tests: quantityFromNumber(250.5, "KG"). */
export function quantityFromNumber(
  value: number,
  unit: QuantityUnit,
): Quantity {
  const milli = Math.round(value * MILLI_PER_UNIT);
  if (
    !Number.isFinite(value) ||
    Math.abs(value * MILLI_PER_UNIT - milli) > 1e-6
  ) {
    throw new DomainValueError(
      unit === "PIECE" ? MESSAGES.wholePieces : MESSAGES.kgDecimals,
    );
  }
  return toQuantity(milli, unit);
}

function fromParts(
  negative: boolean,
  whole: string,
  fraction: string,
  unit: QuantityUnit,
): Quantity {
  if (fraction.length > 3) {
    throw new DomainValueError(MESSAGES.kgDecimals);
  }
  const digits = whole.replace(/^0+(?=\d)/, "") + fraction.padEnd(3, "0");
  // 15 digits is the most numeric(14,3) can hold; more is out of range.
  if (digits.length > 15) {
    throw new DomainValueError(MESSAGES.outOfRange);
  }
  const milli = Number(digits);
  return toQuantity(negative ? -milli : milli, unit);
}

const AMBIGUOUS_KG = /^-?[1-9]\d*\.\d{3}$/;
const DECIMAL_INPUT = /^(-?)(\d+)(?:,(\d+))?$/;

/**
 * Reads what a user typed. No thousands separators; "," and "." are both
 * decimal marks. Pieces must be whole, so any separator is rejected for them.
 */
export function parseQuantity(input: string, unit: QuantityUnit): Quantity {
  const text = input.trim();
  if ((text.match(/\./g) ?? []).length > 1) {
    throw new DomainValueError(MESSAGES.multipleDots);
  }
  if (text.includes(".") && text.includes(",")) {
    throw new DomainValueError(MESSAGES.multipleDots);
  }
  if (unit === "KG" && AMBIGUOUS_KG.test(text)) {
    throw new DomainValueError(MESSAGES.ambiguous);
  }
  const match = DECIMAL_INPUT.exec(text.replace(".", ","));
  if (!match) {
    throw new DomainValueError(MESSAGES.invalid);
  }
  const [, sign = "", whole = "", fraction = ""] = match;
  if (unit === "PIECE" && match[3] !== undefined) {
    throw new DomainValueError(MESSAGES.wholePieces);
  }
  return fromParts(sign === "-", whole, fraction, unit);
}

const DB_NUMERIC = /^(-?)(\d+)(?:\.(\d{1,3}))?$/;

/** Reads a numeric(14,3) string from Postgres, without parseFloat. */
export function quantityFromDb(value: string, unit: QuantityUnit): Quantity {
  const match = DB_NUMERIC.exec(value);
  if (!match) {
    throw new DomainValueError(MESSAGES.invalid);
  }
  const [, sign = "", whole = "", fraction = ""] = match;
  return fromParts(sign === "-", whole, fraction, unit);
}

function splitMilli(milli: number): {
  sign: string;
  whole: number;
  fraction: string;
} {
  const abs = Math.abs(milli);
  return {
    sign: milli < 0 ? "-" : "",
    whole: Math.trunc(abs / MILLI_PER_UNIT),
    fraction: String(abs % MILLI_PER_UNIT).padStart(3, "0"),
  };
}

/** "250.500" for a numeric(14,3) column. */
export function quantityToDb(quantity: Quantity): string {
  const { sign, whole, fraction } = splitMilli(quantity.milli);
  return `${sign}${whole}.${fraction}`;
}

const groupFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

function format(quantity: Quantity, grouped: boolean): string {
  const { sign, whole, fraction } = splitMilli(quantity.milli);
  const wholeText = grouped ? groupFormatter.format(whole) : String(whole);
  const trimmed = fraction.replace(/0+$/, "");
  return `${sign}${wholeText}${trimmed ? `,${trimmed}` : ""}`;
}

/** "1.234,5" */
export function formatQuantity(quantity: Quantity): string {
  return format(quantity, true);
}

/** "1234,5": the string put in an input while the user edits it. */
export function formatQuantityForInput(quantity: Quantity): string {
  return format(quantity, false);
}

function assertSameUnit(a: Quantity, b: Quantity): void {
  if (a.unit !== b.unit) {
    throw new DomainValueError(MESSAGES.unitMismatch);
  }
}

export function addQuantity(a: Quantity, b: Quantity): Quantity {
  assertSameUnit(a, b);
  return toQuantity(a.milli + b.milli, a.unit);
}

export function subtractQuantity(a: Quantity, b: Quantity): Quantity {
  assertSameUnit(a, b);
  return toQuantity(a.milli - b.milli, a.unit);
}

import { DomainValueError } from "./errors";

// Count units take whole numbers, measure units up to 3 decimals
// (requirements 0.2 #37, catalog-extensions design D2).
export const COUNT_UNITS = [
  "PIECE",
  "BAR",
  "BUNDLE",
  "BASKET",
  "ROLL",
  "BOX",
  "CARTON",
] as const;
export const MEASURE_UNITS = ["METER", "KG"] as const;
export const QUANTITY_UNITS = [...COUNT_UNITS, ...MEASURE_UNITS] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const QUANTITY_UNIT_LABELS: Readonly<Record<QuantityUnit, string>> = {
  PIECE: "cái",
  BAR: "cây",
  BUNDLE: "bó",
  BASKET: "sọt",
  ROLL: "cuộn",
  BOX: "hộp",
  CARTON: "thùng",
  METER: "m",
  KG: "kg",
};

export function isQuantityUnit(value: unknown): value is QuantityUnit {
  return (QUANTITY_UNITS as readonly unknown[]).includes(value);
}

/** Whole numbers only: cái, cây, bó, sọt, cuộn, hộp, thùng. */
export function isCountUnit(unit: QuantityUnit): boolean {
  return (COUNT_UNITS as readonly string[]).includes(unit);
}

/** Every unit but kg has a standard weight (kg per unit) for conversions. */
export function hasStandardWeight(unit: QuantityUnit): boolean {
  return unit !== "KG";
}

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
  whole: (unit: QuantityUnit) =>
    `Số lượng ${QUANTITY_UNIT_LABELS[unit]} phải là số nguyên`,
  decimals: (unit: QuantityUnit) =>
    `Số lượng ${QUANTITY_UNIT_LABELS[unit]} tối đa 3 chữ số thập phân`,
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
  if (isCountUnit(unit) && milli % MILLI_PER_UNIT !== 0) {
    throw new DomainValueError(MESSAGES.whole(unit));
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
      isCountUnit(unit) ? MESSAGES.whole(unit) : MESSAGES.decimals(unit),
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
    throw new DomainValueError(MESSAGES.decimals(unit));
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
 * decimal marks. Count units must be whole, so any separator is rejected.
 */
export function parseQuantity(input: string, unit: QuantityUnit): Quantity {
  const text = input.trim();
  if ((text.match(/\./g) ?? []).length > 1) {
    throw new DomainValueError(MESSAGES.multipleDots);
  }
  if (text.includes(".") && text.includes(",")) {
    throw new DomainValueError(MESSAGES.multipleDots);
  }
  if (!isCountUnit(unit) && AMBIGUOUS_KG.test(text)) {
    throw new DomainValueError(MESSAGES.ambiguous);
  }
  const match = DECIMAL_INPUT.exec(text.replace(".", ","));
  if (!match) {
    throw new DomainValueError(MESSAGES.invalid);
  }
  const [, sign = "", whole = "", fraction = ""] = match;
  if (isCountUnit(unit) && match[3] !== undefined) {
    throw new DomainValueError(MESSAGES.whole(unit));
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

/** A quantity of one unit, for totals that mix units. */
export interface UnitAmount {
  readonly unit: QuantityUnit;
  readonly milli: number;
}

/**
 * Sums per unit, in the order of QUANTITY_UNITS: cái and bó are never added
 * into one number (catalog-extensions, 0.2 #47).
 */
export function sumByUnit(rows: readonly UnitAmount[]): UnitAmount[] {
  return QUANTITY_UNITS.flatMap((unit) => {
    const matching = rows.filter((row) => row.unit === unit);
    if (matching.length === 0) return [];
    return [{ unit, milli: matching.reduce((sum, row) => sum + row.milli, 0) }];
  });
}

/** "40 cái, 9 bó"; "0 cái" when there is nothing yet. */
export function formatByUnit(amounts: readonly UnitAmount[]): string {
  if (amounts.length === 0) return `0 ${QUANTITY_UNIT_LABELS.PIECE}`;
  return amounts
    .map(
      (amount) =>
        `${formatQuantity(toQuantity(amount.milli, amount.unit))} ${QUANTITY_UNIT_LABELS[amount.unit]}`,
    )
    .join(", ");
}

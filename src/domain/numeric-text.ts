/**
 * What a number field lets the user type. Parsing still happens later
 * (`parseMoney`, `parseQuantity`); this only drops characters that can never
 * be part of a valid entry, so letters never reach the field.
 *
 * Separators stay in every kind except `integer`, so "1,5 cái" or
 * "7.500,5 ₫" still reach the parser and get its clear message instead of
 * silently turning into 15 or 75005.
 *
 * - `integer`: digits only (days, kit counts, codes read with `Number`).
 * - `count`: digits, "." and "," (pieces read by `parseQuantity`).
 * - `decimal`: digits, "." and "," (kg, %).
 * - `money`: digits, "." and "," ("1.250.000").
 * - `signed-money`: like `money`, plus a leading "-" (refunds).
 */
export type NumericKind =
  "integer" | "count" | "decimal" | "money" | "signed-money";

const ALLOWED: Record<NumericKind, RegExp> = {
  integer: /\d/,
  count: /[\d.,]/,
  decimal: /[\d.,]/,
  money: /[\d.,]/,
  "signed-money": /[\d.,-]/,
};

/** Keyboard on phones for each kind. */
export const NUMERIC_INPUT_MODE: Record<NumericKind, "numeric" | "decimal"> = {
  integer: "numeric",
  count: "numeric",
  decimal: "decimal",
  money: "numeric",
  "signed-money": "numeric",
};

/** Unicode minus and dashes pasted from documents count as "-". */
const DASHES = /[−‒–—]/g;

/** Drops every character the kind does not accept; "-" only at the start. */
export function keepNumericText(text: string, kind: NumericKind): string {
  const allowed = ALLOWED[kind];
  const normalized = kind === "signed-money" ? text.replace(DASHES, "-") : text;
  let result = "";
  for (const char of normalized) {
    if (!allowed.test(char)) continue;
    if (char === "-" && result !== "") continue;
    result += char;
  }
  return result;
}

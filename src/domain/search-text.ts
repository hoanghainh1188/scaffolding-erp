/**
 * Lower case, no Vietnamese accents, single spaces: what search compares.
 * "Khung giàn giáo Đ" → "khung gian giao d" (master-data design D10).
 */
export function toSearchText(
  ...parts: readonly (string | null | undefined)[]
): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

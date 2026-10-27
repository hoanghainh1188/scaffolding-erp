/** Codes made from a database sequence: NT-0001, NCC-0012, CT-10000. */
export function formatSequenceCode(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(4, "0")}`;
}

export const CODE_PREFIXES = {
  customer: "NT",
  supplier: "NCC",
  site: "CT",
} as const;

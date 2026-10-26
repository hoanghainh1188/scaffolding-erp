/** The four stock conditions. Each has its own average cost. */
export const CONDITIONS = ["NEW", "GOOD", "NEEDS_REPAIR", "SCRAP"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Readonly<Record<Condition, string>> = {
  NEW: "Mới",
  GOOD: "Tốt",
  NEEDS_REPAIR: "Chờ sửa",
  SCRAP: "Phế liệu",
};

const SELLABLE: ReadonlySet<Condition> = new Set(["NEW", "GOOD"]);

/** Only NEW and GOOD stock may be sold or rented out. */
export function isSellableCondition(condition: Condition): boolean {
  return SELLABLE.has(condition);
}

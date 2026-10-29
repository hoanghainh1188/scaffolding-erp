// The kinds of document "Lập phiếu" offers on /inventory/adjustments; also
// the ?new= values that open one at once (stock-value-adjustment design D6).
export const CREATE_CHOICES = [
  { key: "ADJUSTMENT", label: "Điều chỉnh số lượng" },
  { key: "OPENING", label: "Tồn đầu kỳ" },
  { key: "REVALUE", label: "Điều chỉnh giá trị" },
  { key: "TRIP", label: "Sửa chi phí chuyến" },
] as const;
export type CreateChoice = (typeof CREATE_CHOICES)[number]["key"];

/** The choice named by ?new=, or null. */
export function createChoiceFrom(value: unknown): CreateChoice | null {
  return CREATE_CHOICES.find((choice) => choice.key === value)?.key ?? null;
}

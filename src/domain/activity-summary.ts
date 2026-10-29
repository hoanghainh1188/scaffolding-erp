// The "Nội dung" sentence of a log row (activity-log design D6). Short
// Vietnamese text built from values already formatted for display.
import { SUMMARY_MAX } from "./activity";
import type { FieldChange } from "./activity-changes";

const DASH = "–";

/** One change as a phrase: "Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫". */
export function changePhrase(change: FieldChange): string {
  if (change.field === "_more") return change.label;
  return `${change.label}: ${change.before ?? DASH} → ${change.after ?? DASH}`;
}

/** An edit: its first two changes, then "… và N thay đổi khác". */
export function changeSummary(
  changes: readonly FieldChange[],
  shown = 2,
): string {
  const real = changes.filter((change) => change.field !== "_more");
  const more = changes.find((change) => change.field === "_more");
  const extra =
    real.length -
    Math.min(real.length, shown) +
    (more ? Number(/\d+/.exec(more.label)?.[0] ?? 0) : 0);
  const head = real.slice(0, shown).map(changePhrase).join("; ");
  return extra > 0 ? `${head} … và ${extra} thay đổi khác` : head;
}

/** Parts joined the D18 way: "Hòa Phát mẫu · 5 mã hàng · 52.942.500 ₫". */
export function joinParts(
  ...parts: readonly (string | null | undefined | false)[]
): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

/** `Lý do: "Ghi rõ số phiếu thu hồi"`. */
export function reasonSummary(reason: string): string {
  return `Lý do: "${reason}"`;
}

/** Fits the column: at most SUMMARY_MAX characters, cut with "…". */
export function clampSummary(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(trimmed === "" ? DASH : trimmed);
  if (chars.length <= SUMMARY_MAX) return chars.join("");
  return `${chars.slice(0, SUMMARY_MAX - 1).join("")}…`;
}

/** "5 mã hàng". */
export function countText(count: number, noun: string): string {
  return `${count.toLocaleString("vi-VN")} ${noun}`;
}

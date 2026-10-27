/** "Minh Anh" → "MA", "Đức Thắng" → "ĐT": the last two words' first letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return ((words.at(-2)?.[0] ?? "") + (words.at(-1)?.[0] ?? "")).toUpperCase();
}

import type { Condition } from "@/domain/condition";

/** URL of an item's stock card (D11) with its filters. */
export function stockCardHref(
  code: string,
  filter: {
    condition?: Condition | "all";
    place?: "yard" | "workshop" | "sites";
    site?: string;
    from?: string;
    to?: string;
  } = {},
): string {
  const query = new URLSearchParams(
    Object.entries(filter).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  ).toString();
  return `/inventory/items/${encodeURIComponent(code)}${query ? `?${query}` : ""}`;
}

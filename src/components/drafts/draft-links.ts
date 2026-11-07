import type { DraftRecord } from "@/lib/drafts/store";

/** Where a draft is worked on. */
export function draftHref(
  record: Pick<DraftRecord, "kind" | "documentRef" | "draftId">,
): string {
  if (record.kind === "DELIVERY") {
    return `/m/deliveries/${encodeURIComponent(record.documentRef)}`;
  }
  if (record.kind === "REPAIR") {
    return `/m/repairs/${encodeURIComponent(record.documentRef)}`;
  }
  if (record.kind === "TRANSFER") {
    return `/m/site-transfers/${encodeURIComponent(record.documentRef)}`;
  }
  if (record.kind === "RETURN") {
    return `/m/returns/new?contract=${encodeURIComponent(record.documentRef)}`;
  }
  if (record.kind === "STOCKTAKE") {
    return `/m/stocktake/${encodeURIComponent(record.documentRef)}`;
  }
  return `/m/receive/${encodeURIComponent(record.documentRef)}?draft=${record.draftId}`;
}

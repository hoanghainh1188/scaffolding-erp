import type { DraftRecord } from "@/lib/drafts/store";

/** Where a draft is worked on. */
export function draftHref(
  record: Pick<DraftRecord, "kind" | "documentRef" | "draftId">,
): string {
  if (record.kind === "STOCKTAKE") {
    return `/m/stocktake/${encodeURIComponent(record.documentRef)}`;
  }
  return `/m/receive/${encodeURIComponent(record.documentRef)}?draft=${record.draftId}`;
}

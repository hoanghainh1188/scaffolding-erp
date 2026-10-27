import type { DraftRecord } from "@/lib/drafts/store";

/** Where a draft is worked on (only goods receipts for now). */
export function draftHref(
  record: Pick<DraftRecord, "kind" | "documentRef" | "draftId">,
): string {
  return `/m/receive/${encodeURIComponent(record.documentRef)}?draft=${record.draftId}`;
}

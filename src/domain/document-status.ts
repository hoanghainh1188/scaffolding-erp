import { DomainValueError } from "./errors";

/** Statuses a document can be saved with (the DB enum in later changes). */
export const STORED_DOCUMENT_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "IN_PROGRESS",
  "DONE",
] as const;
export type StoredDocumentStatus = (typeof STORED_DOCUMENT_STATUSES)[number];

/**
 * Statuses a screen can show. OVERDUE is derived from the due date and is
 * never stored; the receivables change defines how it is computed.
 */
export const DISPLAY_DOCUMENT_STATUSES = [
  ...STORED_DOCUMENT_STATUSES,
  "OVERDUE",
] as const;
export type DisplayDocumentStatus = (typeof DISPLAY_DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Readonly<
  Record<DisplayDocumentStatus, string>
> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  IN_PROGRESS: "Đang xử lý",
  DONE: "Hoàn thành",
  OVERDUE: "Quá hạn",
};

export function assertStorableStatus(
  status: DisplayDocumentStatus,
): StoredDocumentStatus {
  if (status === "OVERDUE") {
    throw new DomainValueError("Quá hạn là trạng thái tính ra, không được lưu");
  }
  return status;
}

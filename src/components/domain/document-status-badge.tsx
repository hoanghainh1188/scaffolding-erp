import {
  DOCUMENT_STATUS_LABELS,
  type DisplayDocumentStatus,
} from "@/domain/document-status";

import { ToneBadge, type BadgeTone } from "./tone-badge";

const STATUS_TONES: Readonly<Record<DisplayDocumentStatus, BadgeTone>> = {
  DRAFT: "muted",
  PENDING_APPROVAL: "warning",
  IN_PROGRESS: "primary",
  DONE: "success",
  OVERDUE: "destructive",
};

interface DocumentStatusBadgeProps {
  /** OVERDUE is computed by the screen from the due date; never stored. */
  status: DisplayDocumentStatus;
  className?: string;
}

export function DocumentStatusBadge({
  status,
  className,
}: DocumentStatusBadgeProps) {
  return (
    <ToneBadge tone={STATUS_TONES[status]} className={className}>
      {DOCUMENT_STATUS_LABELS[status]}
    </ToneBadge>
  );
}

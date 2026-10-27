import { ToneBadge, type BadgeTone } from "@/components/domain/tone-badge";
import {
  ADJUSTMENT_STATUS_LABELS,
  type AdjustmentStatus,
} from "@/lib/inventory/adjustments";

const TONES: Readonly<Record<AdjustmentStatus, BadgeTone>> = {
  DRAFT: "muted",
  PENDING_APPROVAL: "warning",
  DONE: "success",
};

export function AdjustmentStatusBadge({
  status,
}: {
  status: AdjustmentStatus;
}) {
  return (
    <ToneBadge tone={TONES[status]}>
      {ADJUSTMENT_STATUS_LABELS[status]}
    </ToneBadge>
  );
}

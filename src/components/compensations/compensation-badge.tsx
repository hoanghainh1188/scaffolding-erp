import { ToneBadge, type BadgeTone } from "@/components/domain/tone-badge";
import {
  COMPENSATION_STATUS_LABELS,
  type CompensationStatus,
} from "@/domain/compensation";

const TONES: Readonly<Record<CompensationStatus, BadgeTone>> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "neutral",
};

export function CompensationStatusBadge({
  status,
}: {
  status: CompensationStatus;
}) {
  return (
    <ToneBadge tone={TONES[status]}>
      {COMPENSATION_STATUS_LABELS[status]}
    </ToneBadge>
  );
}

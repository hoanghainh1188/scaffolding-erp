import { ToneBadge, type BadgeTone } from "@/components/domain/tone-badge";
import {
  PRODUCTION_STATUS_LABELS,
  type ProductionStatus,
} from "@/domain/production-order";

/** Quiet while drafted, highlighted while someone works on it. */
const TONES: Readonly<Record<ProductionStatus, BadgeTone>> = {
  DRAFT: "muted",
  ASSIGNED: "neutral",
  IN_PROGRESS: "highlight",
  AWAITING_CHECK: "highlight",
  AWAITING_APPROVAL: "warning",
  COUNTED: "warning",
  POSTED: "success",
  CANCELLED: "muted",
};

export function ProductionStatusBadge({
  status,
}: {
  status: ProductionStatus;
}) {
  return (
    <ToneBadge tone={TONES[status]}>
      {PRODUCTION_STATUS_LABELS[status]}
    </ToneBadge>
  );
}

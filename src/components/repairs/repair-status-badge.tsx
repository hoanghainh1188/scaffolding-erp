import { ToneBadge, type BadgeTone } from "@/components/domain/tone-badge";
import { REPAIR_STATUS_LABELS, type RepairStatus } from "@/lib/repairs/labels";

/** Quiet while drafted, highlighted while someone works on it. */
const TONES: Readonly<Record<RepairStatus, BadgeTone>> = {
  DRAFT: "muted",
  ASSIGNED: "neutral",
  IN_PROGRESS: "highlight",
  AWAITING_CHECK: "highlight",
  COUNTED: "warning",
  POSTED: "success",
  CANCELLED: "muted",
};

export function RepairStatusBadge({ status }: { status: RepairStatus }) {
  return (
    <ToneBadge tone={TONES[status]}>{REPAIR_STATUS_LABELS[status]}</ToneBadge>
  );
}

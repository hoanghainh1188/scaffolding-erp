import { ToneBadge } from "@/components/domain/tone-badge";
import { REPAIR_STATUS_LABELS, type RepairStatus } from "@/lib/repairs/labels";

/** "Nháp" stays quiet; "Đã ghi sổ" reads as done. */
export function RepairStatusBadge({ status }: { status: RepairStatus }) {
  return (
    <ToneBadge tone={status === "POSTED" ? "success" : "muted"}>
      {REPAIR_STATUS_LABELS[status]}
    </ToneBadge>
  );
}

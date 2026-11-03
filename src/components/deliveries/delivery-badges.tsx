import { ToneBadge, type BadgeTone } from "@/components/domain/tone-badge";
import {
  DELIVERY_STATUS_LABELS,
  type DeliveryStatus,
} from "@/domain/delivery-note";

const TONES: Readonly<Record<DeliveryStatus, BadgeTone>> = {
  PLANNED: "muted",
  PICKING: "warning",
  POSTED: "success",
  CANCELLED: "neutral",
};

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <ToneBadge tone={TONES[status]}>{DELIVERY_STATUS_LABELS[status]}</ToneBadge>
  );
}

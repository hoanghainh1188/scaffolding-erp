import {
  LOCATION_TYPE_LABELS,
  type LocationType,
} from "@/domain/location-type";

import { ToneBadge } from "./tone-badge";

interface LocationBadgeProps {
  type: LocationType;
  className?: string;
}

export function LocationBadge({ type, className }: LocationBadgeProps) {
  return (
    <ToneBadge tone="neutral" className={className}>
      {LOCATION_TYPE_LABELS[type]}
    </ToneBadge>
  );
}

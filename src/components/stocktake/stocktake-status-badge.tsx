import { ToneBadge, type BadgeTone } from "@/components/domain/tone-badge";
import {
  STOCKTAKE_STATUS_LABELS,
  type StocktakeStatus,
} from "@/domain/stocktake";

const TONES: Readonly<Record<StocktakeStatus, BadgeTone>> = {
  COUNTING: "primary",
  SUBMITTED: "warning",
  DONE: "success",
  CANCELLED: "muted",
};

export function StocktakeStatusBadge({ status }: { status: StocktakeStatus }) {
  return (
    <ToneBadge tone={TONES[status]}>
      {STOCKTAKE_STATUS_LABELS[status]}
    </ToneBadge>
  );
}

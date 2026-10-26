import { CONDITION_LABELS, type Condition } from "@/domain/condition";

import { ToneBadge, type BadgeTone } from "./tone-badge";

const CONDITION_TONES: Readonly<Record<Condition, BadgeTone>> = {
  NEW: "highlight",
  GOOD: "success",
  NEEDS_REPAIR: "warning",
  SCRAP: "muted",
};

interface ConditionBadgeProps {
  condition: Condition;
  className?: string;
}

export function ConditionBadge({ condition, className }: ConditionBadgeProps) {
  return (
    <ToneBadge tone={CONDITION_TONES[condition]} className={className}>
      {CONDITION_LABELS[condition]}
    </ToneBadge>
  );
}

"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useId } from "react";

import { CONDITION_LABELS } from "@/domain/condition";
import { computeConditionSplit } from "@/domain/condition-split";
import { formatQuantity, toQuantity, type Quantity } from "@/domain/quantity";
import { cn } from "@/lib/utils";

import { QuantityInput } from "./quantity-input";

export type SplitPart = "GOOD" | "NEEDS_REPAIR" | "SCRAP" | "LOST";
export type SplitParts = Readonly<Record<SplitPart, Quantity>>;

const PART_LABELS: Readonly<Record<SplitPart, string>> = {
  GOOD: CONDITION_LABELS.GOOD,
  NEEDS_REPAIR: CONDITION_LABELS.NEEDS_REPAIR,
  SCRAP: CONDITION_LABELS.SCRAP,
  LOST: "Mất",
};

interface ConditionSplitProps {
  /** Counted total; every part uses its unit. */
  total: Quantity;
  value: SplitParts;
  onValueChange: (value: SplitParts) => void;
  /** Returns from a site (M4) also record lost items. */
  withLost?: boolean;
  /** Said when the parts add up; "Đã khớp" by default. */
  balancedLabel?: string;
  className?: string;
}

/** One counted total split into Tốt / Chờ sửa / Phế liệu (/ Mất). Shared by M3 and M4. */
export function ConditionSplit({
  total,
  value,
  onValueChange,
  withLost = false,
  balancedLabel = "Đã khớp",
  className,
}: ConditionSplitProps) {
  const parts: SplitPart[] = withLost
    ? ["GOOD", "NEEDS_REPAIR", "SCRAP", "LOST"]
    : ["GOOD", "NEEDS_REPAIR", "SCRAP"];
  const idPrefix = useId();
  const { remaining, status } = computeConditionSplit(
    total,
    parts.map((part) => value[part]),
  );
  const gap = formatQuantity(
    toQuantity(Math.abs(remaining.milli), remaining.unit),
  );

  const message =
    status === "balanced"
      ? balancedLabel
      : status === "under"
        ? `Còn ${gap} chưa phân loại`
        : `Vượt ${gap} so với tổng`;
  const Icon = status === "balanced" ? CircleCheck : CircleAlert;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        className={cn("grid gap-3", withLost ? "grid-cols-2" : "grid-cols-3")}
      >
        {parts.map((part) => (
          <div key={part} className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${idPrefix}-${part}`} className="text-label">
              {PART_LABELS[part]}
            </label>
            <QuantityInput
              id={`${idPrefix}-${part}`}
              value={value[part]}
              onValueChange={(next) =>
                onValueChange({ ...value, [part]: next })
              }
              normalize={(q) => (q.milli < 0 ? toQuantity(0, q.unit) : q)}
            />
          </div>
        ))}
      </div>
      <p
        role="status"
        aria-live="polite"
        data-state={status}
        className={cn(
          "flex items-center gap-2 text-label",
          status === "balanced" ? "text-success" : "text-warning",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {message}
      </p>
    </div>
  );
}

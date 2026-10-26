"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toQuantity, type Quantity } from "@/domain/quantity";
import { cn } from "@/lib/utils";

import { QuantityInput } from "./quantity-input";

const MILLI = 1000;

interface StepperProps {
  value: Quantity;
  onValueChange: (value: Quantity) => void;
  /** Accessible name of the field, e.g. the item being counted. */
  label: string;
  /** In units of `value.unit`. */
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

/** Large − / + buttons for counting on a phone (M3, M4, M5). */
export function Stepper({
  value,
  onValueChange,
  label,
  min = 0,
  max,
  step = 1,
  className,
}: StepperProps) {
  const minMilli = Math.round(min * MILLI);
  const maxMilli = max === undefined ? undefined : Math.round(max * MILLI);
  const stepMilli = Math.round(step * MILLI);

  const clamp = (q: Quantity): Quantity => {
    const upper =
      maxMilli === undefined ? q.milli : Math.min(q.milli, maxMilli);
    return toQuantity(Math.max(minMilli, upper), q.unit);
  };

  const canDecrease = value.milli > minMilli;
  const canIncrease = maxMilli === undefined || value.milli < maxMilli;

  return (
    <div className={cn("flex items-start gap-2", className)}>
      <Button
        type="button"
        variant="secondary"
        size="icon-lg"
        className="size-12 shrink-0"
        aria-label="Giảm"
        disabled={!canDecrease}
        onClick={() =>
          onValueChange(clamp(toQuantity(value.milli - stepMilli, value.unit)))
        }
      >
        <Minus className="size-5" aria-hidden />
      </Button>
      <QuantityInput
        aria-label={label}
        value={value}
        onValueChange={onValueChange}
        normalize={clamp}
        className="h-12 text-center text-h2"
      />
      <Button
        type="button"
        variant="secondary"
        size="icon-lg"
        className="size-12 shrink-0"
        aria-label="Tăng"
        disabled={!canIncrease}
        onClick={() =>
          onValueChange(clamp(toQuantity(value.milli + stepMilli, value.unit)))
        }
      >
        <Plus className="size-5" aria-hidden />
      </Button>
    </div>
  );
}

"use client";

import {
  useId,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from "react";

import { DomainValueError } from "@/domain/errors";
import {
  formatQuantity,
  formatQuantityForInput,
  isCountUnit,
  parseQuantity,
  type Quantity,
} from "@/domain/quantity";
import { cn } from "@/lib/utils";

import { cleanNumericField } from "./numeric-input";

export interface QuantityInputProps extends Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type"
> {
  value: Quantity;
  onValueChange: (value: Quantity) => void;
  /** Adjusts a parsed value before it is committed, e.g. clamping to a range. */
  normalize?: (value: Quantity) => Quantity;
}

/**
 * Shows "1.500" at rest and "1500" while editing (design D13). Typed text is
 * checked against the unit's rules on blur or Enter; an invalid entry keeps
 * the last valid value and explains why below the field.
 */
export function QuantityInput({
  value,
  onValueChange,
  normalize,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  "aria-invalid": ariaInvalidProp,
  ...props
}: QuantityInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messageId = useId();

  function commit(text: string) {
    try {
      const parsed = parseQuantity(text, value.unit);
      const next = normalize ? normalize(parsed) : parsed;
      setError(null);
      if (next.milli !== value.milli) onValueChange(next);
    } catch (cause: unknown) {
      if (!(cause instanceof DomainValueError)) throw cause;
      setError(cause.message);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <input
        type="text"
        inputMode={isCountUnit(value.unit) ? "numeric" : "decimal"}
        autoComplete="off"
        value={draft ?? formatQuantity(value)}
        aria-invalid={error || ariaInvalidProp ? true : undefined}
        aria-describedby={error ? messageId : undefined}
        className={cn(
          "h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-body tabular-nums transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring aria-invalid:border-destructive",
          className,
        )}
        onFocus={(event) => {
          setDraft(formatQuantityForInput(value));
          onFocus?.(event);
        }}
        onChange={(event) => {
          const cleaned = cleanNumericField(
            event.currentTarget,
            isCountUnit(value.unit) ? "count" : "decimal",
          );
          setDraft(cleaned);
          if (error && cleaned.trim() !== "") {
            setError(null);
          }
        }}
        onBlur={(event) => {
          if (draft !== null) commit(draft);
          setDraft(null);
          onBlur?.(event);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") event.currentTarget.blur();
          onKeyDown?.(event);
        }}
        {...props}
      />
      {error && (
        <p id={messageId} className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

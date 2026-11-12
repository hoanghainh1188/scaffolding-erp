"use client";

import type { ChangeEvent, ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import {
  keepNumericText,
  NUMERIC_INPUT_MODE,
  type NumericKind,
} from "@/domain/numeric-text";

/**
 * Drops what `kind` does not accept from the field, keeping the caret where
 * the user typed. Returns the cleaned text.
 */
export function cleanNumericField(
  field: HTMLInputElement,
  kind: NumericKind,
): string {
  const raw = field.value;
  const clean = keepNumericText(raw, kind);
  if (clean !== raw) {
    const caret = field.selectionStart ?? raw.length;
    const kept = keepNumericText(raw.slice(0, caret), kind).length;
    field.value = clean;
    field.setSelectionRange(kept, kept);
  }
  return clean;
}

export interface NumericInputProps extends Omit<
  ComponentProps<typeof Input>,
  "type" | "inputMode"
> {
  kind: NumericKind;
}

/**
 * A text field that only takes characters a number can have (`kind`), so
 * letters typed or pasted on a desktop never show up. `inputMode` alone only
 * changes the phone keyboard. Works controlled and uncontrolled: the field is
 * cleaned before `onChange` runs, and the caret stays where the user typed.
 */
export function NumericInput({
  kind,
  onChange,
  autoComplete = "off",
  ...props
}: NumericInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    cleanNumericField(event.currentTarget, kind);
    onChange?.(event);
  }

  return (
    <Input
      type="text"
      inputMode={NUMERIC_INPUT_MODE[kind]}
      autoComplete={autoComplete}
      onChange={handleChange}
      {...props}
    />
  );
}

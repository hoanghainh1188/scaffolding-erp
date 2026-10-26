"use client";

import { useState } from "react";

import { quantityFromNumber } from "@/domain/quantity";

import { Stepper as BaseStepper } from "./stepper";

/** Self-contained Stepper for dev sample pages. */
export function DemoStepper() {
  const [value, setValue] = useState(quantityFromNumber(12, "PIECE"));
  return (
    <BaseStepper
      label="Khung giàn giáo 1.7m"
      value={value}
      onValueChange={setValue}
    />
  );
}

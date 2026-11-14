"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label as LabelPrimitive } from "radix-ui";

export interface LabelProps extends React.ComponentProps<
  typeof LabelPrimitive.Root
> {
  /** Renders a visual destructive asterisk (*) via CSS pseudo-element when the field is required. */
  required?: boolean;
}

function Label({ className, required, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      data-required={required ? "true" : undefined}
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        required && "after:-ml-1 after:text-destructive after:content-['*']",
        className,
      )}
      {...props}
    />
  );
}

export { Label };

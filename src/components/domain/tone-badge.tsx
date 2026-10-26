import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Badge colours from Bright Blue Base (design D12). */
export type BadgeTone =
  | "highlight"
  | "muted"
  | "primary"
  | "destructive"
  | "success"
  | "warning"
  | "neutral";

const TONE_CLASSES: Readonly<Record<BadgeTone, string>> = {
  highlight: "border-transparent bg-highlight text-highlight-foreground",
  muted: "border-transparent bg-muted text-muted-foreground",
  primary: "border-transparent bg-primary text-primary-foreground",
  destructive: "border-transparent bg-destructive text-destructive-foreground",
  // success / warning have no *-foreground token: outline on card instead.
  success: "border-success bg-card text-success",
  warning: "border-warning bg-card text-warning",
  neutral: "border-border bg-card text-foreground",
};

interface ToneBadgeProps extends ComponentProps<"span"> {
  tone: BadgeTone;
}

/** Always carries text, so colour is never the only signal. */
export function ToneBadge({ tone, className, ...props }: ToneBadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-pill border px-2.5 text-caption whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}

// One block of D1 (bản vẽ Main.dc.html): a titled card, actions on the
// right, an optional note under it.
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PanelProps {
  id: string;
  title: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Panel({
  id,
  title,
  actions,
  note,
  className,
  children,
}: PanelProps) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex min-w-0 flex-col gap-3.5 rounded-lg border bg-card p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={id} className="flex-1 text-[17px] leading-6 font-bold">
          {title}
        </h2>
        {actions}
      </div>
      {children}
      {note ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {note}
        </p>
      ) : null}
    </section>
  );
}

/** "· 4" after a block title. */
export function TitleCount({ count }: { count: number }) {
  return (
    <span className="font-medium text-muted-foreground" data-mask>
      {" "}
      · {count}
    </span>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** Two-way switch of a block ("Theo tháng / Theo ngày"). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-[11px] bg-secondary p-[3px]"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 rounded-sm px-3 text-label text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            option.value === value && "bg-card text-foreground shadow-xs",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

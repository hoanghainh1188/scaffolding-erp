"use client";

import { CalendarIcon } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import { vi } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  addDays,
  formatBusinessDate,
  formatBusinessDateInput,
  parseBusinessDateInput,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { DomainValueError } from "@/domain/errors";
import { cn } from "@/lib/utils";

export interface DateInputProps extends Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "min" | "max"
> {
  /** "YYYY-MM-DD", or "" for no date. */
  value: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
}

/** Calendar days are local `Date`s; only their y/m/d parts matter. */
function toCalendarDate(value: string): Date | undefined {
  if (value === "") return undefined;
  const [year, month, day] = value.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(year, month - 1, day);
}

function fromCalendarDate(date: Date): BusinessDate {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as BusinessDate;
}

function checkRange(value: string, min?: string, max?: string): void {
  if (max && value > max) {
    throw new DomainValueError(
      `Ngày không được sau ${formatBusinessDate(max)}`,
    );
  }
  if (min && value < min) {
    throw new DomainValueError(
      `Ngày không được trước ${formatBusinessDate(min)}`,
    );
  }
}

/**
 * A business date field that always reads and shows dd/mm/yyyy, whatever the
 * browser language (issue #37). Typed text is checked on blur or Enter; an
 * invalid entry keeps the last valid value and explains why below the field.
 * The calendar button picks a day instead of typing.
 */
export function DateInput({
  value,
  onValueChange,
  min,
  max,
  className,
  disabled,
  onBlur,
  onKeyDown,
  ...props
}: DateInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageId = useId();

  function commit(text: string) {
    try {
      const parsed = parseBusinessDateInput(text) ?? "";
      if (parsed !== "") checkRange(parsed, min, max);
      setError(null);
      if (parsed !== value) onValueChange(parsed);
    } catch (cause: unknown) {
      if (!(cause instanceof DomainValueError)) throw cause;
      setError(cause.message);
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              placeholder="dd/mm/yyyy"
              value={draft ?? formatBusinessDateInput(value)}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? messageId : undefined}
              className="h-11 w-full min-w-0 rounded-md border border-input bg-card pr-11 pl-3 text-base tabular-nums transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={(event) => {
                if (draft !== null) commit(draft);
                setDraft(null);
                onBlur?.(event);
              }}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                onKeyDown?.(event);
              }}
              {...props}
            />
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label="Mở lịch"
                className="absolute inset-y-0 right-0 text-muted-foreground"
              >
                <CalendarIcon aria-hidden />
              </Button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-auto p-0">
          <DateCalendar
            value={value}
            min={min}
            max={max}
            onSelect={(next) => {
              setError(null);
              setDraft(null);
              if (next !== value) onValueChange(next);
              setOpen(false);
              inputRef.current?.focus();
            }}
          />
        </PopoverContent>
      </Popover>
      {error && (
        <p id={messageId} className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Rendered only while the popover is open, so "today" is read in the browser. */
function DateCalendar({
  value,
  min,
  max,
  onSelect,
}: {
  value: string;
  min?: string;
  max?: string;
  onSelect: (value: BusinessDate) => void;
}) {
  const today = toBusinessDate(new Date());
  const selected = toCalendarDate(value);
  const minDate = toCalendarDate(min ?? "");
  const maxDate = toCalendarDate(max ?? "");
  const disabled = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <Calendar
      mode="single"
      locale={vi}
      captionLayout="dropdown"
      selected={selected}
      defaultMonth={selected ?? maxDate ?? toCalendarDate(today)}
      today={toCalendarDate(today)}
      startMonth={minDate ?? new Date(2000, 0)}
      endMonth={maxDate ?? toCalendarDate(addDays(today, 5 * 366))}
      disabled={disabled}
      onSelect={(date) => {
        if (date) onSelect(fromCalendarDate(date));
      }}
    />
  );
}

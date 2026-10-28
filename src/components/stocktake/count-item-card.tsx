"use client";

// One item on M6 (spec stocktakes "Đếm theo mã, xong mã này"): the
// conditions to count with − / + steppers, "Thêm tình trạng", "Xong mã
// này", and a finished item with "Sửa". Never shows the book (design D5).
import { Check, Minus, Plus } from "lucide-react";
import { forwardRef } from "react";

import { ConditionBadge } from "@/components/domain/condition-badge";
import { ToneBadge } from "@/components/domain/tone-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/domain/business-date";
import {
  CONDITION_LABELS,
  CONDITIONS,
  type Condition,
} from "@/domain/condition";
import { formatQuantity, parseQuantity } from "@/domain/quantity";

import { inputText, type ItemCount, type ItemView } from "./stocktake-model";

interface CountItemCardProps {
  item: ItemView;
  count: ItemCount | undefined;
  /** Conditions this round must count (all, or only the recounted ones). */
  required: Condition[];
  disabled: boolean;
  error: string | null;
  onStart: () => void;
  onValue: (condition: Condition, text: string) => void;
  onAddCondition: (condition: Condition) => void;
  onFinish: () => void;
  onEdit: () => void;
}

/** Typed text ± 1, kept as text so an empty box stays empty. */
function step(text: string, by: number, unit: ItemView["unit"]): string {
  let milli = 0;
  try {
    milli = text.trim() === "" ? 0 : parseQuantity(text, unit).milli;
  } catch {
    milli = 0;
  }
  const next = Math.max(0, milli + by * 1000);
  return String(next / 1000).replace(".", ",");
}

function shown(text: string, unit: ItemView["unit"]): string {
  try {
    return formatQuantity(parseQuantity(text, unit));
  } catch {
    return text;
  }
}

const timeOf = (iso: string) => formatDateTime(new Date(iso)).slice(11);

export const CountItemCard = forwardRef<HTMLElement, CountItemCardProps>(
  function CountItemCard(
    {
      item,
      count,
      required,
      disabled,
      error,
      onStart,
      onValue,
      onAddCondition,
      onFinish,
      onEdit,
    },
    ref,
  ) {
    const recounting = item.recount.length > 0;
    const title = (
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="truncate text-label">{item.itemName}</h3>
        <span className="text-caption text-muted-foreground">
          {item.itemCode}
        </span>
      </div>
    );

    if (item.state === "DONE" || item.state === "LOCKED") {
      const values = item.conditions.map((condition) => {
        const typed = count?.values[condition];
        const server = item.server[condition];
        return {
          condition,
          text:
            typed !== undefined
              ? shown(typed, item.unit)
              : server !== undefined
                ? shown(inputText(server, item.unit), item.unit)
                : "–",
        };
      });
      return (
        <article
          ref={ref}
          aria-label={`${item.itemName}, đã đếm`}
          className="flex items-center gap-3 rounded-lg border bg-card p-4"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {title}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body tabular-nums">
              {values.map((value) => (
                <span key={value.condition} className="flex items-center gap-1">
                  <ConditionBadge condition={value.condition} />
                  {value.text}
                </span>
              ))}
            </p>
            <span className="text-caption text-muted-foreground">
              {count?.countedAt
                ? `Đã đếm lúc ${timeOf(count.countedAt)}`
                : "Đã gửi văn phòng"}
            </span>
          </div>
          {item.state === "DONE" && (
            <Button
              type="button"
              variant="secondary"
              className="h-11"
              disabled={disabled}
              onClick={onEdit}
            >
              Sửa
            </Button>
          )}
        </article>
      );
    }

    if (item.state === "TODO") {
      return (
        <article
          ref={ref}
          aria-label={`${item.itemName}, chưa đếm`}
          className="flex flex-col gap-3 rounded-lg border bg-card p-4"
        >
          <div className="flex items-start gap-3">
            {title}
            {recounting ? (
              <ToneBadge tone="warning">Cần đếm lại</ToneBadge>
            ) : null}
          </div>
          <p className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
            {recounting ? "Đếm lại" : "Cần đếm"}
            {(recounting ? item.recount : required).map((condition) => (
              <ConditionBadge key={condition} condition={condition} />
            ))}
          </p>
          <Button
            type="button"
            className="h-12"
            disabled={disabled}
            onClick={onStart}
          >
            Đếm mã này
          </Button>
        </article>
      );
    }

    const missing = CONDITIONS.filter(
      (condition) => !item.conditions.includes(condition),
    );
    return (
      <article
        ref={ref}
        aria-label={`${item.itemName}, đang đếm`}
        className="flex flex-col gap-4 rounded-lg border-2 border-primary bg-card p-4"
      >
        <div className="flex items-start gap-3">
          {title}
          <ToneBadge tone="primary">Đang đếm</ToneBadge>
        </div>
        <div className="flex flex-col gap-3">
          {required.map((condition) => {
            const text = count?.values[condition] ?? "";
            const label = `Số ${item.itemName.toLowerCase()} ${CONDITION_LABELS[condition]} đếm được`;
            return (
              <div key={condition} className="flex flex-col gap-1.5">
                <ConditionBadge condition={condition} className="self-start" />
                <div role="group" aria-label={label} className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-lg"
                    className="shrink-0"
                    aria-label="Giảm 1"
                    disabled={disabled}
                    onClick={() =>
                      onValue(condition, step(text, -1, item.unit))
                    }
                  >
                    <Minus aria-hidden className="size-5" />
                  </Button>
                  <Input
                    aria-label={label}
                    inputMode={item.unit === "KG" ? "decimal" : "numeric"}
                    value={text}
                    placeholder="–"
                    disabled={disabled}
                    onChange={(event) => onValue(condition, event.target.value)}
                    className="h-12 text-center text-h2 tabular-nums"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-lg"
                    className="shrink-0"
                    aria-label="Tăng 1"
                    disabled={disabled}
                    onClick={() => onValue(condition, step(text, 1, item.unit))}
                  >
                    <Plus aria-hidden className="size-5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {missing.length > 0 && !recounting && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-muted-foreground">
              Thêm tình trạng:
            </span>
            {missing.map((condition) => (
              <Button
                key={condition}
                type="button"
                variant="outline"
                className="h-11"
                disabled={disabled}
                onClick={() => onAddCondition(condition)}
              >
                <Plus aria-hidden /> {CONDITION_LABELS[condition]}
              </Button>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="text-caption text-destructive">
            {error}
          </p>
        )}
        <Button
          type="button"
          className="h-12"
          disabled={disabled}
          onClick={onFinish}
        >
          <Check aria-hidden /> Xong mã này
        </Button>
      </article>
    );
  },
);

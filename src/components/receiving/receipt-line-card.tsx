"use client";

// One order line on M3 (spec goods-receipts "Màn nhập hàng M3"): count or
// weigh, split by condition, mark "Chuyến này không có", and say whether
// the rest is still awaited (design D3, D6).
import { forwardRef, useId } from "react";

import { ConditionSplit } from "@/components/domain/condition-split";
import { QuantityInput } from "@/components/domain/quantity-input";
import { Stepper } from "@/components/domain/stepper";
import { FieldMessage } from "@/components/purchasing/field-message";
import { unitHint } from "@/components/purchasing/preview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { needsWeighing, type ReceivingLine } from "@/domain/goods-receipt";
import {
  estimatedUnitsMilli,
  type PurchaseKind,
} from "@/domain/purchase-order";
import {
  formatQuantity,
  hasStandardWeight,
  isCountUnit,
  QUANTITY_UNIT_LABELS,
  toQuantity,
} from "@/domain/quantity";
import { cn } from "@/lib/utils";

import {
  awaitsRestOf,
  isSplit,
  lineDone,
  quantityText,
  shortAfter,
  type LineForm,
} from "./receipt-model";

interface ReceiptLineCardProps {
  kind: PurchaseKind;
  open: ReceivingLine & { itemName: string };
  line: LineForm;
  onChange: (line: LineForm) => void;
  error?: string;
  disabled?: boolean;
}

function orderedText(open: ReceivingLine): string {
  const left = open.orderedMilli - open.receivedMilli;
  return open.receivedMilli > 0
    ? `Theo đơn: còn ${quantityText(left, open.lineUnit)}`
    : `Theo đơn: ${quantityText(open.orderedMilli, open.lineUnit)}`;
}

function compareText(open: ReceivingLine, line: LineForm): string | null {
  if (line.mode !== "COUNTED") return null;
  const gap = shortAfter(open, line);
  if (gap > 0) {
    const number = formatQuantity(toQuantity(gap, open.lineUnit));
    const hint = unitHint(open.lineUnit);
    return `Thiếu ${number}${hint ? ` ${hint}` : ""} so với đơn`;
  }
  if (gap < 0) return `Nhiều hơn đơn ${quantityText(-gap, open.lineUnit)}`;
  return "Đúng như đơn";
}

export const ReceiptLineCard = forwardRef<HTMLElement, ReceiptLineCardProps>(
  function ReceiptLineCard(
    { kind, open, line, onChange, error, disabled },
    ref,
  ) {
    const id = useId();
    const done = lineDone(kind, open, line);
    const unit = open.itemUnit;
    const change = (patch: Partial<LineForm>) =>
      onChange({ ...line, ...patch });
    const gap = shortAfter(open, line);
    const awaited = awaitsRestOf(line);
    const weighing = needsWeighing(open);
    const guess =
      weighing && line.weighedKgMilli > 0
        ? estimatedUnitsMilli(line.weighedKgMilli, open.standardWeightKg, unit)
        : null;
    // kg is weighed, metres measured with decimals, count units stepped.
    const byKg = !hasStandardWeight(unit);
    const counting = isCountUnit(unit);
    const amountLabel = byKg ? "Cân thực tế" : "Thực nhận";

    return (
      <section
        ref={ref}
        aria-labelledby={`${id}-name`}
        data-done={done}
        className={cn(
          "flex scroll-mt-20 flex-col gap-4 rounded-lg border bg-card p-4",
          done ? "border-border" : "border-2 border-warning",
        )}
      >
        <header className="flex flex-col gap-1">
          <h3 id={`${id}-name`} className="text-h3">
            {open.itemName}
          </h3>
          <p className="text-body text-muted-foreground">
            {orderedText(open)}
            {line.mode === "PENDING" && " · chưa đếm"}
          </p>
        </header>

        {line.mode === "PENDING" && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              className="h-12"
              disabled={disabled}
              onClick={() => change({ mode: "COUNTED" })}
            >
              Đếm
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-12"
              disabled={disabled}
              onClick={() => change({ mode: "NOT_IN_TRIP", awaitsRest: null })}
            >
              Chuyến này không có
            </Button>
          </div>
        )}

        {line.mode === "COUNTED" && (
          <fieldset disabled={disabled} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-label">{amountLabel}</span>
              {counting ? (
                <Stepper
                  label={`Thực nhận ${open.itemName}`}
                  value={toQuantity(line.quantityMilli, unit)}
                  onValueChange={(q) => change({ quantityMilli: q.milli })}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <QuantityInput
                    aria-label={`${amountLabel} ${open.itemName}`}
                    value={toQuantity(line.quantityMilli, unit)}
                    onValueChange={(q) =>
                      change({ quantityMilli: Math.max(q.milli, 0) })
                    }
                    className="h-12 text-h2"
                  />
                  <span className="text-label">
                    {QUANTITY_UNIT_LABELS[unit]}
                  </span>
                </div>
              )}
              {!counting && (
                <p className="text-caption text-muted-foreground">
                  Dùng dấu phẩy cho số lẻ.
                  {byKg &&
                    kind === "USED" &&
                    " Phế liệu nhập thẳng vào tình trạng Phế liệu."}
                </p>
              )}
            </div>

            {weighing && (
              <div className="flex flex-col gap-1">
                <span className="text-label">Số kg cân</span>
                <div className="flex items-center gap-2">
                  <QuantityInput
                    aria-label={`Số kg cân ${open.itemName}`}
                    value={toQuantity(line.weighedKgMilli, "KG")}
                    onValueChange={(q) =>
                      change({ weighedKgMilli: Math.max(q.milli, 0) })
                    }
                    className="h-12 text-h2"
                  />
                  <span className="text-label">kg</span>
                </div>
                {guess !== null && (
                  <p className="text-caption text-muted-foreground">
                    ≈ {quantityText(guess, unit)} theo trọng lượng chuẩn
                  </p>
                )}
              </div>
            )}

            <p className="text-label text-muted-foreground">
              {compareText(open, line)}
            </p>

            {isSplit(kind, open) && (
              <ConditionSplit
                total={toQuantity(line.quantityMilli, unit)}
                value={{
                  GOOD: toQuantity(line.good, unit),
                  NEEDS_REPAIR: toQuantity(line.repair, unit),
                  SCRAP: toQuantity(line.scrap, unit),
                  LOST: toQuantity(0, unit),
                }}
                onValueChange={(parts) =>
                  change({
                    good: parts.GOOD.milli,
                    repair: parts.NEEDS_REPAIR.milli,
                    scrap: parts.SCRAP.milli,
                  })
                }
                balancedLabel={`Đã chia đủ ${quantityText(line.quantityMilli, unit)}`}
              />
            )}
          </fieldset>
        )}

        {line.mode === "NOT_IN_TRIP" && (
          <p className="text-label">Chuyến này không có</p>
        )}

        {line.mode !== "PENDING" && gap > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex min-h-12 items-center gap-3">
              <Checkbox
                id={`${id}-wait`}
                checked={awaited}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  change({ awaitsRest: checked === true })
                }
                className="size-6"
              />
              <label htmlFor={`${id}-wait`} className="text-body">
                {line.mode === "NOT_IN_TRIP"
                  ? "Chờ chuyến sau"
                  : `Chờ giao bù ${quantityText(gap, open.lineUnit)} thiếu`}
              </label>
            </div>
            {!awaited && line.mode === "COUNTED" && (
              <p className="text-caption text-muted-foreground">
                Không tích: đơn tính theo{" "}
                {quantityText(
                  open.receivedMilli +
                    (weighing ? line.weighedKgMilli : line.quantityMilli),
                  open.lineUnit,
                )}{" "}
                thực nhận.
              </p>
            )}
          </div>
        )}

        {line.mode !== "PENDING" && (
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            disabled={disabled}
            onClick={() =>
              change(
                line.mode === "COUNTED"
                  ? {
                      mode: "NOT_IN_TRIP",
                      awaitsRest: null,
                      quantityMilli: 0,
                      weighedKgMilli: 0,
                      good: 0,
                      repair: 0,
                      scrap: 0,
                    }
                  : { mode: "COUNTED", awaitsRest: null },
              )
            }
          >
            {line.mode === "COUNTED" ? "Chuyến này không có" : "Đếm"}
          </Button>
        )}
        <FieldMessage message={error} />
      </section>
    );
  },
);

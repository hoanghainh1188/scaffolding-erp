"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ALLOCATION_METHOD_LABELS,
  ALLOCATION_METHODS,
  type AllocationMethod,
} from "@/domain/landed-cost";
import { formatMoney, type Money } from "@/domain/money";
import { COST_LABEL_SUGGESTIONS } from "@/domain/purchase-order";
import { cn } from "@/lib/utils";

import { FieldMessage } from "./field-message";
import type { DraftCost } from "./preview";

const METHOD_HINTS: Readonly<Record<AllocationMethod, string>> = {
  VALUE: "Dòng nào thành tiền lớn thì chịu nhiều chi phí hơn.",
  WEIGHT: "Dùng trọng lượng chuẩn của mã hàng. Hợp khi chở nhiều sắt nặng.",
};

interface OrderCostsProps {
  costs: DraftCost[];
  total: Money;
  method: AllocationMethod;
  allocationError: string | null;
  locked: boolean;
  errors: Readonly<Record<string, string>>;
  onChange: (key: number, change: Partial<DraftCost>) => void;
  onAdd: () => void;
  onRemove: (key: number) => void;
  onMethod: (method: AllocationMethod) => void;
}

/** D3 "Chi phí mua hàng" and "Cách chia chi phí". */
export function OrderCosts({
  costs,
  total,
  method,
  allocationError,
  locked,
  errors,
  onChange,
  onAdd,
  onRemove,
  onMethod,
}: OrderCostsProps) {
  return (
    <section
      aria-labelledby="order-costs-title"
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="order-costs-title" className="font-display text-h2">
          Chi phí mua hàng
        </h2>
        <p className="text-sm text-muted-foreground">
          Các khoản này được chia vào giá nhập của từng dòng hàng.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <datalist id="cost-labels">
            {COST_LABEL_SUGGESTIONS.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
          {costs.map((cost, index) => (
            <div key={cost.key} className="flex flex-col">
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Tên khoản chi phí ${index + 1}`}
                  list="cost-labels"
                  value={cost.label}
                  disabled={locked}
                  maxLength={60}
                  placeholder="Cước xe tải"
                  onChange={(event) =>
                    onChange(cost.key, { label: event.target.value })
                  }
                  className="h-10 min-w-0 flex-1"
                />
                <Input
                  aria-label={`Số tiền ${cost.label || `khoản ${index + 1}`}`}
                  inputMode="numeric"
                  value={cost.amount}
                  disabled={locked}
                  onChange={(event) =>
                    onChange(cost.key, { amount: event.target.value })
                  }
                  className="h-10 w-32 text-right tabular-nums"
                />
                {locked ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Xóa khoản ${cost.label || index + 1}`}
                    onClick={() => onRemove(cost.key)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </div>
              <FieldMessage message={errors[`costs.${index}.label`]} />
              <FieldMessage message={errors[`costs.${index}.amount`]} />
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-3 font-semibold">
            <span>Tổng chi phí</span>
            <span className="tabular-nums">{formatMoney(total)}</span>
          </div>
          {locked ? null : (
            <Button
              type="button"
              variant="outline"
              className="self-start border-dashed"
              onClick={onAdd}
            >
              <Plus aria-hidden /> Thêm khoản chi phí
            </Button>
          )}
        </div>
        <fieldset className="flex flex-col gap-3" disabled={locked}>
          <legend className="mb-2 text-label">Cách chia chi phí</legend>
          {ALLOCATION_METHODS.map((value) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border p-3 has-focus-visible:ring-2 has-focus-visible:ring-ring",
                method === value ? "border-primary bg-accent" : "bg-card",
              )}
            >
              <input
                type="radio"
                name="allocation"
                value={value}
                checked={method === value}
                onChange={() => onMethod(value)}
                className="mt-1 size-4 accent-primary"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">
                  {ALLOCATION_METHOD_LABELS[value]}
                </span>
                <span className="text-sm text-muted-foreground">
                  {METHOD_HINTS[value]}
                </span>
              </span>
            </label>
          ))}
          <FieldMessage message={allocationError ?? errors.allocationMethod} />
        </fieldset>
      </div>
    </section>
  );
}

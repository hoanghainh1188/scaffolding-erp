"use client";

// "Chi phí chuyến này" on M3 (requirements 0.2 #25, #26, #28): the first
// trip starts from the order's expected costs, later trips from nothing.
import { Plus, Trash2 } from "lucide-react";

import { FieldMessage } from "@/components/purchasing/field-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ALLOCATION_METHOD_LABELS } from "@/domain/landed-cost";
import { formatMoney, toMoney } from "@/domain/money";
import { COST_LABEL_SUGGESTIONS } from "@/domain/purchase-order";

import type { CostForm } from "./receipt-model";

interface TripCostsProps {
  costs: CostForm[];
  total: number;
  prefilled: boolean;
  method: "VALUE" | "WEIGHT";
  disabled?: boolean;
  error?: string;
  onChange: (costs: CostForm[]) => void;
}

export function TripCosts({
  costs,
  total,
  prefilled,
  method,
  disabled,
  error,
  onChange,
}: TripCostsProps) {
  const set = (index: number, patch: Partial<CostForm>) =>
    onChange(
      costs.map((cost, i) => (i === index ? { ...cost, ...patch } : cost)),
    );
  return (
    <section
      aria-labelledby="trip-costs-title"
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="trip-costs-title" className="text-h3">
          Chi phí chuyến này
        </h2>
        {prefilled && (
          <p className="text-caption text-muted-foreground">
            Đã điền sẵn chi phí dự kiến của đơn. Sửa theo số thật trả nhà xe,
            bốc xếp.
          </p>
        )}
      </div>
      <datalist id="trip-cost-labels">
        {COST_LABEL_SUGGESTIONS.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      {costs.map((cost, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            aria-label={`Tên khoản chi phí ${index + 1}`}
            list="trip-cost-labels"
            value={cost.label}
            disabled={disabled}
            maxLength={60}
            placeholder="Cước xe tải"
            onChange={(event) => set(index, { label: event.target.value })}
            className="h-12 min-w-0 flex-1"
          />
          <Input
            aria-label={`Số tiền ${cost.label || `khoản ${index + 1}`}`}
            inputMode="numeric"
            value={cost.amount}
            disabled={disabled}
            onChange={(event) => set(index, { amount: event.target.value })}
            className="h-12 w-32 text-right tabular-nums"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-12"
            disabled={disabled}
            aria-label={`Xóa khoản ${cost.label || index + 1}`}
            onClick={() => onChange(costs.filter((_, i) => i !== index))}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="h-12 self-start border-dashed"
        disabled={disabled}
        onClick={() => onChange([...costs, { label: "", amount: "" }])}
      >
        <Plus aria-hidden /> Thêm khoản
      </Button>
      <FieldMessage message={error} />
      <div className="flex flex-col gap-1 rounded-lg bg-primary p-4 text-primary-foreground">
        <span className="text-label">Tổng chi phí chuyến</span>
        <span className="font-display text-h1 tabular-nums">
          {formatMoney(toMoney(total))}
        </span>
        <span className="text-caption">
          Chia vào giá nhập hàng của chuyến này,{" "}
          {ALLOCATION_METHOD_LABELS[method].toLowerCase()} (cách chia trên đơn).
          Không cộng vào tiền trả người bán.
        </span>
      </div>
    </section>
  );
}

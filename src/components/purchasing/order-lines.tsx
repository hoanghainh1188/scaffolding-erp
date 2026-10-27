"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, type Money } from "@/domain/money";
import { QUANTITY_UNIT_LABELS, type QuantityUnit } from "@/domain/quantity";
import { cn } from "@/lib/utils";

import { FieldMessage } from "./field-message";
import type { DraftLine, ItemChoice, LinePreview } from "./preview";

interface OrderLinesProps {
  lines: DraftLine[];
  previews: LinePreview[];
  items: ItemChoice[];
  itemById: ReadonlyMap<string, ItemChoice>;
  locked: boolean;
  errors: Readonly<Record<string, string>>;
  onChange: (key: number, change: Partial<DraftLine>) => void;
  onAdd: () => void;
  onRemove: (key: number) => void;
}

const cell = "border-b px-2 py-2 align-top";
const amountText = (value: number | null) =>
  value === null ? "–" : formatMoney(value as Money).replace(" ₫", "");

/** D3 "Hàng hóa": one row per item, with the landed-cost preview. */
export function OrderLines({
  lines,
  previews,
  items,
  itemById,
  locked,
  errors,
  onChange,
  onAdd,
  onRemove,
}: OrderLinesProps) {
  return (
    <section
      aria-labelledby="order-lines-title"
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="order-lines-title" className="font-display text-h2">
          Hàng hóa
        </h2>
        <span className="text-sm text-muted-foreground">
          {lines.length} dòng
        </span>
      </div>
      <FieldMessage message={errors.lines} />
      <div className="relative overflow-x-auto rounded-md border">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th scope="col" className="px-2 py-2.5 font-semibold">
                Mã hàng
              </th>
              <th scope="col" className="px-2 py-2.5 font-semibold">
                Đơn vị
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                Số lượng
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                Đơn giá
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                Thành tiền
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                Chi phí phân bổ
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                Giá nhập / đơn vị
              </th>
              <th scope="col" className="px-2 py-2.5">
                <span className="sr-only">Xóa</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const choice = itemById.get(line.itemId);
              const preview = previews[index];
              const name = choice ? choice.name : `dòng ${index + 1}`;
              const field = (key: string) => errors[`lines.${index}.${key}`];
              return (
                <tr key={line.key} className="bg-card">
                  <td className={cn(cell, "min-w-44")}>
                    <select
                      aria-label={`Mã hàng dòng ${index + 1}`}
                      value={line.itemId}
                      disabled={locked}
                      onChange={(event) => {
                        const picked = itemById.get(event.target.value);
                        onChange(line.key, {
                          itemId: event.target.value,
                          ...(picked?.unit === "KG" ? { unit: "KG" } : {}),
                        });
                      }}
                      className="h-10 w-52 rounded-md border border-input bg-card px-2 text-sm"
                    >
                      <option value="">Chọn mã hàng</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} · {item.name}
                        </option>
                      ))}
                    </select>
                    <FieldMessage message={field("itemId")} />
                  </td>
                  <td className={cell}>
                    <UnitSwitch
                      name={name}
                      value={line.unit}
                      kgOnly={choice?.unit === "KG"}
                      disabled={locked}
                      onChange={(unit) => onChange(line.key, { unit })}
                    />
                    <FieldMessage message={field("unit")} />
                  </td>
                  <td className={cn(cell, "w-28")}>
                    <Input
                      aria-label={`Số lượng ${name}${line.unit === "KG" ? " (kg)" : ""}`}
                      inputMode="decimal"
                      value={line.quantity}
                      disabled={locked}
                      onChange={(event) =>
                        onChange(line.key, { quantity: event.target.value })
                      }
                      className="h-10 w-24 text-right tabular-nums"
                    />
                    {preview?.pieces != null ? (
                      <p className="mt-1 text-right text-caption text-muted-foreground">
                        ≈ {preview.pieces.toLocaleString("vi-VN")} cái
                      </p>
                    ) : null}
                    <FieldMessage message={field("quantity")} />
                  </td>
                  <td className={cn(cell, "w-32")}>
                    <Input
                      aria-label={`Đơn giá ${name}${line.unit === "KG" ? " mỗi kg" : ""}`}
                      inputMode="numeric"
                      value={line.unitPrice}
                      disabled={locked}
                      onChange={(event) =>
                        onChange(line.key, { unitPrice: event.target.value })
                      }
                      className="h-10 w-28 text-right tabular-nums"
                    />
                    <FieldMessage message={field("unitPrice")} />
                  </td>
                  <td className={cn(cell, "py-4 text-right tabular-nums")}>
                    {amountText(preview?.amount ?? null)}
                  </td>
                  <td
                    className={cn(
                      cell,
                      "py-4 text-right text-muted-foreground tabular-nums",
                    )}
                  >
                    {preview?.allocated != null
                      ? `+${amountText(preview.allocated)}`
                      : "–"}
                  </td>
                  <td
                    className={cn(
                      cell,
                      "py-4 text-right font-semibold whitespace-nowrap tabular-nums",
                    )}
                  >
                    {preview?.unitCost != null
                      ? `${formatMoney(preview.unitCost)}${line.unit === "KG" ? "/kg" : ""}`
                      : "–"}
                  </td>
                  <td className={cn(cell, "w-12")}>
                    {locked ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Xóa ${name}`}
                        onClick={() => onRemove(line.key)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {locked ? null : (
        <Button
          type="button"
          variant="outline"
          className="self-start border-dashed"
          onClick={onAdd}
        >
          <Plus aria-hidden /> Thêm dòng hàng
        </Button>
      )}
    </section>
  );
}

interface UnitSwitchProps {
  name: string;
  value: QuantityUnit;
  kgOnly: boolean;
  disabled: boolean;
  onChange: (unit: QuantityUnit) => void;
}

/** "cái | kg": a kg item has only kg (spec "Đơn vị đặt hàng"). */
function UnitSwitch({
  name,
  value,
  kgOnly,
  disabled,
  onChange,
}: UnitSwitchProps) {
  const units: QuantityUnit[] = kgOnly ? ["KG"] : ["PIECE", "KG"];
  return (
    <div
      role="group"
      aria-label={`Đơn vị ${name}`}
      className="inline-flex rounded-pill bg-muted p-0.5"
    >
      {units.map((unit) => (
        <button
          key={unit}
          type="button"
          aria-pressed={value === unit}
          disabled={disabled}
          onClick={() => onChange(unit)}
          className={cn(
            "h-8 min-w-11 rounded-pill px-2.5 text-caption font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed",
            value === unit
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {QUANTITY_UNIT_LABELS[unit]}
        </button>
      ))}
    </div>
  );
}

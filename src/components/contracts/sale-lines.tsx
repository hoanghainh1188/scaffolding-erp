"use client";

import { Plus, X } from "lucide-react";

import { FieldMessage } from "@/components/purchasing/field-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONDITION_LABELS } from "@/domain/condition";
import { byWeight, SALE_CONDITIONS } from "@/domain/contract-lines";
import { formatMoney, toMoney } from "@/domain/money";
import { QUANTITY_UNIT_LABELS, type QuantityUnit } from "@/domain/quantity";

import { nextKey, type ItemOption, type SaleRow } from "./form-model";

interface SaleLinesProps {
  rows: SaleRow[];
  items: readonly ItemOption[];
  total: number | null;
  errors: Readonly<Record<string, string>>;
  onRows: (rows: SaleRow[]) => void;
  disabled?: boolean;
}

/** D5a "Hàng bán": by piece or by kg; scrap only by kg. */
export function SaleLines({
  rows,
  items,
  total,
  errors,
  onRows,
  disabled = false,
}: SaleLinesProps) {
  const itemOf = new Map(items.map((entry) => [entry.id, entry]));
  const change = (key: number, patch: Partial<SaleRow>) =>
    onRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th scope="col" className="border-b px-3 py-2.5 font-semibold">
                Hàng
              </th>
              <th scope="col" className="border-b px-3 py-2.5 font-semibold">
                Tình trạng
              </th>
              <th scope="col" className="border-b px-3 py-2.5 font-semibold">
                Tính theo
              </th>
              <th
                scope="col"
                className="border-b px-3 py-2.5 text-right font-semibold"
              >
                Số lượng
              </th>
              <th
                scope="col"
                className="border-b px-3 py-2.5 text-right font-semibold"
              >
                Đơn giá
              </th>
              <th scope="col" className="border-b px-3 py-2.5">
                <span className="sr-only">Bỏ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const found = itemOf.get(row.itemId);
              const unit = (found?.unit ?? "PIECE") as QuantityUnit;
              const name = `lines.${index}`;
              return (
                <tr key={row.key} className="bg-card">
                  <td className="border-b px-3 py-2">
                    <Label htmlFor={`sale-item-${row.key}`} className="sr-only">
                      Mã hàng
                    </Label>
                    <select
                      id={`sale-item-${row.key}`}
                      value={row.itemId}
                      disabled={disabled}
                      onChange={(event) =>
                        change(row.key, { itemId: event.target.value })
                      }
                      className="h-9 min-w-48 rounded-md border border-input bg-card px-2"
                    >
                      <option value="">Chọn mã hàng</option>
                      {items.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.code} · {entry.name}
                        </option>
                      ))}
                    </select>
                    <FieldMessage message={errors[`${name}.itemId`]} />
                  </td>
                  <td className="border-b px-3 py-2">
                    <Label
                      htmlFor={`sale-condition-${row.key}`}
                      className="sr-only"
                    >
                      Tình trạng
                    </Label>
                    <select
                      id={`sale-condition-${row.key}`}
                      value={row.condition}
                      disabled={disabled}
                      onChange={(event) =>
                        change(row.key, {
                          condition: event.target.value,
                          ...(event.target.value === "SCRAP"
                            ? { pricingUnit: "KG" as const }
                            : {}),
                        })
                      }
                      className="h-9 rounded-md border border-input bg-card px-2"
                    >
                      {SALE_CONDITIONS.map((condition) => (
                        <option key={condition} value={condition}>
                          {CONDITION_LABELS[condition]}
                        </option>
                      ))}
                    </select>
                    <FieldMessage message={errors[`${name}.condition`]} />
                  </td>
                  <td className="border-b px-3 py-2">
                    <Label htmlFor={`sale-unit-${row.key}`} className="sr-only">
                      Tính theo
                    </Label>
                    <select
                      id={`sale-unit-${row.key}`}
                      value={row.pricingUnit}
                      disabled={disabled || row.condition === "SCRAP"}
                      onChange={(event) =>
                        change(row.key, {
                          pricingUnit: byWeight(event.target.value)
                            ? "KG"
                            : "ITEM",
                        })
                      }
                      className="h-9 rounded-md border border-input bg-card px-2"
                    >
                      <option value="ITEM">{QUANTITY_UNIT_LABELS[unit]}</option>
                      <option value="KG">kg</option>
                    </select>
                  </td>
                  <td className="border-b px-3 py-2 text-right">
                    <Label htmlFor={`sale-qty-${row.key}`} className="sr-only">
                      Số lượng
                    </Label>
                    <Input
                      id={`sale-qty-${row.key}`}
                      inputMode="decimal"
                      value={row.quantity}
                      disabled={disabled}
                      onChange={(event) =>
                        change(row.key, { quantity: event.target.value })
                      }
                      className="ml-auto h-9 w-28 text-right tabular-nums"
                    />
                    <FieldMessage message={errors[`${name}.quantity`]} />
                  </td>
                  <td className="border-b px-3 py-2 text-right">
                    <Label
                      htmlFor={`sale-price-${row.key}`}
                      className="sr-only"
                    >
                      Đơn giá
                    </Label>
                    <Input
                      id={`sale-price-${row.key}`}
                      inputMode="numeric"
                      value={row.price}
                      disabled={disabled}
                      onChange={(event) =>
                        change(row.key, { price: event.target.value })
                      }
                      className="ml-auto h-9 w-32 text-right tabular-nums"
                    />
                    <FieldMessage message={errors[`${name}.price`]} />
                  </td>
                  <td className="border-b px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label="Bỏ dòng"
                      disabled={disabled}
                      onClick={() =>
                        onRows(rows.filter((entry) => entry.key !== row.key))
                      }
                    >
                      <X aria-hidden />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted">
              <th
                scope="row"
                colSpan={4}
                className="px-3 py-2.5 text-left font-semibold"
              >
                Tổng tiền hàng
              </th>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                {total === null ? "–" : formatMoney(toMoney(total))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={disabled}
        onClick={() =>
          onRows([
            ...rows,
            {
              key: nextKey(),
              itemId: "",
              condition: "GOOD",
              pricingUnit: "ITEM",
              quantity: "",
              price: "",
            },
          ])
        }
      >
        <Plus aria-hidden /> Thêm mã hàng
      </Button>
      <p className="text-sm text-muted-foreground">
        Hợp đồng bán nhập giá tay. Bán theo kg được cho mã có trọng lượng chuẩn;
        phế liệu chỉ bán theo kg.
      </p>
    </div>
  );
}

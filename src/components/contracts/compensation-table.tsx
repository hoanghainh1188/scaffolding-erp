"use client";

import { RotateCcw } from "lucide-react";

import { FieldMessage } from "@/components/purchasing/field-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, toMoney } from "@/domain/money";
import { QUANTITY_UNIT_LABELS, type QuantityUnit } from "@/domain/quantity";
import { cn } from "@/lib/utils";

import {
  readMoney,
  type CompensationRow,
  type ItemOption,
  type RentRow,
} from "./form-model";

interface CompensationTableProps {
  rows: readonly RentRow[];
  items: readonly ItemOption[];
  values: Readonly<Record<string, CompensationRow>>;
  errors: Readonly<Record<string, string>>;
  onChange: (itemId: string, value: CompensationRow) => void;
  /** "Lấy lại bảng chung" (drafts only). */
  onRefresh?: () => void;
  /** D5b: the prices in force. */
  baseline?: ReadonlyMap<
    string,
    { lost: number | null; damage: number | null }
  >;
  disabled?: boolean;
}

const money = (value: number | null | undefined) =>
  value === null || value === undefined ? "–" : formatMoney(toMoney(value));

/** D5a "Bảng giá đền bù": copied from the company table (0.2 #49). */
export function CompensationTable({
  rows,
  items,
  values,
  errors,
  onChange,
  onRefresh,
  baseline,
  disabled = false,
}: CompensationTableProps) {
  const itemOf = new Map(items.map((entry) => [entry.id, entry]));
  return (
    <div className="flex flex-col gap-3">
      {onRefresh ? (
        <Button
          type="button"
          variant="outline"
          className="self-end"
          disabled={disabled}
          onClick={onRefresh}
        >
          <RotateCcw aria-hidden /> Lấy lại bảng chung
        </Button>
      ) : null}
      <div className="relative overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th scope="col" className="border-b px-3 py-2.5 font-semibold">
                Hàng
              </th>
              <th
                scope="col"
                className="border-b px-3 py-2.5 text-right font-semibold"
              >
                Mất
              </th>
              <th
                scope="col"
                className="border-b px-3 py-2.5 text-right font-semibold"
              >
                Hỏng, sửa được
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const found = itemOf.get(row.itemId);
              const unit =
                QUANTITY_UNIT_LABELS[(found?.unit ?? "PIECE") as QuantityUnit];
              const value = values[row.itemId] ?? { lost: "", damage: "" };
              const before = baseline?.get(row.itemId);
              const field = (kind: "lost" | "damage") => {
                const typed = readMoney(value[kind]);
                const table =
                  kind === "lost" ? found?.lostPrice : found?.damagePrice;
                const current = kind === "lost" ? before?.lost : before?.damage;
                const changed =
                  before !== undefined && typed !== (current ?? null);
                const errorKey = `compensations.${row.itemId}.${kind === "lost" ? "lostPrice" : "damagePrice"}`;
                return (
                  <td className="border-b px-3 py-2 text-right">
                    <Label htmlFor={`${kind}-${row.key}`} className="sr-only">
                      Giá {kind === "lost" ? "mất" : "hỏng"} {found?.code} /{" "}
                      {unit}
                    </Label>
                    <Input
                      id={`${kind}-${row.key}`}
                      inputMode="numeric"
                      value={value[kind]}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange(row.itemId, {
                          ...value,
                          [kind]: event.target.value,
                        })
                      }
                      className={cn(
                        "ml-auto h-9 w-32 text-right tabular-nums",
                        changed && "border-2 border-warning",
                      )}
                    />
                    {before !== undefined ? (
                      <span className="block text-caption text-muted-foreground">
                        Hiện tại: {money(current)}
                      </span>
                    ) : table !== null &&
                      table !== undefined &&
                      typed !== table ? (
                      <span className="block text-caption text-warning">
                        Bảng chung: {money(table)}
                      </span>
                    ) : null}
                    <FieldMessage message={errors[errorKey]} />
                  </td>
                );
              };
              return (
                <tr key={row.key} className="bg-card">
                  <th
                    scope="row"
                    className="border-b px-3 py-2 text-left font-normal"
                  >
                    <span className="font-medium">
                      {found?.name ?? row.itemId}
                    </span>
                    <span className="block text-caption text-muted-foreground">
                      {found?.code} · / {unit}
                    </span>
                  </th>
                  {field("lost")}
                  {field("damage")}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        Giá lấy từ bảng đền bù chung của công ty; sửa riêng cho hợp đồng này.
        Hàng hỏng thành phế liệu tính như mất.
      </p>
    </div>
  );
}

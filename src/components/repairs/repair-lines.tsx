"use client";

// D12 "Hàng đem sửa": one row per item, with the line error right under it
// (spec "Màn D12 phiếu sửa chữa", scenario "Báo lỗi ngay trên dòng").
import { XIcon } from "lucide-react";

import { FieldMessage } from "@/components/purchasing/field-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, type Money } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  toQuantity,
} from "@/domain/quantity";
import type { AwaitingItem } from "@/lib/repairs/queries";

export interface DraftLine {
  key: number;
  itemId: string;
  taken: string;
  good: string;
  scrap: string;
  cost: string;
  /** False until the user types in "Sửa xong"; until then it follows. */
  goodTouched: boolean;
}

interface RepairLinesProps {
  lines: DraftLine[];
  facts: ReadonlyMap<string, AwaitingItem>;
  /** Error per row (from the form) and per field (from the server). */
  rowErrors: ReadonlyMap<number, string>;
  errors: Record<string, string>;
  total: Money;
  choices: AwaitingItem[];
  readOnly: boolean;
  onChange: (key: number, change: Partial<DraftLine>) => void;
  /** Groups the typed cost ("1980000" → "1.980.000"). */
  onCostBlur?: (key: number) => void;
  onAdd: (itemId: string) => void;
  onRemove: (key: number) => void;
}

const COLUMNS = [
  "Hàng",
  "Lấy ra sửa",
  "Sửa xong → Tốt",
  "Hỏng hẳn → Phế liệu",
  "Chi phí sửa",
];

export function RepairLines({
  lines,
  facts,
  rowErrors,
  errors,
  total,
  choices,
  readOnly,
  onChange,
  onCostBlur,
  onAdd,
  onRemove,
}: RepairLinesProps) {
  const numberInput = (
    line: DraftLine,
    index: number,
    name: "taken" | "good" | "scrap" | "cost",
    field: string,
    label: string,
  ) => (
    <td className="border-b px-3 py-2.5 align-top">
      <Input
        aria-label={label}
        inputMode="numeric"
        value={line[name]}
        readOnly={readOnly}
        aria-invalid={Boolean(errors[`lines.${index}.${field}`])}
        onChange={(event) =>
          onChange(line.key, {
            [name]: event.target.value,
            ...(name === "good" ? { goodTouched: true } : {}),
          })
        }
        onBlur={name === "cost" ? () => onCostBlur?.(line.key) : undefined}
        className="ml-auto w-28 text-right tabular-nums"
      />
      <div className="ml-auto max-w-44 text-right">
        <FieldMessage message={errors[`lines.${index}.${field}`]} />
      </div>
    </td>
  );

  return (
    <section
      aria-labelledby="repair-lines-title"
      className="flex flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="repair-lines-title" className="font-display text-h2">
          Hàng đem sửa
        </h2>
        {readOnly ? null : (
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Thêm mã hàng</span>
            <select
              value=""
              disabled={choices.length === 0}
              onChange={(event) => {
                if (event.target.value) onAdd(event.target.value);
              }}
              className="h-11 w-56 max-w-full rounded-md border border-input bg-card px-3 text-sm font-semibold"
            >
              <option value="">+ Thêm mã hàng</option>
              {choices.map((item) => (
                <option key={item.itemId} value={item.itemId}>
                  {item.itemName} · {item.itemCode}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <FieldMessage message={errors.lines} />
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chọn hàng ở danh sách Đang chờ sửa hoặc bấm Thêm mã hàng.
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted text-left">
              <tr>
                {COLUMNS.map((label, index) => (
                  <th
                    key={label}
                    scope="col"
                    className={`border-b px-3 py-2.5 font-semibold ${index > 0 ? "text-right" : ""}`}
                  >
                    {label}
                  </th>
                ))}
                {readOnly ? null : (
                  <th scope="col" className="border-b px-3 py-2.5">
                    <span className="sr-only">Bỏ dòng</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const item = facts.get(line.itemId);
                const name = item?.itemName ?? line.itemId;
                const code = item?.itemCode ?? "";
                const rowError = rowErrors.get(line.key);
                return (
                  <tr key={line.key} className="bg-card">
                    <th
                      scope="row"
                      className="border-b px-3 py-2.5 text-left align-top font-normal"
                    >
                      <span className="block font-semibold">{name}</span>
                      <span className="text-caption text-muted-foreground">
                        {item
                          ? `đang chờ sửa ${formatQuantity(toQuantity(item.onHandMilli, item.unit))} ${QUANTITY_UNIT_LABELS[item.unit]}`
                          : code}
                      </span>
                      {rowError ? (
                        <p
                          role="alert"
                          className="mt-1 text-caption text-destructive"
                        >
                          {rowError}
                        </p>
                      ) : null}
                    </th>
                    {numberInput(
                      line,
                      index,
                      "taken",
                      "quantityTaken",
                      `Lấy ra sửa ${code}`,
                    )}
                    {numberInput(
                      line,
                      index,
                      "good",
                      "quantityGood",
                      `Sửa xong ${code}`,
                    )}
                    {numberInput(
                      line,
                      index,
                      "scrap",
                      "quantityScrap",
                      `Hỏng hẳn ${code}`,
                    )}
                    {numberInput(
                      line,
                      index,
                      "cost",
                      "repairCost",
                      `Chi phí sửa ${code}`,
                    )}
                    {readOnly ? null : (
                      <td className="border-b px-1 py-2.5 align-top">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Bỏ ${name}`}
                          onClick={() => onRemove(line.key)}
                        >
                          <XIcon aria-hidden />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <th scope="row" colSpan={4} className="px-3 py-2.5 text-left">
                  Tổng chi phí sửa
                </th>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatMoney(total)}
                </td>
                {readOnly ? null : <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-caption text-muted-foreground">
        Sửa xong + Phế liệu phải bằng số lấy ra. Chi phí ghi theo từng mã: tiền
        công, sơn, que hàn… gộp một số.
      </p>
    </section>
  );
}

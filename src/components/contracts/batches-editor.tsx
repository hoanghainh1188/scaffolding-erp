"use client";

import { Plus, X } from "lucide-react";

import { DateInput } from "@/components/domain/date-input";
import { FieldMessage } from "@/components/purchasing/field-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { nextKey, type BatchRow } from "./form-model";

export interface BatchChoice {
  /** "kit:<id>" or "item:<id>" */
  ref: string;
  label: string;
}

interface BatchesEditorProps {
  rows: BatchRow[];
  /** Kits and items on the contract: a batch only brings those. */
  choices: readonly BatchChoice[];
  errors: Readonly<Record<string, string>>;
  onRows: (rows: BatchRow[]) => void;
  disabled?: boolean;
}

/** D5a "Kế hoạch giao hàng": a forecast only (contracts design D6). */
export function BatchesEditor({
  rows,
  choices,
  errors,
  onRows,
  disabled = false,
}: BatchesEditorProps) {
  const change = (key: number, patch: Partial<BatchRow>) =>
    onRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <li
            key={row.key}
            className="flex flex-col gap-2 rounded-md border p-3"
          >
            <div className="flex flex-wrap items-end gap-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-muted font-semibold tabular-nums">
                {index + 1}
              </span>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`batch-date-${row.key}`}>Ngày giao</Label>
                <DateInput
                  id={`batch-date-${row.key}`}
                  value={row.plannedDate}
                  disabled={disabled}
                  onValueChange={(value) =>
                    change(row.key, { plannedDate: value })
                  }
                />
                <FieldMessage
                  message={errors[`batches.${index}.plannedDate`]}
                />
              </div>
              <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                <Label htmlFor={`batch-note-${row.key}`}>Ghi chú</Label>
                <Input
                  id={`batch-note-${row.key}`}
                  value={row.note}
                  maxLength={200}
                  disabled={disabled}
                  onChange={(event) =>
                    change(row.key, { note: event.target.value })
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={`Bỏ đợt ${index + 1}`}
                disabled={disabled}
                onClick={() =>
                  onRows(rows.filter((entry) => entry.key !== row.key))
                }
              >
                <X aria-hidden />
              </Button>
            </div>
            <ul className="flex flex-col gap-2">
              {row.lines.map((line, lineIndex) => (
                <li
                  key={line.key}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Label htmlFor={`batch-ref-${line.key}`} className="sr-only">
                    Hàng của đợt {index + 1}
                  </Label>
                  <select
                    id={`batch-ref-${line.key}`}
                    value={line.ref}
                    disabled={disabled}
                    onChange={(event) =>
                      change(row.key, {
                        lines: row.lines.map((entry) =>
                          entry.key === line.key
                            ? { ...entry, ref: event.target.value }
                            : entry,
                        ),
                      })
                    }
                    className="h-9 min-w-56 rounded-md border border-input bg-card px-2"
                  >
                    <option value="">Chọn bộ hoặc mã hàng</option>
                    {choices.map((choice) => (
                      <option key={choice.ref} value={choice.ref}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                  <Label htmlFor={`batch-qty-${line.key}`} className="sr-only">
                    Số lượng
                  </Label>
                  <Input
                    id={`batch-qty-${line.key}`}
                    inputMode="decimal"
                    value={line.quantity}
                    disabled={disabled}
                    onChange={(event) =>
                      change(row.key, {
                        lines: row.lines.map((entry) =>
                          entry.key === line.key
                            ? { ...entry, quantity: event.target.value }
                            : entry,
                        ),
                      })
                    }
                    className="h-9 w-24 text-right tabular-nums"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label="Bỏ dòng của đợt"
                    disabled={disabled}
                    onClick={() =>
                      change(row.key, {
                        lines: row.lines.filter(
                          (entry) => entry.key !== line.key,
                        ),
                      })
                    }
                  >
                    <X aria-hidden />
                  </Button>
                  <FieldMessage
                    message={
                      errors[`batches.${index}.lines.${lineIndex}`] ??
                      errors[`batches.${index}.lines.${lineIndex}.quantity`]
                    }
                  />
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="ghost"
              className="self-start"
              disabled={disabled}
              onClick={() =>
                change(row.key, {
                  lines: [
                    ...row.lines,
                    { key: nextKey(), ref: "", quantity: "" },
                  ],
                })
              }
            >
              <Plus aria-hidden /> Thêm hàng cho đợt
            </Button>
          </li>
        ))}
      </ol>
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
              plannedDate: "",
              note: "",
              lines: [{ key: nextKey(), ref: "", quantity: "" }],
            },
          ])
        }
      >
        <Plus aria-hidden /> Thêm đợt
      </Button>
    </div>
  );
}

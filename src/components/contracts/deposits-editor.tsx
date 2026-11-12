"use client";

import { Plus, X } from "lucide-react";

import { DateInput } from "@/components/domain/date-input";
import { FieldMessage } from "@/components/purchasing/field-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatBusinessDate,
  isBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { reminderDate } from "@/domain/guarantee";

import { nextKey, type DepositRow } from "./form-model";
import { NumericInput } from "@/components/domain/numeric-input";

interface DepositsEditorProps {
  rows: DepositRow[];
  errors: Readonly<Record<string, string>>;
  onRows: (rows: DepositRow[]) => void;
  disabled?: boolean;
}

const fresh = (kind: DepositRow["kind"]): DepositRow => ({
  key: nextKey(),
  kind,
  amount: "",
  method: "TRANSFER",
  bankName: "",
  guaranteeNumber: "",
  expiryDate: "",
});

/** D5a "Tiền cọc": agreed cash deposits and bank guarantees (0.2 #50). */
export function DepositsEditor({
  rows,
  errors,
  onRows,
  disabled = false,
}: DepositsEditorProps) {
  const change = (key: number, patch: Partial<DepositRow>) =>
    onRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, index) => {
        const name = `deposits.${index}`;
        return (
          <fieldset
            key={row.key}
            className="relative flex flex-wrap items-end gap-3 rounded-md border p-3"
          >
            <legend className="px-1 text-label">
              {row.kind === "CASH" ? "Cọc tiền" : "Bảo lãnh ngân hàng"}
            </legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`amount-${row.key}`}>
                {row.kind === "CASH" ? "Số tiền" : "Giá trị"}
              </Label>
              <NumericInput
                id={`amount-${row.key}`}
                kind="money"
                value={row.amount}
                disabled={disabled}
                onChange={(event) =>
                  change(row.key, { amount: event.target.value })
                }
                className="w-40 text-right tabular-nums"
              />
              <FieldMessage message={errors[`${name}.amount`]} />
            </div>
            {row.kind === "CASH" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`method-${row.key}`}>Hình thức</Label>
                <select
                  id={`method-${row.key}`}
                  value={row.method}
                  disabled={disabled}
                  onChange={(event) =>
                    change(row.key, {
                      method:
                        event.target.value === "CASH" ? "CASH" : "TRANSFER",
                    })
                  }
                  className="h-11 rounded-md border border-input bg-card px-3 text-base"
                >
                  <option value="TRANSFER">Chuyển khoản</option>
                  <option value="CASH">Tiền mặt</option>
                </select>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`bank-${row.key}`}>Ngân hàng</Label>
                  <Input
                    id={`bank-${row.key}`}
                    value={row.bankName}
                    disabled={disabled}
                    onChange={(event) =>
                      change(row.key, { bankName: event.target.value })
                    }
                    className="w-44"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`number-${row.key}`}>Số chứng thư</Label>
                  <Input
                    id={`number-${row.key}`}
                    value={row.guaranteeNumber}
                    disabled={disabled}
                    onChange={(event) =>
                      change(row.key, { guaranteeNumber: event.target.value })
                    }
                    className="w-40"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`expiry-${row.key}`}>Hết hạn</Label>
                  <DateInput
                    id={`expiry-${row.key}`}
                    value={row.expiryDate}
                    disabled={disabled}
                    onValueChange={(value) =>
                      change(row.key, { expiryDate: value })
                    }
                  />
                  {isBusinessDate(row.expiryDate) ? (
                    <span className="text-caption text-muted-foreground">
                      Nhắc trước 30 ngày:{" "}
                      {formatBusinessDate(
                        reminderDate(row.expiryDate as BusinessDate),
                      )}
                    </span>
                  ) : null}
                </div>
                <FieldMessage message={errors[name]} />
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto size-9"
              aria-label={`Bỏ ${row.kind === "CASH" ? "cọc tiền" : "bảo lãnh"}`}
              disabled={disabled}
              onClick={() =>
                onRows(rows.filter((entry) => entry.key !== row.key))
              }
            >
              <X aria-hidden />
            </Button>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onRows([...rows, fresh("CASH")])}
        >
          <Plus aria-hidden /> Thêm cọc tiền
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onRows([...rows, fresh("GUARANTEE")])}
        >
          <Plus aria-hidden /> Thêm bảo lãnh
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Cọc giữ riêng theo hợp đồng, chỉ cấn trừ khi thanh lý công trình; cọc
        thừa trả lại khách.
      </p>
    </div>
  );
}

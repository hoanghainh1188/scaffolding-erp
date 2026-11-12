"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DomainValueError } from "@/domain/errors";
import { formatMoneyForInput, parseMoney, toMoney } from "@/domain/money";
import type { ItemRow } from "@/lib/catalog/items";

import { FormError } from "./form-error";
import { formatPrice } from "./format";
import { NumericInput } from "@/components/domain/numeric-input";
import { useCatalogAction } from "./use-catalog-action";

interface RepairLaborRateProps {
  item: Pick<ItemRow, "id" | "code" | "unitLabel" | "repairLaborRate">;
  /** repairs.manage: the director and the accountant (0.2 số 123). */
  canEdit: boolean;
}

/**
 * D9: piece-rate labour of a repair (0.2 số 117), read by repairs.view,
 * set by repairs.manage. A work order takes it when assigned (số 126).
 */
export function RepairLaborRate({ item, canEdit }: RepairLaborRateProps) {
  const unit = item.unitLabel;
  const shown =
    item.repairLaborRate === null
      ? "Chưa đặt"
      : `${formatPrice(item.repairLaborRate)} / ${unit}`;
  const [value, setValue] = useState(
    item.repairLaborRate === null
      ? ""
      : formatMoneyForInput(toMoney(item.repairLaborRate)),
  );
  const action = useCatalogAction();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let rate: number | null;
    try {
      rate = value.trim() === "" ? null : parseMoney(value.trim());
    } catch (cause: unknown) {
      if (cause instanceof DomainValueError) {
        action.setError(cause.message);
        return;
      }
      throw cause;
    }
    await action.run(`/api/catalog/items/${item.id}/repair-labor-rate`, {
      method: "PUT",
      body: { repairLaborRate: rate },
    });
  }

  if (!canEdit) {
    return (
      <p className="text-body">
        <span className="text-muted-foreground">Công sửa: </span>
        {shown}
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5" noValidate>
      <Label htmlFor="item-labor-rate">
        Đơn giá công sửa / {unit} ({item.code})
      </Label>
      <div className="flex gap-2">
        <NumericInput
          id="item-labor-rate"
          kind="money"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Để trống nếu chưa đặt"
          aria-describedby="item-labor-rate-help"
        />
        <Button type="submit" variant="outline" disabled={action.pending}>
          {action.pending ? "Đang lưu…" : "Lưu"}
        </Button>
      </div>
      <span id="item-labor-rate-help" className="text-sm text-muted-foreground">
        Công sửa hiện tại: {shown}. Lệnh sửa lấy đơn giá lúc giao xưởng.
      </span>
      <FormError message={action.error} />
    </form>
  );
}

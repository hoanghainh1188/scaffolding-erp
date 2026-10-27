"use client";

import { Plus } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { QuantityInput } from "@/components/domain/quantity-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DomainValueError } from "@/domain/errors";
import { parseCatalogCode } from "@/domain/item-code";
import { formatMoneyForInput, parseMoney, toMoney } from "@/domain/money";
import {
  quantityFromDb,
  quantityToDb,
  toQuantity,
  type Quantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { WEIGHT_MESSAGES } from "@/domain/weight-conversion";
import type { ItemRow } from "@/lib/catalog/items";

import { FormError } from "./form-error";
import { formatPrice, monthlyPrice } from "./format";
import { useCatalogAction } from "./use-catalog-action";

interface ItemFormSheetProps {
  groups: { id: string; name: string }[];
  /** Editing this item; absent to add one. */
  item?: ItemRow;
  trigger?: ReactNode;
  /** Opened from a row menu instead of a trigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Empty text is "no price"; anything else must be a whole VND amount. */
function readPrice(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : parseMoney(trimmed);
}

function priceText(value: number | null): string {
  return value === null ? "" : formatMoneyForInput(toMoney(value));
}

/** D9 add / edit item (spec item-catalog; design D13). */
export function ItemFormSheet({
  groups,
  item,
  trigger,
  open: openProp,
  onOpenChange,
}: ItemFormSheetProps) {
  const editing = item !== undefined;
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [unit, setUnit] = useState<QuantityUnit>(item?.unit ?? "PIECE");
  const [code, setCode] = useState(item?.code ?? "");
  const [weight, setWeight] = useState<Quantity>(
    item?.standardWeightKg
      ? quantityFromDb(item.standardWeightKg, "KG")
      : toQuantity(0, "KG"),
  );
  const [daily, setDaily] = useState(priceText(item?.dailyRentalPrice ?? null));
  const action = useCatalogAction();

  let monthly = "–";
  try {
    monthly = formatPrice(monthlyPrice(readPrice(daily)));
  } catch {
    monthly = "–";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let body: Record<string, unknown>;
    try {
      if (unit === "PIECE" && weight.milli <= 0) {
        throw new DomainValueError(WEIGHT_MESSAGES.noWeight);
      }
      body = {
        name: String(form.get("name") ?? ""),
        groupId: String(form.get("groupId") ?? ""),
        standardWeightKg: unit === "PIECE" ? quantityToDb(weight) : null,
        dailyRentalPrice: unit === "PIECE" ? readPrice(daily) : null,
        lostPrice: readPrice(String(form.get("lostPrice") ?? "")),
        damagePrice: readPrice(String(form.get("damagePrice") ?? "")),
        ...(editing ? {} : { code: parseCatalogCode(code), unit }),
      };
    } catch (cause: unknown) {
      if (cause instanceof DomainValueError) {
        action.setError(cause.message);
        return;
      }
      throw cause;
    }
    const saved = await action.run(
      editing ? `/api/catalog/items/${item.id}` : "/api/catalog/items",
      { method: editing ? "PATCH" : "POST", body },
    );
    if (saved) setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {openProp === undefined ? (
        <SheetTrigger asChild>
          {trigger ?? (
            <Button>
              <Plus aria-hidden />
              Thêm vật tư
            </Button>
          )}
        </SheetTrigger>
      ) : null}
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {editing ? `Sửa ${item.code}` : "Thêm vật tư"}
          </SheetTitle>
          <SheetDescription>
            {editing
              ? "Mã hàng và đơn vị không đổi được."
              : "Mã hàng in trên nhãn QR, không đổi được sau khi lưu."}
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 px-4 pb-6"
          noValidate
        >
          {editing ? null : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-code">Mã hàng</Label>
              <Input
                id="item-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="VD: GG-K17"
                autoCapitalize="characters"
                spellCheck={false}
                required
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-name">Tên vật tư</Label>
            <Input
              id="item-name"
              name="name"
              defaultValue={item?.name}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-group">Nhóm</Label>
            <select
              id="item-group"
              name="groupId"
              defaultValue={item?.groupId ?? groups[0]?.id}
              className="h-11 rounded-md border border-input bg-card px-3 text-base"
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          {editing ? null : (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-label">Đơn vị tính</legend>
              <div className="flex gap-4">
                {(
                  [
                    ["PIECE", "Cái (có trọng lượng chuẩn)"],
                    ["KG", "Kg (sắt vụn mua về)"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="unit"
                      value={value}
                      checked={unit === value}
                      onChange={() => setUnit(value)}
                      className="size-4 accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {unit === "PIECE" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-weight">Trọng lượng chuẩn (kg/cái)</Label>
                <QuantityInput
                  id="item-weight"
                  value={weight}
                  onValueChange={setWeight}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-daily">Giá thuê / ngày (₫)</Label>
                <Input
                  id="item-daily"
                  inputMode="numeric"
                  value={daily}
                  onChange={(event) => setDaily(event.target.value)}
                  placeholder="Để trống nếu không cho thuê"
                  aria-describedby="item-monthly"
                />
                <span
                  id="item-monthly"
                  className="text-sm text-muted-foreground"
                >
                  Giá thuê / tháng: {monthly} (= giá ngày × 30)
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Hàng tính theo kg không cho thuê và không có trọng lượng chuẩn.
            </p>
          )}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-label">
              Giá đền bù mặc định (gợi ý cho hợp đồng)
            </legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-lost">
                Mất (₫/{unit === "KG" ? "kg" : "cái"})
              </Label>
              <Input
                id="item-lost"
                name="lostPrice"
                inputMode="numeric"
                defaultValue={priceText(item?.lostPrice ?? null)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-damage">
                Hỏng, sửa được (₫/{unit === "KG" ? "kg" : "cái"})
              </Label>
              <Input
                id="item-damage"
                name="damagePrice"
                inputMode="numeric"
                defaultValue={priceText(item?.damagePrice ?? null)}
              />
            </div>
          </fieldset>
          <FormError message={action.error} />
          <Button
            type="submit"
            size="lg"
            className="h-12"
            disabled={action.pending}
          >
            {action.pending
              ? "Đang lưu…"
              : editing
                ? "Lưu thay đổi"
                : "Thêm vật tư"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

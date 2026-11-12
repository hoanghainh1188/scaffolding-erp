"use client";

import { Plus, X } from "lucide-react";
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
import { normalizeItemCode, parseItemCode } from "@/domain/item-code";
import { formatMoneyForInput, parseMoney, toMoney } from "@/domain/money";
import {
  COUNT_UNITS,
  MEASURE_UNITS,
  QUANTITY_UNIT_LABELS,
  hasStandardWeight,
  quantityFromDb,
  quantityToDb,
  toQuantity,
  type Quantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { WEIGHT_MESSAGES } from "@/domain/weight-conversion";
import { MAX_OLD_CODES, type ItemRow } from "@/lib/catalog/items";
import { dict } from "@/locales";

import { FormError } from "./form-error";
import { formatPrice, monthlyPrice } from "./format";
import { NumericInput } from "@/components/domain/numeric-input";
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

const text = dict.catalog;

interface OldCodesFieldProps {
  codes: string[];
  onChange: (codes: string[]) => void;
}

/** Old codes as removable tags, at most MAX_OLD_CODES (design D8). */
function OldCodesField({ codes, onChange }: OldCodesFieldProps) {
  const [draft, setDraft] = useState("");
  const full = codes.length >= MAX_OLD_CODES;

  function add() {
    const code = normalizeItemCode(draft);
    if (code === "" || codes.includes(code) || full) return;
    onChange([...codes, code]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="item-old-code">{text.oldCodes.label}</Label>
      {codes.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={text.oldCodes.label}>
          {codes.map((code) => (
            <li
              key={code}
              className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-sm"
            >
              {code}
              <button
                type="button"
                onClick={() =>
                  onChange(codes.filter((other) => other !== code))
                }
                aria-label={text.oldCodes.remove(code)}
                className="inline-flex size-7 items-center justify-center rounded-full hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id="item-old-code"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={full ? text.oldCodes.full : text.oldCodes.placeholder}
          disabled={full}
          autoCapitalize="characters"
          spellCheck={false}
          aria-describedby="item-old-code-help"
        />
        <Button type="button" variant="outline" onClick={add} disabled={full}>
          {text.oldCodes.add}
        </Button>
      </div>
      <span id="item-old-code-help" className="text-sm text-muted-foreground">
        {text.oldCodes.help}
      </span>
    </div>
  );
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
  const [aliases, setAliases] = useState<string[]>(item?.aliases ?? []);
  const unitLabel = QUANTITY_UNIT_LABELS[unit];
  const weighted = hasStandardWeight(unit);
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
      if (weighted && weight.milli <= 0) {
        throw new DomainValueError(WEIGHT_MESSAGES.noWeight);
      }
      body = {
        name: String(form.get("name") ?? ""),
        groupId: String(form.get("groupId") ?? ""),
        aliases: aliases.map((alias) => parseItemCode(alias)),
        standardWeightKg: weighted ? quantityToDb(weight) : null,
        dailyRentalPrice: readPrice(daily),
        lostPrice: readPrice(String(form.get("lostPrice") ?? "")),
        damagePrice: readPrice(String(form.get("damagePrice") ?? "")),
        ...(editing ? {} : { code: parseItemCode(code), unit }),
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
                onChange={(event) =>
                  setCode(event.target.value.toLocaleUpperCase("vi"))
                }
                placeholder="VD: GG-K17, H1,7, NỐI 34"
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
          <OldCodesField codes={aliases} onChange={setAliases} />
          {editing ? null : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-unit">{text.units.legend}</Label>
              <select
                id="item-unit"
                value={unit}
                onChange={(event) =>
                  setUnit(event.target.value as QuantityUnit)
                }
                className="h-11 rounded-md border border-input bg-card px-3 text-base"
              >
                <optgroup label={text.units.countGroup}>
                  {COUNT_UNITS.map((value) => (
                    <option key={value} value={value}>
                      {QUANTITY_UNIT_LABELS[value]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={text.units.measureGroup}>
                  {MEASURE_UNITS.map((value) => (
                    <option key={value} value={value}>
                      {QUANTITY_UNIT_LABELS[value]}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}
          {weighted ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-weight">
                {text.units.weightLabel(unitLabel)}
              </Label>
              <QuantityInput
                id="item-weight"
                value={weight}
                onValueChange={setWeight}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{text.units.kgNote}</p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-daily">
              {text.units.dailyPrice(unitLabel)}
            </Label>
            <NumericInput
              id="item-daily"
              kind="money"
              value={daily}
              onChange={(event) => setDaily(event.target.value)}
              placeholder="Để trống nếu không cho thuê"
              aria-describedby="item-monthly"
            />
            <span id="item-monthly" className="text-sm text-muted-foreground">
              Giá thuê / tháng: {monthly} (= giá ngày × 30)
            </span>
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-label">
              Giá đền bù mặc định (gợi ý cho hợp đồng)
            </legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-lost">
                {text.units.lostPrice(unitLabel)}
              </Label>
              <NumericInput
                id="item-lost"
                name="lostPrice"
                kind="money"
                defaultValue={priceText(item?.lostPrice ?? null)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-damage">
                {text.units.damagePrice(unitLabel)}
              </Label>
              <NumericInput
                id="item-damage"
                name="damagePrice"
                kind="money"
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

"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, toMoney } from "@/domain/money";
import {
  formatQuantity,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { cn } from "@/lib/utils";

import { FieldMessage } from "@/components/purchasing/field-message";

import {
  nextKey,
  readMoney,
  type ItemOption,
  type KitOption,
  type KitRow,
  type RentRow,
} from "./form-model";

/** What the row was before an amendment (D5b "Hiện tại"). */
export interface Baseline {
  quantityMilli: number;
  price: number | null;
}

interface RentalLinesProps {
  kits: KitRow[];
  rows: RentRow[];
  items: readonly ItemOption[];
  kitOptions: readonly KitOption[];
  totals: ReadonlyMap<number, number>;
  dayRent: number;
  months: readonly { days: number; amount: number }[];
  errors: Readonly<Record<string, string>>;
  onKits: (kits: KitRow[]) => void;
  onRows: (rows: RentRow[]) => void;
  /** D5b: the values in force, shown next to the new ones. */
  baseline?: ReadonlyMap<string, Baseline>;
  /** D5b: rows already on the contract cannot be removed. */
  fixedItems?: ReadonlySet<string>;
  disabled?: boolean;
}

const money = (value: number | null) =>
  value === null ? "–" : formatMoney(toMoney(value));

const quantity = (milli: number, unit: string) =>
  `${formatQuantity(toQuantity(milli, unit as QuantityUnit))} ${QUANTITY_UNIT_LABELS[unit as QuantityUnit] ?? ""}`;

/** D5a "Hàng cho thuê": kits split into parts, one price per item. */
export function RentalLines({
  kits,
  rows,
  items,
  kitOptions,
  totals,
  dayRent,
  months,
  errors,
  onKits,
  onRows,
  baseline,
  fixedItems,
  disabled = false,
}: RentalLinesProps) {
  const [pickKit, setPickKit] = useState("");
  const [pickItem, setPickItem] = useState("");
  const itemOf = new Map(items.map((entry) => [entry.id, entry]));
  const kitOf = new Map(kitOptions.map((entry) => [entry.id, entry]));
  const kitItems = new Set(
    kits.flatMap((row) =>
      (kitOf.get(row.kitId)?.components ?? []).map((part) => part.itemId),
    ),
  );

  const change = (key: number, patch: Partial<RentRow>) =>
    onRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  function addKit() {
    if (!pickKit || kits.some((row) => row.kitId === pickKit)) return;
    onKits([...kits, { key: nextKey(), kitId: pickKit, quantity: "1" }]);
    setPickKit("");
  }

  function addItem() {
    if (!pickItem || rows.some((row) => row.itemId === pickItem)) return;
    const found = itemOf.get(pickItem);
    onRows([
      ...rows,
      {
        key: nextKey(),
        itemId: pickItem,
        own: "",
        price:
          found?.dailyRentalPrice === null ||
          found?.dailyRentalPrice === undefined
            ? ""
            : String(found.dailyRentalPrice),
      },
    ]);
    setPickItem("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="add-kit">Thêm bộ</Label>
          <div className="flex gap-2">
            <select
              id="add-kit"
              value={pickKit}
              disabled={disabled}
              onChange={(event) => setPickKit(event.target.value)}
              className="h-11 min-w-48 rounded-md border border-input bg-card px-3 text-base"
            >
              <option value="">Chọn bộ</option>
              {kitOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} · {entry.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={addKit}
              disabled={disabled || !pickKit}
            >
              <Plus aria-hidden /> Thêm bộ
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="add-item">Thêm mã hàng</Label>
          <div className="flex gap-2">
            <select
              id="add-item"
              value={pickItem}
              disabled={disabled}
              onChange={(event) => setPickItem(event.target.value)}
              className="h-11 min-w-56 rounded-md border border-input bg-card px-3 text-base"
            >
              <option value="">Chọn mã hàng</option>
              {items.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} · {entry.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={addItem}
              disabled={disabled || !pickItem}
            >
              <Plus aria-hidden /> Thêm mã hàng
            </Button>
          </div>
        </div>
      </div>

      {kits.length > 0 ? (
        <ul aria-label="Bộ đã thêm" className="flex flex-col gap-2">
          {kits.map((row) => {
            const found = kitOf.get(row.kitId);
            return (
              <li
                key={row.key}
                className="flex flex-wrap items-center gap-3 rounded-md border bg-muted px-3 py-2"
              >
                <span className="font-semibold">
                  {found?.name ?? row.kitId}
                </span>
                <Label htmlFor={`kit-${row.key}`} className="sr-only">
                  Số bộ {found?.name}
                </Label>
                <span className="flex items-center gap-1">
                  ×
                  <Input
                    id={`kit-${row.key}`}
                    inputMode="numeric"
                    value={row.quantity}
                    disabled={disabled}
                    onChange={(event) =>
                      onKits(
                        kits.map((entry) =>
                          entry.key === row.key
                            ? { ...entry, quantity: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className="h-9 w-24 text-right tabular-nums"
                  />
                  bộ
                </span>
                <span className="text-sm text-muted-foreground">
                  · giá đặt theo linh kiện, bộ tự tách khi xuất
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-9"
                  aria-label={`Bỏ ${found?.name ?? "bộ"}`}
                  disabled={disabled}
                  onClick={() =>
                    onKits(kits.filter((entry) => entry.key !== row.key))
                  }
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
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
                Thêm lẻ
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
                Giá thuê / ngày
              </th>
              <th
                scope="col"
                className="border-b px-3 py-2.5 text-right font-semibold"
              >
                Tiền 1 ngày
              </th>
              <th scope="col" className="border-b px-3 py-2.5">
                <span className="sr-only">Bỏ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Chưa có hàng. Bạn thêm bộ hoặc mã hàng.
                </td>
              </tr>
            ) : null}
            {rows.map((row, index) => {
              const found = itemOf.get(row.itemId);
              const unit = found?.unit ?? "PIECE";
              const total = totals.get(row.key) ?? 0;
              const price = readMoney(row.price);
              const before = baseline?.get(row.itemId);
              const catalog = found?.dailyRentalPrice ?? null;
              const changedPrice =
                before !== undefined &&
                price !== null &&
                !Number.isNaN(price) &&
                price !== before.price;
              const changedQuantity =
                before !== undefined && total !== before.quantityMilli;
              const isNew = baseline !== undefined && before === undefined;
              const fixed = fixedItems?.has(row.itemId) ?? false;
              return (
                <tr key={row.key} className="bg-card">
                  <th
                    scope="row"
                    className="border-b px-3 py-2 text-left font-normal"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">
                        {found?.name ?? row.itemId}
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {found?.code}
                        {kitItems.has(row.itemId) ? " · có trong bộ" : ""}
                        {isNew ? " · thêm" : ""}
                      </span>
                    </span>
                  </th>
                  <td className="border-b px-3 py-2 text-right">
                    <Label htmlFor={`own-${row.key}`} className="sr-only">
                      Thêm lẻ {found?.code}
                    </Label>
                    <Input
                      id={`own-${row.key}`}
                      inputMode="decimal"
                      value={row.own}
                      disabled={disabled}
                      onChange={(event) =>
                        change(row.key, { own: event.target.value })
                      }
                      aria-invalid={Boolean(errors[`lines.${index}.quantity`])}
                      className="ml-auto h-9 w-24 text-right tabular-nums"
                    />
                    <FieldMessage message={errors[`lines.${index}.quantity`]} />
                  </td>
                  <td
                    className={cn(
                      "border-b px-3 py-2 text-right whitespace-nowrap tabular-nums",
                      changedQuantity && "font-semibold text-warning",
                    )}
                  >
                    {before !== undefined && changedQuantity ? (
                      <span className="mr-1 text-muted-foreground line-through">
                        {quantity(before.quantityMilli, unit)}
                      </span>
                    ) : null}
                    {quantity(total, unit)}
                  </td>
                  <td className="border-b px-3 py-2 text-right">
                    <Label htmlFor={`price-${row.key}`} className="sr-only">
                      Giá thuê / ngày {found?.code}
                    </Label>
                    <Input
                      id={`price-${row.key}`}
                      inputMode="numeric"
                      value={row.price}
                      disabled={disabled}
                      onChange={(event) =>
                        change(row.key, { price: event.target.value })
                      }
                      aria-invalid={Boolean(errors[`lines.${index}.price`])}
                      className={cn(
                        "ml-auto h-9 w-28 text-right tabular-nums",
                        changedPrice && "border-2 border-warning",
                      )}
                    />
                    {before !== undefined ? (
                      <span className="block text-caption text-muted-foreground">
                        Hiện tại: {money(before.price)}
                      </span>
                    ) : catalog !== null && price !== catalog ? (
                      <span className="block text-caption text-warning">
                        Danh mục: {money(catalog)}
                      </span>
                    ) : null}
                    <FieldMessage message={errors[`lines.${index}.price`]} />
                  </td>
                  <td className="border-b px-3 py-2 text-right font-medium whitespace-nowrap tabular-nums">
                    {price === null || Number.isNaN(price)
                      ? "–"
                      : money(Math.round((price * total) / 1000))}
                  </td>
                  <td className="border-b px-3 py-2 text-right">
                    {kitItems.has(row.itemId) || fixed ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9"
                        aria-label={`Bỏ ${found?.code ?? "dòng"}`}
                        disabled={disabled}
                        onClick={() =>
                          onRows(rows.filter((entry) => entry.key !== row.key))
                        }
                      >
                        <X aria-hidden />
                      </Button>
                    )}
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
                Tiền thuê 1 ngày
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ·{" "}
                  {months
                    .map(
                      (month) =>
                        `tháng ${month.days} ngày ≈ ${money(month.amount)}`,
                    )
                    .join(", ")}
                </span>
              </th>
              <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums">
                {money(dayRent)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        Giá lấy sẵn từ danh mục, sửa riêng cho hợp đồng này. Tiền thuê tính theo
        số ngày thực tế hàng ở công trình (không tính ngày xuất, tính ngày trả),
        theo số hàng thực giao, không theo số ghi ở đây.
      </p>
    </div>
  );
}

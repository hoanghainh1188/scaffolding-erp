"use client";

// D12 right column: needs-repair stock at the place a slip takes from;
// pressing an item adds its line (once).
import { formatMoney } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  toQuantity,
} from "@/domain/quantity";
import type { AwaitingItem } from "@/lib/repairs/queries";
import { cn } from "@/lib/utils";

interface AwaitingListProps {
  placeName: string;
  items: AwaitingItem[];
  added: ReadonlySet<string>;
  disabled?: boolean;
  onAdd: (itemId: string) => void;
}

export function AwaitingList({
  placeName,
  items,
  added,
  disabled = false,
  onAdd,
}: AwaitingListProps) {
  const waiting = items.filter((item) => item.onHandMilli > 0);
  return (
    <section
      aria-labelledby="awaiting-title"
      className="flex flex-col gap-3 rounded-lg border bg-card p-5"
    >
      <h2 id="awaiting-title" className="text-h3 font-display">
        Đang chờ sửa tại {placeName}
      </h2>
      {waiting.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Không có hàng Chờ sửa ở đây.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {waiting.map((item) => {
            const taken = added.has(item.itemId);
            return (
              <li key={item.itemId}>
                <button
                  type="button"
                  disabled={disabled || taken}
                  onClick={() => onAdd(item.itemId)}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 rounded-md px-2 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    taken
                      ? "opacity-50"
                      : "hover:bg-muted disabled:hover:bg-transparent",
                  )}
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">
                      <span className="sr-only">Thêm </span>
                      {item.itemName}
                      <span className="sr-only"> ({item.itemCode})</span>
                    </span>
                    <span className="text-caption text-muted-foreground">
                      giá vốn{" "}
                      {item.needsRepairAvg === null
                        ? "–"
                        : formatMoney(item.needsRepairAvg)}
                    </span>
                  </span>
                  <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
                    {formatQuantity(toQuantity(item.onHandMilli, item.unit))}{" "}
                    {QUANTITY_UNIT_LABELS[item.unit]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

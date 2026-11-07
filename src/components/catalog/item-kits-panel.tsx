import type { ReactNode } from "react";

import type { ItemRow } from "@/lib/catalog/items";
import type { KitRow } from "@/lib/catalog/kits";

import { formatPrice, formatWeightMilli } from "./format";

interface ItemKitsPanelProps {
  item: ItemRow | null;
  kits: KitRow[];
  /** "Sửa bộ" buttons, only for people who may edit kits. */
  editKit?: (kit: KitRow) => ReactNode;
  /** The repair labour rate block (repairs.view), above the kits. */
  laborRate?: ReactNode;
}

/** D9 right panel: the kits the selected item belongs to (spec item-catalog). */
export function ItemKitsPanel({
  item,
  kits,
  editKit,
  laborRate,
}: ItemKitsPanelProps) {
  return (
    <section
      aria-labelledby="item-kits"
      className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 min-[1700px]:w-[360px] min-[1700px]:shrink-0"
    >
      {laborRate}
      <h2 id="item-kits" className="text-h2">
        Thuộc bộ
      </h2>
      {item === null ? (
        <p className="text-body text-muted-foreground">
          Chọn một vật tư trong bảng để xem nó nằm trong bộ nào.
        </p>
      ) : kits.length === 0 ? (
        <p className="text-body text-muted-foreground">
          {item.name} chưa nằm trong bộ nào.
        </p>
      ) : (
        kits.map((kit) => (
          <article
            key={kit.id}
            className="flex flex-col gap-3 rounded-lg border p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-label">{kit.name}</h3>
              {editKit?.(kit)}
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {kit.components.map((part) => (
                <li key={part.itemId}>
                  <span className="font-semibold">×{part.quantity}</span>{" "}
                  {part.name}
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Trọng lượng 1 bộ</dt>
              <dd className="text-right">
                {formatWeightMilli(kit.weightMilli)}
              </dd>
              <dt className="text-muted-foreground">Giá thuê 1 bộ / ngày</dt>
              <dd className="text-right">
                {kit.rentalPerDay === null
                  ? "Không cho thuê"
                  : formatPrice(kit.rentalPerDay)}
              </dd>
            </dl>
          </article>
        ))
      )}
      <p className="text-caption text-muted-foreground">
        Bộ chỉ để báo giá cho nhanh. Khi xuất kho, bộ tự tách thành linh kiện;
        tồn kho và tiền thuê luôn tính theo linh kiện.
      </p>
    </section>
  );
}

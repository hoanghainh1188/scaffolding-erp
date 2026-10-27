import { Button } from "@/components/ui/button";
import type { ItemRow } from "@/lib/catalog/items";
import type { KitRow } from "@/lib/catalog/kits";

import { formatPrice, formatWeightMilli } from "./format";
import { KitEditorDialog } from "./kit-editor-dialog";

/** Kits as cards: parts, weight and rent of one kit. */
export function KitsList({
  kits,
  parts,
  canEdit,
}: {
  kits: KitRow[];
  parts: ItemRow[];
  canEdit: boolean;
}) {
  if (kits.length === 0) {
    return (
      <p className="text-body text-muted-foreground">Chưa có bộ nào khớp.</p>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {kits.map((kit) => (
        <li key={kit.id} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-label">{kit.name}</span>
              <span className="text-caption text-muted-foreground">
                {kit.code}
              </span>
            </div>
            {canEdit ? (
              <KitEditorDialog
                parts={parts}
                kit={kit}
                trigger={<Button variant="link">Sửa bộ</Button>}
              />
            ) : null}
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {kit.components.map((part) => (
              <li key={part.itemId}>
                <span className="font-semibold">×{part.quantity}</span>{" "}
                {part.name}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            {formatWeightMilli(kit.weightMilli)} ·{" "}
            {kit.rentalPerDay === null
              ? "Không cho thuê"
              : `${formatPrice(kit.rentalPerDay)} / ngày`}
          </p>
        </li>
      ))}
    </ul>
  );
}

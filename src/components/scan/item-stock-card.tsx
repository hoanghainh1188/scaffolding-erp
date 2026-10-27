// The item a scan found, with its stock (spec item-scan "Màn quét mã M2").
import Link from "next/link";

import { stockCardHref } from "@/components/inventory/links";
import { Button } from "@/components/ui/button";
import { formatQuantity, quantityFromDb, toQuantity } from "@/domain/quantity";
import type { StockLookup } from "@/lib/receiving/queries";

interface ItemStockCardProps {
  item: StockLookup;
  /** "09:41" */
  scannedAt: string;
  canViewCard: boolean;
}

const unitLabel = (unit: StockLookup["unit"]) =>
  unit === "PIECE" ? "cái" : "kg";

export function ItemStockCard({
  item,
  scannedAt,
  canViewCard,
}: ItemStockCardProps) {
  const number = (milli: number) =>
    formatQuantity(toQuantity(milli, item.unit));
  const weight = item.standardWeightKg
    ? ` · ${formatQuantity(quantityFromDb(item.standardWeightKg, "KG"))} kg/cái`
    : "";
  const figures: [string, number][] = [
    ...(item.yard.NEW > 0 ? [["Mới", item.yard.NEW] as [string, number]] : []),
    ["Tốt", item.yard.GOOD],
    ["Chờ sửa", item.yard.NEEDS_REPAIR],
    ["Ở công trình", item.sites],
  ];
  return (
    <section
      aria-label={item.name}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <p className="text-caption text-muted-foreground">
        Đã nhận mã lúc {scannedAt}
      </p>
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{item.name}</h2>
        <p className="text-body text-muted-foreground">
          {item.code} · {unitLabel(item.unit)}
          {weight}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2 has-[>div:nth-child(4)]:grid-cols-2">
        {figures.map(([label, milli]) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-md bg-muted p-3"
          >
            <dt className="text-caption text-muted-foreground">{label}</dt>
            <dd className="font-display text-h2 tabular-nums">
              {number(milli)}
            </dd>
          </div>
        ))}
      </dl>
      {canViewCard && (
        <Button asChild variant="secondary" className="h-12">
          <Link href={stockCardHref(item.code)}>Xem thẻ kho</Link>
        </Button>
      )}
    </section>
  );
}

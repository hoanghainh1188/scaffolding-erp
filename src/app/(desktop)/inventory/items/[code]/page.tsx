import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { normalizeItemCode } from "@/domain/item-code";
import { StockCardFilters } from "@/components/inventory/stock-card-filters";
import { StockCardSummary } from "@/components/inventory/stock-card-summary";
import { StockCardTable } from "@/components/inventory/stock-card-table";
import { getDatabase } from "@/db/client";
import { QUANTITY_UNIT_LABELS } from "@/domain/quantity";
import { requirePermission } from "@/lib/auth/guard";
import { listSites } from "@/lib/catalog/places";
import { getStockCard } from "@/lib/inventory/card";
import { cardFilterFrom } from "@/lib/inventory/respond";

export const metadata: Metadata = { title: "Thẻ kho" };

type Params = Promise<{ code: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/** D11 Thẻ kho (spec stock-views): one item's ledger for a period. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  await requirePermission("inventory.view");
  const { code } = await params;
  const search = await searchParams;
  // The default period is this month: read the clock at request time.
  await connection();
  const filter = cardFilterFrom(search);
  const db = getDatabase();
  const [card, sites] = await Promise.all([
    getStockCard(db, normalizeItemCode(decodeURIComponent(code)), filter),
    listSites(db),
  ]);
  if (!card) notFound();

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/inventory" className="hover:underline">
          Tồn kho
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Thẻ kho</span>
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Thẻ kho · {card.item.name}</h1>
        <p className="text-sm text-muted-foreground">
          {card.item.code} · đơn vị {QUANTITY_UNIT_LABELS[card.item.unit]}
          {card.site ? ` · ${card.site.code} ${card.site.name}` : ""}
        </p>
      </div>
      <StockCardFilters
        condition={filter.condition ?? "all"}
        place={filter.place}
        site={filter.siteCode ?? null}
        from={filter.from}
        to={filter.to}
        sites={sites.map((site) => ({ code: site.code, name: site.name }))}
      />
      <StockCardSummary card={card} condition={filter.condition} />
      <section
        aria-labelledby="ledger"
        className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5"
      >
        <h2 id="ledger" className="font-display text-h2">
          Sổ kho trong kỳ
        </h2>
        <StockCardTable
          card={card}
          from={filter.from}
          priced={filter.condition !== null}
        />
        <p className="text-sm text-muted-foreground">
          Sổ kho chỉ ghi thêm, không sửa dòng cũ. Phiếu ghi sai thì làm phiếu
          điều chỉnh.
        </p>
      </section>
    </div>
  );
}

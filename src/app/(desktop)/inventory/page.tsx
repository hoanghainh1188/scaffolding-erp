import { FileClock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { StockCards } from "@/components/inventory/stock-cards";
import { StockFilters } from "@/components/inventory/stock-filters";
import { StockTable } from "@/components/inventory/stock-table";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { formatDateTime } from "@/domain/business-date";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { listGroups } from "@/lib/catalog/item-groups";
import { getSiteBreakdown, getStockOverview } from "@/lib/inventory/stock";

export const metadata: Metadata = { title: "Tồn kho" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/** D10 Tồn kho tổng hợp (spec stock-views), straight from the ledger. */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("inventory.view");
  const canAdjust = can(user.role, "inventory.adjust");
  const params = await searchParams;
  const db = getDatabase();
  const [{ rows, cards }, sites, groups] = await Promise.all([
    getStockOverview(db, { q: one(params.q), groupId: one(params.group) }),
    getSiteBreakdown(db),
    listGroups(db),
  ]);
  // Request time, not prerender time (Cache Components: synchronous IO).
  await connection();
  const updatedAt = formatDateTime(new Date());
  const hasStock = rows.some((row) => row.total !== 0) || cards.totalValue > 0;

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Tồn kho</h1>
          <p className="text-sm text-muted-foreground">
            Tính từ sổ kho · cập nhật {updatedAt}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/inventory/adjustments">
              <FileClock aria-hidden />
              Phiếu điều chỉnh
            </Link>
          </Button>
          {canAdjust ? (
            <Button asChild>
              <Link href="/inventory/adjustments?new=ADJUSTMENT">
                Lập phiếu điều chỉnh
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <StockCards cards={cards} />
      <section
        aria-labelledby="stock-table"
        className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5"
      >
        <h2 id="stock-table" className="sr-only">
          Bảng tồn kho
        </h2>
        <StockFilters
          groups={groups.filter((group) => group.status === "ACTIVE")}
        />
        {!hasStock ? (
          <p className="rounded-md bg-muted px-4 py-3 text-sm">
            Chưa có số tồn. Lập phiếu tồn đầu kỳ để bắt đầu.{" "}
            {canAdjust ? (
              <Link
                href="/inventory/adjustments?new=OPENING"
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                Lập phiếu tồn đầu kỳ
              </Link>
            ) : null}
          </p>
        ) : null}
        <StockTable
          rows={rows}
          sites={sites}
          showValue={one(params.value) !== "hide"}
        />
        <p className="text-sm text-muted-foreground">
          Bấm vào con số để mở thẻ kho của mã hàng và tình trạng đó.
        </p>
      </section>
    </div>
  );
}

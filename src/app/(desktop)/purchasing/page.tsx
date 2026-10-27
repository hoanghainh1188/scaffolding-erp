import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { OrderFilters } from "@/components/purchasing/order-filters";
import { OrderTable } from "@/components/purchasing/order-table";
import { OrderTabs, orderListHref } from "@/components/purchasing/order-tabs";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { listOrders, PAGE_SIZE, type OrderTab } from "@/lib/purchasing/queries";
import { orderFilterFrom } from "@/lib/purchasing/respond";

export const metadata: Metadata = { title: "Đơn thu mua" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** D2: purchase orders (spec purchase-orders "Danh sách đơn thu mua D2"). */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("purchasing.view");
  const canManage = can(user.role, "purchasing.manage");
  const params = await searchParams;
  const filter = orderFilterFrom(params);
  await connection();
  const list = await listOrders(
    getDatabase(),
    filter,
    toBusinessDate(new Date()),
  );

  const href = (changes: Record<string, string | null>) =>
    orderListHref(params, changes);
  const tabHref = (tab: OrderTab) => href({ tab: tab === "all" ? null : tab });
  const first = (list.page - 1) * PAGE_SIZE + 1;
  const last = first + list.rows.length - 1;

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Đơn thu mua</h1>
          {list.arrivingToday > 0 ? (
            <p data-mask className="text-sm text-muted-foreground">
              Hôm nay có{" "}
              <strong className="text-foreground">
                {list.arrivingToday} xe
              </strong>{" "}
              sắp về bãi
            </p>
          ) : null}
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/purchasing/orders/new">
              <Plus aria-hidden /> Tạo đơn thu mua
            </Link>
          </Button>
        ) : null}
      </div>
      <section
        aria-labelledby="orders-title"
        className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5"
      >
        <h2 id="orders-title" className="sr-only">
          Danh sách đơn thu mua
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <OrderTabs
            active={filter.tab ?? "all"}
            counts={list.counts}
            hrefOf={tabHref}
          />
          <div className="min-w-0 flex-1 basis-80">
            <OrderFilters />
          </div>
        </div>
        {list.rows.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            {list.counts.all === 0 && !filter.q && !filter.kind
              ? "Chưa có đơn thu mua"
              : "Không có đơn nào khớp bộ lọc"}
          </p>
        ) : (
          <OrderTable rows={list.rows} />
        )}
        {list.total > 0 ? (
          <nav
            aria-label="Phân trang"
            className="flex items-center justify-end gap-3 text-sm text-muted-foreground"
          >
            <span className="tabular-nums">
              {first}–{last} / {list.total}
            </span>
            {list.page > 1 ? (
              <Link
                href={href({ page: String(list.page - 1) })}
                className="inline-flex h-9 items-center rounded-md border px-3 hover:bg-accent"
              >
                Trang trước
              </Link>
            ) : null}
            {list.page < list.pageCount ? (
              <Link
                href={href({ page: String(list.page + 1) })}
                className="inline-flex h-9 items-center rounded-md border px-3 hover:bg-accent"
              >
                Trang sau
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}

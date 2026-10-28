import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { TabLinks } from "@/components/catalog/tab-links";
import { signedMoney } from "@/components/stocktake/format";
import { StocktakeStatusBadge } from "@/components/stocktake/stocktake-status-badge";
import { getDatabase } from "@/db/client";
import { formatBusinessDate, toBusinessDate } from "@/domain/business-date";
import type { StocktakeStatus } from "@/domain/stocktake";
import { requirePermission } from "@/lib/auth/guard";
import { listStocktakes } from "@/lib/stocktakes/queries";
import { stocktakeStatusFrom } from "@/lib/stocktakes/respond";

export const metadata: Metadata = { title: "Kiểm kê" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const TABS: [StocktakeStatus | undefined, string][] = [
  [undefined, "Tất cả"],
  ["SUBMITTED", "Chờ duyệt"],
  ["COUNTING", "Đang đếm"],
  ["DONE", "Đã ghi sổ"],
  ["CANCELLED", "Đã hủy"],
];

/** D13 "Các phiên kiểm kê" (spec stocktakes "Danh sách phiên kiểm kê"). */
export default async function Page({ searchParams }: { searchParams: Search }) {
  await requirePermission("inventory.view");
  const params = await searchParams;
  const status = stocktakeStatusFrom(
    typeof params.status === "string" ? params.status : null,
  );
  await connection();
  const rows = await listStocktakes(getDatabase(), { status });

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/inventory" className="hover:underline">
          Tồn kho
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Kiểm kê</span>
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Các phiên kiểm kê</h1>
        <p className="text-sm text-muted-foreground">
          Chỉ kiểm bãi và xưởng. Hàng ở công trình đối chiếu khi thu hồi.
        </p>
      </div>
      <TabLinks
        label="Trạng thái phiên"
        tabs={TABS.map(([value, label]) => ({
          label,
          href: value
            ? `/inventory/stocktakes?status=${value.toLowerCase()}`
            : "/inventory/stocktakes",
          active: status === value,
        }))}
      />
      <section
        aria-label="Danh sách phiên kiểm kê"
        className="min-w-0 rounded-lg border bg-card p-5"
      >
        {rows.length === 0 ? (
          <p className="text-muted-foreground">
            Chưa có phiên nào. Thủ kho bắt đầu kiểm kê trên điện thoại.
          </p>
        ) : (
          <div className="relative overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  {[
                    "Mã phiên",
                    "Vị trí",
                    "Ngày",
                    "Người đếm",
                    "Dòng đã đếm",
                    "Dòng lệch",
                    "Giá trị lệch",
                    "Trạng thái",
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="border-b px-3 py-2.5 font-semibold"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.code} className="bg-card hover:bg-muted">
                    <th scope="row" className="border-b px-3 py-2.5 text-left">
                      <Link
                        href={`/inventory/stocktakes/${row.code}`}
                        className="font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        {row.code}
                      </Link>
                    </th>
                    <td className="border-b px-3 py-2.5">
                      {row.locationCode} · {row.locationName}
                    </td>
                    <td data-mask className="border-b px-3 py-2.5 tabular-nums">
                      {formatBusinessDate(toBusinessDate(row.startedAt))}
                    </td>
                    <td className="border-b px-3 py-2.5">
                      {row.startedByName}
                    </td>
                    <td className="border-b px-3 py-2.5 text-right tabular-nums">
                      {row.counted} / {row.total}
                    </td>
                    <td className="border-b px-3 py-2.5 text-right tabular-nums">
                      {row.diffLines ?? "–"}
                    </td>
                    <td className="border-b px-3 py-2.5 text-right tabular-nums">
                      {row.diffValue === null
                        ? "–"
                        : signedMoney(row.diffValue)}
                    </td>
                    <td className="border-b px-3 py-2.5">
                      <StocktakeStatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

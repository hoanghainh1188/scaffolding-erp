import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, redirect } from "next/navigation";
import { connection } from "next/server";

import { CompensationStatusBadge } from "@/components/compensations/compensation-badge";
import { moneyText } from "@/components/deliveries/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDatabase } from "@/db/client";
import { formatBusinessDate } from "@/domain/business-date";
import {
  COMPENSATION_STATUS_LABELS,
  COMPENSATION_STATUSES,
} from "@/domain/compensation";
import { requirePermission } from "@/lib/auth/guard";
import {
  compensationList,
  parseCompensationStatus,
} from "@/lib/compensations/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Phiếu đền bù" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const FILTERS = [...COMPENSATION_STATUSES, "ALL"] as const;

/** Compensation notes, Chờ duyệt first (compensations spec). */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("sales.view");
  const { status: raw } = await searchParams;
  // The filter lives on the URL (spec "Danh sách phiếu đền bù").
  if (raw === undefined) redirect("/sales/compensations?status=PENDING");
  const status = parseCompensationStatus(Array.isArray(raw) ? raw[0] : raw);
  await connection();
  const list = await compensationList(getDatabase(), user, status);
  if (!list.ok) forbidden();
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Phiếu đền bù</h1>
        <p className="text-sm text-muted-foreground">
          Tự tạo khi thu hồi có hàng hỏng, phế liệu hoặc mất. Giám đốc duyệt
          xong mới cộng vào công nợ.
        </p>
      </div>
      <section
        aria-labelledby="compensations-title"
        className="flex flex-col gap-4 rounded-lg border bg-card p-5"
      >
        <h2 id="compensations-title" className="sr-only">
          Danh sách phiếu đền bù
        </h2>
        <nav aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
          {FILTERS.map((value) => (
            <Link
              key={value}
              href={`/sales/compensations?status=${value}`}
              aria-current={value === status ? "page" : undefined}
              className={cn(
                "rounded-pill border px-3 py-1 text-sm",
                value === status
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted",
              )}
            >
              {value === "ALL" ? "Tất cả" : COMPENSATION_STATUS_LABELS[value]}
            </Link>
          ))}
        </nav>
        {list.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Không có phiếu đền bù nào.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phiếu</TableHead>
                <TableHead>Nhà thầu · công trình</TableHead>
                <TableHead>Phiếu thu hồi</TableHead>
                <TableHead className="text-right">Tiền</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/sales/compensations/${row.code}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {row.customerName}
                    <span className="block text-caption text-muted-foreground">
                      {row.siteName} · {row.contractCode}
                    </span>
                  </TableCell>
                  <TableCell>
                    {row.returnCode} · {formatBusinessDate(row.returnDate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {moneyText(row.amount)}
                  </TableCell>
                  <TableCell>
                    <CompensationStatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

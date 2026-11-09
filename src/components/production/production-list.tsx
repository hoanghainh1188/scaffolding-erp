// /production (spec "Xem lệnh trên D20 và danh sách"): newest first, filtered
// by status in the URL.
import Link from "next/link";

import { TabLinks } from "@/components/catalog/tab-links";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/domain/business-date";
import type { ProductionStatus } from "@/domain/production-order";
import { formatByUnit } from "@/domain/quantity";
import type { ProductionListRow } from "@/lib/production/queries";

import { ProductionStatusBadge } from "./production-status-badge";
import { ProductionTabs } from "./production-tabs";

interface ProductionListProps {
  rows: ProductionListRow[];
  status: ProductionStatus | undefined;
  canManage: boolean;
}

const HEADERS = [
  "Mã lệnh",
  "Tổ làm",
  "Xưởng → Bãi nhận",
  "Thành phẩm",
  "Số kế hoạch",
  "Ngày lập",
  "Trạng thái",
];

export function ProductionList({
  rows,
  status,
  canManage,
}: ProductionListProps) {
  const tab = (value: string | undefined, label: string) => ({
    label,
    href: value ? `/production?status=${value}` : "/production",
    active: status === value?.toUpperCase(),
  });
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Sản xuất</h1>
          <p className="text-sm text-muted-foreground">
            Văn phòng giao lệnh theo định mức, xưởng làm và báo trên điện thoại,
            Thủ kho đếm, Kế toán ghi sổ: nguyên liệu thành hàng Mới.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/production/new">Lệnh mới</Link>
          </Button>
        ) : null}
      </div>
      <ProductionTabs active="orders" />
      <TabLinks
        label="Trạng thái lệnh"
        tabs={[
          tab(undefined, "Tất cả"),
          tab("draft", "Nháp"),
          tab("assigned", "Đã giao"),
          tab("in_progress", "Đang làm"),
          tab("awaiting_check", "Chờ đếm"),
          tab("awaiting_approval", "Chờ Giám đốc duyệt"),
          tab("counted", "Chờ ghi sổ"),
          tab("posted", "Đã ghi sổ"),
          tab("cancelled", "Đã hủy"),
        ]}
      />
      <section
        aria-label="Danh sách lệnh sản xuất"
        className="min-w-0 rounded-lg border bg-card p-5"
      >
        {rows.length === 0 ? (
          <p className="text-muted-foreground">Chưa có lệnh sản xuất</p>
        ) : (
          <div className="relative overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  {HEADERS.map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className={`border-b px-3 py-2.5 font-semibold ${label === "Số kế hoạch" ? "text-right" : ""}`}
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
                        href={`/production/${row.code}`}
                        className="font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        {row.code}
                      </Link>
                    </th>
                    <td className="border-b px-3 py-2.5">{row.team ?? "–"}</td>
                    <td className="border-b px-3 py-2.5">
                      {row.workshopCode} → {row.toCode}
                    </td>
                    <td className="border-b px-3 py-2.5">
                      {row.products.join(", ")}
                    </td>
                    <td className="border-b px-3 py-2.5 text-right tabular-nums">
                      {formatByUnit(row.planned)}
                    </td>
                    <td
                      data-mask
                      className="border-b px-3 py-2.5 whitespace-nowrap tabular-nums"
                    >
                      {formatDateTime(row.createdAt).slice(0, 10)}
                    </td>
                    <td className="border-b px-3 py-2.5">
                      <ProductionStatusBadge status={row.status} />
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

// The repair slip list (spec "Danh sách phiếu sửa chữa").
import Link from "next/link";

import { TabLinks } from "@/components/catalog/tab-links";
import { Button } from "@/components/ui/button";
import { formatBusinessDate } from "@/domain/business-date";
import { formatMoney } from "@/domain/money";
import { formatQuantity, toQuantity } from "@/domain/quantity";
import type { RepairStatus, RepairSummary } from "@/lib/repairs/queries";

import { RepairStatusBadge } from "./repair-status-badge";

const pieces = (milli: number) => formatQuantity(toQuantity(milli, "PIECE"));

interface RepairListProps {
  rows: RepairSummary[];
  status: RepairStatus | undefined;
  canManage: boolean;
}

export function RepairList({ rows, status, canManage }: RepairListProps) {
  const tab = (value: "draft" | "posted" | undefined, label: string) => ({
    label,
    href: value ? `/repairs?status=${value}` : "/repairs",
    active: status === value?.toUpperCase(),
  });

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Sửa chữa</h1>
          <p className="text-sm text-muted-foreground">
            Chuyển hàng Chờ sửa sang Tốt (sửa xong) hoặc Phế liệu (hỏng hẳn),
            cộng chi phí sửa vào giá vốn.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/repairs/new">Phiếu mới</Link>
          </Button>
        ) : null}
      </div>
      <TabLinks
        label="Trạng thái phiếu"
        tabs={[
          tab(undefined, "Tất cả"),
          tab("draft", "Nháp"),
          tab("posted", "Đã ghi sổ"),
        ]}
      />
      <section
        aria-label="Danh sách phiếu sửa chữa"
        className="min-w-0 rounded-lg border bg-card p-5"
      >
        {rows.length === 0 ? (
          <p className="text-muted-foreground">Chưa có phiếu sửa chữa</p>
        ) : (
          <div className="relative overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  {[
                    "Mã phiếu",
                    "Ngày sửa xong",
                    "Lấy tại → Nhập về",
                    "Số mã",
                    "Sửa xong",
                    "Phế liệu",
                    "Chi phí sửa",
                    "Trạng thái",
                  ].map((label, index) => (
                    <th
                      key={label}
                      scope="col"
                      className={`border-b px-3 py-2.5 font-semibold ${index >= 3 && index <= 6 ? "text-right" : ""}`}
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
                        href={`/repairs/${row.code}`}
                        className="font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        {row.code}
                      </Link>
                    </th>
                    <td
                      data-mask
                      className="border-b px-3 py-2.5 whitespace-nowrap tabular-nums"
                    >
                      {formatBusinessDate(row.repairDate)}
                    </td>
                    <td className="border-b px-3 py-2.5">
                      {row.fromName} → {row.toName}
                    </td>
                    <td className="border-b px-3 py-2.5 text-right tabular-nums">
                      {row.lineCount}
                    </td>
                    <td className="border-b px-3 py-2.5 text-right tabular-nums">
                      {pieces(row.goodMilli)}
                    </td>
                    <td className="border-b px-3 py-2.5 text-right tabular-nums">
                      {pieces(row.scrapMilli)}
                    </td>
                    <td className="border-b px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(row.cost)}
                    </td>
                    <td className="border-b px-3 py-2.5">
                      <RepairStatusBadge status={row.status} />
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

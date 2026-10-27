import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { TabLinks } from "@/components/catalog/tab-links";
import { AdjustmentActions } from "@/components/inventory/adjustment-actions";
import { AdjustmentFormSheet } from "@/components/inventory/adjustment-form-sheet";
import { AdjustmentStatusBadge } from "@/components/inventory/adjustment-status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { formatDateTime, toBusinessDate } from "@/domain/business-date";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { listAdjustments } from "@/lib/inventory/adjustments";
import { adjustmentFormOptions } from "@/lib/inventory/form-options";
import { adjustmentStatusFrom } from "@/lib/inventory/respond";

export const metadata: Metadata = { title: "Phiếu điều chỉnh" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const KIND_LABELS = {
  ADJUSTMENT: "Điều chỉnh",
  OPENING: "Tồn đầu kỳ",
} as const;

/** Adjustment and opening documents (spec stock-adjustments). */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("inventory.view");
  const canAdjust = can(user.role, "inventory.adjust");
  const canApprove = can(user.role, "inventory.approve");
  const params = await searchParams;
  const status = adjustmentStatusFrom(params);
  const db = getDatabase();
  const [rows, options] = await Promise.all([
    listAdjustments(db, { status }),
    canAdjust ? adjustmentFormOptions(db) : null,
  ]);
  await connection();
  const today = toBusinessDate(new Date());
  const opened = typeof params.new === "string" ? params.new : null;

  const tab = (value: string | undefined, label: string) => ({
    label,
    href: value
      ? `/inventory/adjustments?status=${value}`
      : "/inventory/adjustments",
    active: status === value,
  });

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/inventory" className="hover:underline">
          Tồn kho
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Phiếu điều chỉnh</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Phiếu điều chỉnh</h1>
          <p className="text-sm text-muted-foreground">
            Sửa sai số lượng, tình trạng, vị trí và nhập tồn đầu kỳ. Chỉ ghi sổ
            khi Giám đốc duyệt.
          </p>
        </div>
        {options ? (
          <div className="flex flex-wrap gap-2">
            <AdjustmentFormSheet
              kind="OPENING"
              items={options.items}
              places={options.places}
              today={today}
              defaultOpen={opened === "OPENING"}
              trigger={<Button variant="outline">Lập phiếu tồn đầu kỳ</Button>}
            />
            <AdjustmentFormSheet
              kind="ADJUSTMENT"
              items={options.items}
              places={options.places}
              today={today}
              defaultOpen={opened === "ADJUSTMENT"}
              trigger={<Button>Lập phiếu điều chỉnh</Button>}
            />
          </div>
        ) : null}
      </div>
      <TabLinks
        label="Trạng thái phiếu"
        tabs={[
          tab(undefined, "Tất cả"),
          tab("PENDING_APPROVAL", "Chờ duyệt"),
          tab("DRAFT", "Nháp"),
          tab("DONE", "Đã ghi sổ"),
        ]}
      />
      <section
        aria-label="Danh sách phiếu"
        className="rounded-lg border bg-card p-5"
      >
        {rows.length === 0 ? (
          <p className="text-muted-foreground">Chưa có phiếu nào.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  {[
                    "Mã phiếu",
                    "Loại",
                    "Ngày lập",
                    "Người lập",
                    "Lý do",
                    "Số dòng",
                    "Trạng thái",
                    "",
                  ].map((label, index) => (
                    <th
                      key={index}
                      scope="col"
                      className="border-b px-3 py-2.5 font-semibold"
                    >
                      {label || <span className="sr-only">Thao tác</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="bg-card hover:bg-muted">
                    <th scope="row" className="border-b px-3 py-2.5 text-left">
                      <Link
                        href={`/inventory/adjustments/${row.id}`}
                        className="font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        {row.code}
                      </Link>
                    </th>
                    <td className="border-b px-3 py-2.5">
                      {KIND_LABELS[row.kind]}
                    </td>
                    <td className="border-b px-3 py-2.5 whitespace-nowrap tabular-nums">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="border-b px-3 py-2.5">
                      {row.createdByName}
                    </td>
                    <td className="border-b px-3 py-2.5">{row.reason}</td>
                    <td className="border-b px-3 py-2.5 text-right tabular-nums">
                      {row.lineCount}
                    </td>
                    <td className="border-b px-3 py-2.5">
                      <AdjustmentStatusBadge status={row.status} />
                    </td>
                    <td className="border-b px-3 py-2.5">
                      {row.status === "PENDING_APPROVAL" && canApprove ? (
                        <AdjustmentActions
                          id={row.id}
                          code={row.code}
                          status={row.status}
                          canAdjust={false}
                          canApprove
                        />
                      ) : null}
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

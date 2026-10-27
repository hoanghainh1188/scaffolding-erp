import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ConditionBadge } from "@/components/domain/condition-badge";
import { AdjustmentActions } from "@/components/inventory/adjustment-actions";
import { AdjustmentFormSheet } from "@/components/inventory/adjustment-form-sheet";
import { AdjustmentStatusBadge } from "@/components/inventory/adjustment-status-badge";
import { formatCost, formatStock } from "@/components/inventory/format";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import {
  formatBusinessDate,
  formatDateTime,
  toBusinessDate,
} from "@/domain/business-date";
import { can } from "@/domain/permissions";
import { ADJUSTMENT_LINE_TYPE_LABELS } from "@/domain/stock-adjustment";
import { requirePermission } from "@/lib/auth/guard";
import { getAdjustment } from "@/lib/inventory/adjustments";
import { adjustmentFormOptions } from "@/lib/inventory/form-options";

export const metadata: Metadata = { title: "Phiếu điều chỉnh" };

type Params = Promise<{ id: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MOVEMENT_LABELS: Record<string, string> = {
  ADJUST_IN: "Vào",
  ADJUST_OUT: "Ra",
  OPENING: "Tồn đầu",
};

/** One adjustment or opening document, with the lines it posted. */
export default async function Page({ params }: { params: Params }) {
  const user = await requirePermission("inventory.view");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = getDatabase();
  const adjustment = await getAdjustment(db, id);
  if (!adjustment) notFound();
  const canAdjust = can(user.role, "inventory.adjust");
  const canApprove = can(user.role, "inventory.approve");
  const options =
    canAdjust && adjustment.status === "DRAFT"
      ? await adjustmentFormOptions(db)
      : null;
  await connection();
  const today = toBusinessDate(new Date());
  const th = "border-b px-3 py-2.5 text-left font-semibold";
  const td = "border-b px-3 py-2.5";

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/inventory" className="hover:underline">
          Tồn kho
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link href="/inventory/adjustments" className="hover:underline">
          Phiếu điều chỉnh
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">{adjustment.code}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1">
              {adjustment.kind === "OPENING" ? "Tồn đầu kỳ" : "Điều chỉnh"} ·{" "}
              {adjustment.code}
            </h1>
            <AdjustmentStatusBadge status={adjustment.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {adjustment.createdByName} lập{" "}
            {formatDateTime(adjustment.createdAt)}
            {adjustment.approvedAt
              ? ` · ${adjustment.approvedByName ?? ""} duyệt ${formatDateTime(adjustment.approvedAt)}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {options ? (
            <AdjustmentFormSheet
              kind={adjustment.kind}
              items={options.items}
              places={options.places}
              adjustment={adjustment}
              today={today}
              trigger={<Button variant="outline">Sửa</Button>}
            />
          ) : null}
          <AdjustmentActions
            id={adjustment.id}
            code={adjustment.code}
            status={adjustment.status}
            canAdjust={canAdjust}
            canApprove={canApprove}
          />
        </div>
      </div>
      {adjustment.returnedReason && adjustment.status === "DRAFT" ? (
        <p
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          Giám đốc trả lại: {adjustment.returnedReason}
        </p>
      ) : null}
      <section
        aria-label="Thông tin phiếu"
        className="rounded-lg border bg-card p-5"
      >
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <dt className="text-caption font-semibold text-muted-foreground">
              Lý do
            </dt>
            <dd>{adjustment.reason}</dd>
          </div>
          <div>
            <dt className="text-caption font-semibold text-muted-foreground">
              {adjustment.kind === "OPENING"
                ? "Ngày tồn đầu"
                : "Chứng từ bị sửa"}
            </dt>
            <dd>
              {adjustment.kind === "OPENING" && adjustment.openingDate
                ? formatBusinessDate(adjustment.openingDate)
                : (adjustment.relatedDocumentCode ?? "–")}
            </dd>
          </div>
        </dl>
      </section>
      <section
        aria-labelledby="lines"
        className="flex flex-col gap-4 rounded-lg border bg-card p-5"
      >
        <h2 id="lines" className="font-display text-h2">
          Các dòng
        </h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className={th}>
                  Kiểu
                </th>
                <th scope="col" className={th}>
                  Vật tư
                </th>
                <th scope="col" className={th}>
                  Tình trạng
                </th>
                <th scope="col" className={th}>
                  Vị trí
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Số lượng
                </th>
                {adjustment.kind === "OPENING" ? (
                  <th scope="col" className={`${th} text-right`}>
                    Đơn giá vốn
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {adjustment.lines.map((line) => (
                <tr key={line.lineNo}>
                  <td className={td}>
                    {ADJUSTMENT_LINE_TYPE_LABELS[line.lineType]}
                  </td>
                  <td className={td}>
                    <span className="font-semibold">{line.itemCode}</span> ·{" "}
                    {line.itemName}
                  </td>
                  <td className={td}>
                    <span className="inline-flex items-center gap-1.5">
                      <ConditionBadge condition={line.condition} />
                      {line.toCondition ? (
                        <>
                          <span aria-label="sang">→</span>
                          <ConditionBadge condition={line.toCondition} />
                        </>
                      ) : null}
                    </span>
                  </td>
                  <td className={td}>
                    {line.locationCode}
                    {line.toLocationCode ? ` → ${line.toLocationCode}` : ""}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {line.quantity > 0 && line.lineType === "QUANTITY"
                      ? "+"
                      : ""}
                    {formatStock(line.quantity, line.unit)}
                  </td>
                  {adjustment.kind === "OPENING" ? (
                    <td className={`${td} text-right tabular-nums`}>
                      {formatCost(line.unitCost)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {adjustment.posted.length > 0 ? (
        <section
          aria-labelledby="posted"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="posted" className="font-display text-h2">
            Dòng đã ghi sổ kho
          </h2>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className={th}>
                    Vào / ra
                  </th>
                  <th scope="col" className={th}>
                    Vật tư
                  </th>
                  <th scope="col" className={th}>
                    Tình trạng
                  </th>
                  <th scope="col" className={th}>
                    Vị trí
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    Số lượng
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    Đơn giá ghi sổ
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    Giá vốn BQ sau
                  </th>
                </tr>
              </thead>
              <tbody>
                {adjustment.posted.map((line) => (
                  <tr key={line.id}>
                    <td className={td}>
                      {MOVEMENT_LABELS[line.movement] ?? line.movement}
                    </td>
                    <td className={td}>{line.itemCode}</td>
                    <td className={td}>
                      <ConditionBadge condition={line.condition} />
                    </td>
                    <td className={td}>{line.locationCode}</td>
                    <td className={`${td} text-right`}>
                      {formatStock(line.quantity, "KG")}
                    </td>
                    <td className={`${td} text-right`}>
                      {formatCost(line.unitCost)}
                    </td>
                    <td className={`${td} text-right`}>
                      {formatCost(line.avgAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

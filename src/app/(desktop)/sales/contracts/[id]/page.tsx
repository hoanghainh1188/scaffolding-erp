import { Calculator, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { ApprovalBar } from "@/components/contracts/approval-bar";
import { ContractActions } from "@/components/contracts/contract-actions";
import {
  ContractStatusBadge,
  ContractTypeBadge,
  RevisionStatusBadge,
} from "@/components/contracts/contract-badges";
import {
  BatchList,
  CompensationList,
  DepositList,
  LinesTable,
  TermsSummary,
} from "@/components/contracts/contract-view";
import { CompensationStatusBadge } from "@/components/compensations/compensation-badge";
import { DepositReceived } from "@/components/receivables/deposit-received";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import {
  formatBusinessDate,
  formatDateTime,
  toBusinessDate,
} from "@/domain/business-date";
import { formatMoney, toMoney } from "@/domain/money";
import { can as canRole } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { contractCompensations } from "@/lib/compensations/queries";
import { contractMoneyStatus } from "@/lib/receivables/queries";
import { getContractDetail } from "@/lib/contracts/queries";

export const metadata: Metadata = { title: "Hợp đồng" };

const money = (value: number | null) =>
  value === null ? "–" : formatMoney(toMoney(value));

/** D5: one contract, its checks and the director's approval bar. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("sales.view");
  const { id } = await params;
  await connection();
  const found = await getContractDetail(
    getDatabase(),
    user,
    id,
    toBusinessDate(new Date()),
  );
  if (!found.ok) {
    if (found.status === 403) forbidden();
    notFound();
  }
  const { head, shown, checks, revisions, can, openAmendment } = found.data;
  const depositStatus = await contractMoneyStatus(getDatabase(), head.id);
  const compensations =
    head.type === "RENTAL"
      ? await contractCompensations(getDatabase(), head.id)
      : [];

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/sales/contracts" className="hover:underline">
          Hợp đồng
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">{head.code}</span>
      </nav>
      {can.approve ? (
        <ApprovalBar
          path={`/api/contracts/${id}`}
          what="Hợp đồng"
          submittedBy={shown.submitted?.name ?? null}
          submittedAt={shown.submitted?.at ?? null}
          overdue={checks.overdue}
        />
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{head.code}</h1>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <ContractTypeBadge type={head.type} />
            <ContractStatusBadge status={head.status} />
            {shown.number > 0 ? <span>Đang áp dụng {shown.code}</span> : null}
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          {head.status === "APPROVED" || head.status === "ACTIVE" ? (
            <Button asChild variant="outline">
              <Link href={`/sales/contracts/${id}/deliveries`}>
                <Truck aria-hidden />{" "}
                {head.type === "RENTAL" ? "Tiến độ cấp hàng" : "Giao hàng"}
              </Link>
            </Button>
          ) : null}
          {head.type === "RENTAL" &&
          (head.status === "ACTIVE" || head.status === "CLOSED") &&
          canRole(user.role, "billing.view") ? (
            <Button asChild variant="outline">
              <Link href={`/receivables/billing?contract=${id}`}>
                <Calculator aria-hidden /> Tiền thuê theo kỳ
              </Link>
            </Button>
          ) : null}
          <ContractActions
            id={id}
            code={head.code}
            can={can}
            openAmendment={openAmendment?.number ?? null}
          />
        </div>
      </div>
      {shown.returnedReason && head.status === "DRAFT" ? (
        <p
          role="status"
          className="rounded-lg border border-warning bg-card px-4 py-3 text-sm"
        >
          <strong>Giám đốc trả lại:</strong> {shown.returnedReason}
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="party-title"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 id="party-title" className="text-h2">
              {head.type === "RENTAL" ? "Bên thuê và công trình" : "Bên mua"}
            </h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Nhà thầu</dt>
                <dd className="font-medium">
                  {head.customer.name} · {head.customer.code}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Công trình</dt>
                <dd className="font-medium">
                  {head.site
                    ? `${head.site.name}${head.site.address ? `, ${head.site.address}` : ""}`
                    : "Nhận hàng tại bãi"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phụ trách</dt>
                <dd>{head.salesUser?.name ?? "Chưa có"}</dd>
              </div>
            </dl>
            <TermsSummary type={head.type} view={shown} />
          </section>

          <section
            aria-labelledby="lines-title"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 id="lines-title" className="text-h2">
              {head.type === "RENTAL" ? "Hàng cho thuê" : "Hàng bán"}
            </h2>
            <LinesTable type={head.type} view={shown} />
            {head.type === "RENTAL" ? (
              <p className="text-sm text-muted-foreground">
                Tiền thuê tính theo ngày, theo số linh kiện thực tế đang ở công
                trình: không tính ngày xuất, tính ngày trả.
              </p>
            ) : null}
          </section>

          {head.type === "RENTAL" ? (
            <section
              aria-labelledby="compensation-title"
              className="flex flex-col gap-3 rounded-lg border bg-card p-5"
            >
              <h2 id="compensation-title" className="text-h2">
                Bảng giá đền bù
              </h2>
              <CompensationList view={shown} />
            </section>
          ) : null}

          {compensations.length > 0 ? (
            <section
              aria-labelledby="compensation-notes-title"
              className="flex flex-col gap-3 rounded-lg border bg-card p-5"
            >
              <h2 id="compensation-notes-title" className="text-h2">
                Đền bù
              </h2>
              <ul className="flex flex-col gap-2 text-sm">
                {compensations.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Link
                      href={`/sales/compensations/${row.code}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.code}
                    </Link>
                    <span>
                      · {row.returnCode} · {money(row.amount)} ·
                    </span>
                    <CompensationStatusBadge status={row.status} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section
            aria-labelledby="deposit-title"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 id="deposit-title" className="text-h2">
              Tiền cọc
            </h2>
            <DepositList view={shown} />
            <DepositReceived
              status={depositStatus}
              agreed={shown.deposits
                .filter((entry) => entry.kind === "CASH")
                .reduce((sum, entry) => sum + entry.amount, 0)}
              settleHref={
                head.status === "ACTIVE" &&
                canRole(user.role, "contracts.close")
                  ? `/receivables/contracts/${head.id}/close`
                  : null
              }
            />
          </section>

          <section
            aria-labelledby="batch-title"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 id="batch-title" className="text-h2">
              Kế hoạch giao hàng
            </h2>
            <BatchList view={shown} />
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <section
            aria-labelledby="value-title"
            className="flex flex-col gap-1 rounded-lg border bg-card p-5"
          >
            <h2 id="value-title" className="text-label text-muted-foreground">
              {head.type === "RENTAL" ? "Giá trị dự kiến" : "Tổng tiền hàng"}
            </h2>
            <p className="text-h1 tabular-nums">{money(shown.value)}</p>
            {shown.expectedDays ? (
              <p className="text-sm text-muted-foreground">
                {shown.expectedDays.days} ngày
                {shown.expectedDays.minimumApplied ? " (tối thiểu)" : ""} ×{" "}
                {money(shown.dayRent)}, chưa gồm VAT và vận chuyển
              </p>
            ) : null}
          </section>
          <section
            aria-labelledby="check-title"
            className="flex flex-col gap-2 rounded-lg border bg-card p-5"
          >
            <h2 id="check-title" className="text-label">
              Kiểm tra trước khi duyệt
            </h2>
            <ul data-mask className="flex flex-col gap-1.5 text-sm">
              {checks.lines.map((line) => (
                <li
                  key={line.message}
                  className={line.ok ? "text-success" : "text-warning"}
                >
                  {line.ok ? "✓ " : "! "}
                  {line.message}
                </li>
              ))}
            </ul>
          </section>
          <section
            aria-labelledby="history-title"
            data-mask
            className="flex flex-col gap-2 rounded-lg border bg-card p-5 text-sm"
          >
            <h2 id="history-title" className="text-label">
              Lịch sử
            </h2>
            <p>
              Người lập: {head.createdBy} ·{" "}
              {formatDateTime(new Date(head.createdAt))}
            </p>
            {shown.submitted ? (
              <p>
                Gửi duyệt: {shown.submitted.name} ·{" "}
                {formatDateTime(new Date(shown.submitted.at))}
              </p>
            ) : null}
            {shown.approved ? (
              <p>
                Duyệt: {shown.approved.name} ·{" "}
                {formatDateTime(new Date(shown.approved.at))}
                {shown.approvalReason ? (
                  <span className="block text-muted-foreground">
                    Lý do vẫn duyệt
                    {shown.overdueAmount
                      ? ` (nợ quá hạn ${money(shown.overdueAmount)}, ${shown.overdueDays} ngày)`
                      : ""}
                    : {shown.approvalReason}
                  </span>
                ) : null}
              </p>
            ) : null}
          </section>
          <section
            aria-labelledby="versions-title"
            className="flex flex-col gap-2 rounded-lg border bg-card p-5 text-sm"
          >
            <h2 id="versions-title" className="text-label">
              Các bản của hợp đồng
            </h2>
            <ul className="flex flex-col gap-1.5">
              {revisions.map((revision) => (
                <li
                  key={revision.number}
                  className="flex flex-wrap items-center gap-2"
                >
                  {revision.number === 0 ? (
                    <span>Hợp đồng gốc</span>
                  ) : (
                    <Link
                      href={`/sales/contracts/${id}/amendments/${revision.number}`}
                      className="text-primary hover:underline"
                    >
                      Phụ lục {String(revision.number).padStart(2, "0")}
                    </Link>
                  )}
                  <span className="text-muted-foreground tabular-nums">
                    {formatBusinessDate(revision.effectiveFrom)}
                  </span>
                  <RevisionStatusBadge status={revision.status} />
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

import { CheckCircle2, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ToneBadge } from "@/components/domain/tone-badge";
import { dayMonth, money } from "@/components/receivables/format";
import { SettlePanel } from "@/components/receivables/settle-panel";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDatabase } from "@/db/client";
import { formatBusinessDate, toBusinessDate } from "@/domain/business-date";
import { CONTRACT_STATUS_LABELS } from "@/domain/contract";
import { can } from "@/domain/permissions";
import { DEBT_KIND_LABELS, orderDebts } from "@/domain/receivables";
import { requirePermission } from "@/lib/auth/guard";
import { debtLabel } from "@/lib/receivables/receipts";
import { settlementView } from "@/lib/receivables/settlement";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Thanh lý hợp đồng" };

/** D14b (contract-settlement spec). */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("receivables.view");
  const { id } = await params;
  await connection();
  const today = toBusinessDate(new Date());
  const view = await settlementView(getDatabase(), id, today);
  if (!view) notFound();
  const open = orderDebts(view.debts.filter((debt) => debt.remaining > 0));
  const owed = open.reduce((sum, debt) => sum + debt.remaining, 0);
  const done = view.settled;

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link
          href={`/receivables?customer=${view.contract.customerId}`}
          className="hover:underline"
        >
          Công nợ phải thu · {view.contract.customerName}
        </Link>{" "}
        / Thanh lý {view.contract.code}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Thanh lý hợp đồng</h1>
          <p className="text-body text-muted-foreground">
            {view.contract.code} · {view.contract.customerName}
            {view.contract.siteName
              ? ` · ${view.contract.siteName}`
              : ""} ·{" "}
            <span data-mask>số liệu đến {formatBusinessDate(today)}</span>
          </p>
        </div>
        <ToneBadge tone={done ? "success" : "neutral"}>
          {CONTRACT_STATUS_LABELS[view.contract.status]}
        </ToneBadge>
      </div>

      {done ? (
        <p
          role="status"
          className="rounded-lg border border-success bg-card p-4 text-sm"
        >
          Đã thanh lý ngày {formatBusinessDate(done.settledDate)} bởi{" "}
          {done.byName}. Hoàn lại khách {money(done.refundAmount)}
          {done.refundDate
            ? ` ngày ${formatBusinessDate(done.refundDate)}`
            : ""}
          .
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {!done ? (
            <section
              aria-labelledby="checks-title"
              className="flex flex-col gap-3 rounded-lg border bg-card p-5"
            >
              <h2 id="checks-title" className="text-h2">
                Điều kiện thanh lý
              </h2>
              <ul className="flex flex-col gap-2">
                {view.checks.map((check) => (
                  <li
                    key={check.key}
                    className="flex items-start gap-2 text-sm"
                  >
                    {check.ok ? (
                      <CheckCircle2
                        aria-label="Đạt"
                        className="mt-0.5 size-4 shrink-0 text-success"
                      />
                    ) : (
                      <CircleAlert
                        aria-label="Chưa đạt"
                        className="mt-0.5 size-4 shrink-0 text-destructive"
                      />
                    )}
                    <span
                      className={cn(!check.ok && "text-destructive")}
                      data-mask
                    >
                      {check.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section
            aria-labelledby="contract-debts-title"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 id="contract-debts-title" className="text-h2">
              Nợ còn lại của hợp đồng
            </h2>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Khoản</TableHead>
                    <TableHead className="text-right">Phát sinh</TableHead>
                    <TableHead className="text-right">Đã trừ</TableHead>
                    <TableHead className="text-right">Còn lại</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {open.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        Hợp đồng không còn khoản nợ nào.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {open.map((debt) => (
                    <TableRow key={debt.key}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{debtLabel(debt)}</span>
                          <ToneBadge tone="neutral">
                            {DEBT_KIND_LABELS[debt.kind]}
                          </ToneBadge>
                        </span>
                        <span className="text-caption text-muted-foreground">
                          hạn {dayMonth(debt.dueDate)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(debt.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(debt.paid)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {money(debt.remaining)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>Cộng còn nợ</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {money(owed)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            <p className="text-caption text-muted-foreground">
              Chỉ tính khoản của hợp đồng này. Nợ của hợp đồng khác và tiền trả
              trước của nhà thầu không cấn ở đây.
            </p>
          </section>
        </div>

        {!done ? (
          <SettlePanel
            contractId={view.contract.id}
            contractCode={view.contract.code}
            deposit={view.plan.deposit}
            offset={view.plan.offset}
            refund={view.plan.refund}
            debtCount={view.plan.allocations.length}
            today={today}
            ready={view.ready}
            canSettle={can(user.role, "contracts.close")}
          />
        ) : null}
      </div>
    </div>
  );
}

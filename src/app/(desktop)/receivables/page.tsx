import {
  Calculator,
  ChevronRight,
  DownloadIcon,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import {
  CustomerTable,
  listHref,
  type ListState,
} from "@/components/receivables/customer-table";
import { DebtTable } from "@/components/receivables/debt-table";
import { DepositPanel } from "@/components/receivables/deposit-panel";
import { ReceiptForm } from "@/components/receivables/receipt-form";
import { ReceiptTable } from "@/components/receivables/receipt-table";
import { SummaryTiles } from "@/components/receivables/summary-tiles";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { formatBusinessDate, toBusinessDate } from "@/domain/business-date";
import { can } from "@/domain/permissions";
import { DEBT_KIND_LABELS, orderDebts } from "@/domain/receivables";
import { requirePermission } from "@/lib/auth/guard";
import {
  customerBalances,
  RECEIVABLE_FILTERS,
  type ReceivableFilter,
} from "@/lib/receivables/balances";
import { customerDetail, guaranteeAlerts } from "@/lib/receivables/queries";
import { debtLabel } from "@/lib/receivables/receipts";

export const metadata: Metadata = { title: "Công nợ phải thu" };

type Search = {
  filter?: string;
  q?: string;
  page?: string;
  customer?: string;
  paid?: string;
};

function stateOf(query: Search): ListState {
  const filter = (RECEIVABLE_FILTERS as readonly string[]).includes(
    query.filter ?? "",
  )
    ? (query.filter as ReceivableFilter)
    : "owing";
  const page = Number(query.page ?? "1");
  return {
    filter,
    q: (query.q ?? "").slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    customer:
      query.customer && /^[0-9a-f-]{36}$/i.test(query.customer)
        ? query.customer
        : null,
    paid: query.paid === "1",
  };
}

/** D14 (receivables spec "Màn D14 theo nhà thầu"). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requirePermission("receivables.view");
  const query = await searchParams;
  await connection();
  const today = toBusinessDate(new Date());
  const asked = stateOf(query);
  const db = getDatabase();
  const [balances, alerts] = await Promise.all([
    customerBalances(db, today, asked),
    guaranteeAlerts(db, today),
  ]);
  const state: ListState = {
    ...asked,
    page: balances.page,
    customer: asked.customer ?? balances.rows[0]?.id ?? null,
  };
  const detail = state.customer
    ? await customerDetail(db, state.customer, today)
    : null;
  const manage = can(user.role, "receipts.manage");
  const exportHref = `/api/receivables/export?filter=${state.filter}${state.q ? `&q=${encodeURIComponent(state.q)}` : ""}`;

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <h1 className="text-h1">Công nợ phải thu</h1>
          <p className="text-body text-muted-foreground" data-mask>
            Số liệu đến hết ngày {formatBusinessDate(today)}. Gồm kỳ tiền thuê
            đã chốt, hàng bán đã giao, đền bù và mua lại đã duyệt. Cọc giữ
            riêng, không trừ vào nợ.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={exportHref} download>
            <DownloadIcon aria-hidden /> Xuất Excel
          </a>
        </Button>
      </div>

      <SummaryTiles totals={balances.totals} />

      {alerts.length > 0 ? (
        <ul
          role="note"
          className="flex flex-col gap-1 rounded-lg border border-warning bg-warning/10 p-4 text-sm"
        >
          {alerts.map((alert) => (
            <li
              key={`${alert.contractId}-${alert.guaranteeNumber}`}
              className="flex items-start gap-2"
            >
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-warning"
              />
              <span data-mask>{alert.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <CustomerTable
        state={state}
        counts={balances.counts}
        rows={balances.rows}
        page={balances.page}
        pageCount={balances.pageCount}
      />

      {detail ? (
        <>
          <p className="-mb-3 text-sm text-muted-foreground">
            Được nợ {detail.customer.paymentTermsDays} ngày ·{" "}
            {detail.contractCount} hợp đồng
          </p>
          <DebtTable
            customerName={detail.customer.name}
            debts={detail.debts}
            owed={detail.owed}
            showPaid={state.paid}
            togglePaidHref={listHref(state, { paid: !state.paid })}
          />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {manage ? (
              <ReceiptForm
                key={detail.customer.id}
                customerId={detail.customer.id}
                customerName={detail.customer.name}
                today={today}
                debts={orderDebts(
                  detail.debts.filter((debt) => debt.remaining > 0),
                ).map((debt) => ({
                  key: debt.key,
                  label: debtLabel(debt),
                  kindLabel: DEBT_KIND_LABELS[debt.kind],
                  dueDate: debt.dueDate,
                  remaining: debt.remaining,
                }))}
                depositContracts={detail.deposits
                  .filter((view) => view.agreed > view.received)
                  .map((view) => ({
                    contractId: view.contractId,
                    code: view.contractCode,
                    room: view.agreed - view.received,
                  }))}
              />
            ) : null}
            <DepositPanel
              deposits={detail.deposits}
              canSettle={can(user.role, "contracts.close")}
            />
          </div>
          <ReceiptTable
            customerName={detail.customer.name}
            rows={detail.receipts}
            canCancel={manage}
          />
        </>
      ) : null}

      <Link
        href="/receivables/billing"
        className="flex max-w-xl items-center gap-4 rounded-lg border bg-card p-5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Calculator aria-hidden className="size-5" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span className="text-label">Tính tiền thuê</span>
          <span className="text-body text-muted-foreground">
            Tiền thuê từng hợp đồng theo tháng, chốt kỳ, in bảng kê, xuất Excel.
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
      </Link>
    </div>
  );
}

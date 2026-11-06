import { DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { LedgerTabs } from "@/components/finance/ledger-tabs";
import { PayableTable } from "@/components/payables/payable-table";
import { PaymentForm } from "@/components/payables/payment-form";
import { PaymentTable } from "@/components/payables/payment-table";
import {
  payablesHref,
  SupplierTable,
  type PayableListState,
} from "@/components/payables/supplier-table";
import { PayableTiles } from "@/components/payables/summary-tiles";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { formatBusinessDate, toBusinessDate } from "@/domain/business-date";
import { termsHeading } from "@/domain/payables";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import {
  PAYABLE_FILTERS,
  supplierBalances,
  type PayableFilter,
} from "@/lib/payables/balances";
import { PAYMENT_PAGE_SIZE, supplierDetail } from "@/lib/payables/queries";

export const metadata: Metadata = { title: "Công nợ phải trả" };

type Search = {
  filter?: string;
  q?: string;
  page?: string;
  supplier?: string;
  paid?: string;
  payments?: string;
};

function stateOf(query: Search): PayableListState {
  const filter = (PAYABLE_FILTERS as readonly string[]).includes(
    query.filter ?? "",
  )
    ? (query.filter as PayableFilter)
    : "owing";
  const page = Number(query.page ?? "1");
  return {
    filter,
    q: (query.q ?? "").slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    supplier:
      query.supplier && /^[0-9a-f-]{36}$/i.test(query.supplier)
        ? query.supplier
        : null,
    paid: query.paid === "1",
  };
}

/** D14c (payables spec "Màn D14c theo người bán"). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requirePermission("payables.view");
  const query = await searchParams;
  await connection();
  const today = toBusinessDate(new Date());
  const asked = stateOf(query);
  const db = getDatabase();
  const balances = await supplierBalances(db, today, asked);
  const state: PayableListState = {
    ...asked,
    page: balances.page,
    supplier: asked.supplier ?? balances.rows[0]?.id ?? null,
  };
  const shownPayments = Math.max(
    PAYMENT_PAGE_SIZE,
    Math.min(Number(query.payments) || PAYMENT_PAGE_SIZE, 500),
  );
  const detail = state.supplier
    ? await supplierDetail(db, state.supplier, today, {
        showPaid: state.paid,
        paymentLimit: shownPayments,
      })
    : null;
  const manage = can(user.role, "payments.manage");
  const exportHref = `/api/payables/export?filter=${state.filter}${state.q ? `&q=${encodeURIComponent(state.q)}` : ""}`;

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <LedgerTabs role={user.role} active="payables" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <h1 className="text-h1">Công nợ phải trả</h1>
          <p className="text-body text-muted-foreground" data-mask>
            Số liệu đến hết ngày {formatBusinessDate(today)}. Mỗi phiếu nhập đã
            ghi sổ là một khoản phải trả người bán: số thực nhận × đơn giá trên
            đơn (kg theo cân thực tế). Không gồm cước xe, bốc xếp. Chưa VAT.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={exportHref} download>
            <DownloadIcon aria-hidden /> Xuất Excel
          </a>
        </Button>
      </div>

      <PayableTiles totals={balances.totals} />

      <SupplierTable
        state={state}
        counts={balances.counts}
        rows={balances.rows}
        page={balances.page}
        pageCount={balances.pageCount}
      />

      {detail ? (
        <>
          <PayableTable
            supplierName={detail.name}
            heading={[
              termsHeading(detail.paymentTermsDays),
              `${detail.orderCount} đơn mua`,
              detail.bankAccount
                ? `STK ${[detail.bankAccount, detail.bankName].filter(Boolean).join(" · ")}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            payables={detail.payables}
            owed={detail.owed}
            showPaid={state.paid}
            togglePaidHref={payablesHref(state, { paid: !state.paid })}
          />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {manage ? (
              <PaymentForm
                key={detail.id}
                supplierId={detail.id}
                supplierName={detail.name}
                today={today}
                payables={detail.payables
                  .filter((row) => row.remaining > 0)
                  .map((row) => ({
                    id: row.key,
                    code: row.code,
                    issuedDate: row.issuedDate,
                    dueDate: row.dueDate,
                    remaining: row.remaining,
                  }))}
              />
            ) : null}
            <PaymentTable
              supplierName={detail.name}
              rows={detail.payments}
              canCancel={manage}
              moreHref={
                detail.hasMorePayments
                  ? `${payablesHref(state)}${payablesHref(state).includes("?") ? "&" : "?"}payments=${shownPayments + PAYMENT_PAGE_SIZE}`
                  : null
              }
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

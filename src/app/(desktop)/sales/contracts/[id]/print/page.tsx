import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import {
  BatchList,
  CompensationList,
  DepositList,
  LinesTable,
  TermsSummary,
} from "@/components/contracts/contract-view";
import { PrintButton } from "@/components/contracts/print-button";
import { printTitle } from "@/components/contracts/print-title";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { formatMoney, toMoney } from "@/domain/money";
import { requirePermission } from "@/lib/auth/guard";
import { getCompanyProfile } from "@/lib/company/service";
import { getContractDetail } from "@/lib/contracts/queries";

export const metadata: Metadata = { title: "In hợp đồng" };

/**
 * The quote (draft, pending) or the contract (approved on), headed with the
 * company profile of Cài đặt, never written in code (0.2 #33, design D5).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("sales.view");
  const { id } = await params;
  await connection();
  const db = getDatabase();
  const found = await getContractDetail(
    db,
    user,
    id,
    toBusinessDate(new Date()),
  );
  if (!found.ok) {
    if (found.status === 403) forbidden();
    notFound();
  }
  const { head, shown } = found.data;
  const company = await getCompanyProfile(db);
  const quote = head.status === "DRAFT" || head.status === "PENDING";
  const title = printTitle(head.status, head.code, shown.code);
  const bank = [company.bankAccount, company.bankName]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 bg-card p-6 print:p-0">
      <div className="flex justify-between gap-3 print:hidden">
        <Link
          href={`/sales/contracts/${id}`}
          className="text-sm text-primary hover:underline"
        >
          Về hợp đồng
        </Link>
        <PrintButton title={title} />
      </div>
      <header className="flex items-start gap-4 border-b pb-4">
        {company.logoUrl ? (
          // A data URL or an absolute URL set in Cài đặt; no next/image here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={company.logoUrl}
            alt=""
            width={64}
            height={64}
            className="size-16 object-contain"
          />
        ) : null}
        <div className="flex flex-col gap-0.5 text-sm">
          <p className="text-h2">{company.name}</p>
          {company.taxId ? <p>Mã số thuế: {company.taxId}</p> : null}
          {company.address ? <p>{company.address}</p> : null}
          {company.phone ? <p>Điện thoại: {company.phone}</p> : null}
          {bank ? <p>Tài khoản: {bank}</p> : null}
        </div>
      </header>
      <h1 className="text-center text-h1">{title}</h1>
      <section className="flex flex-col gap-2 text-sm">
        <p>
          <strong>Bên {head.type === "RENTAL" ? "thuê" : "mua"}:</strong>{" "}
          {head.customer.name} · {head.customer.code}
        </p>
        <p>
          <strong>Công trình:</strong>{" "}
          {head.site
            ? `${head.site.name}${head.site.address ? `, ${head.site.address}` : ""}`
            : "Nhận hàng tại bãi"}
        </p>
        <TermsSummary type={head.type} view={shown} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-h2">
          {head.type === "RENTAL" ? "Hàng cho thuê" : "Hàng bán"}
        </h2>
        <LinesTable type={head.type} view={shown} />
        {shown.value !== null ? (
          <p className="text-right text-sm">
            {head.type === "RENTAL" ? "Giá trị dự kiến" : "Tổng tiền hàng"}:{" "}
            <strong className="tabular-nums">
              {formatMoney(toMoney(shown.value))}
            </strong>
            {shown.expectedDays
              ? ` (${shown.expectedDays.days} ngày, chưa gồm VAT và vận chuyển)`
              : ""}
          </p>
        ) : null}
      </section>
      {head.type === "RENTAL" ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-h2">Bảng giá đền bù</h2>
          <CompensationList view={shown} />
        </section>
      ) : null}
      <section className="flex flex-col gap-2">
        <h2 className="text-h2">Tiền cọc</h2>
        <DepositList view={shown} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-h2">Kế hoạch giao hàng</h2>
        <BatchList view={shown} />
      </section>
      {!quote ? (
        <div className="mt-8 grid grid-cols-2 gap-6 text-center text-sm">
          <p>
            <strong>
              Đại diện bên {head.type === "RENTAL" ? "thuê" : "mua"}
            </strong>
          </p>
          <p>
            <strong>Đại diện {company.name}</strong>
          </p>
        </div>
      ) : null}
    </div>
  );
}

// The printed statement of one contract for a month (rental-billing design
// D9): company of Cài đặt, contract, holidays, lines, freight, amount due,
// signatures; an open month carries "TẠM TÍNH – CHƯA CHỐT".
import Link from "next/link";

import { PrintButton } from "@/components/contracts/print-button";
import { formatBusinessDate } from "@/domain/business-date";
import type { CompanyProfile } from "@/domain/company";
import { formatMonth, periodOf, vatText } from "@/domain/rental-billing";
import type { ContractStatementView } from "@/lib/billing/queries";

import { StatementTable } from "./statement-table";
import { AmountDue, FreightTable } from "./statement-totals";

const SIGNERS = ["Bên cho thuê", "Bên thuê"];

interface PrintedStatementProps {
  company: Pick<
    CompanyProfile,
    "name" | "taxId" | "address" | "phone" | "logoUrl"
  >;
  view: ContractStatementView;
  contractId: string;
}

export function PrintedStatement({
  company,
  view,
  contractId,
}: PrintedStatementProps) {
  const period = periodOf(view.statement.period.month);
  const title = `Bảng kê tiền thuê vật tư · Kỳ ${formatMonth(period.month)}`;
  return (
    <div className="relative mx-auto flex w-full max-w-[1000px] flex-col gap-5 bg-card p-6 print:p-0">
      <div className="flex justify-between gap-3 print:hidden">
        <Link
          href={`/receivables/billing?month=${period.month}&contract=${contractId}`}
          className="text-sm text-primary hover:underline"
        >
          Về tính tiền thuê
        </Link>
        <PrintButton title={`${title} ${view.contract.code}`} />
      </div>
      {view.closed ? null : (
        <p
          aria-label="Tạm tính, chưa chốt"
          className="pointer-events-none absolute inset-x-0 top-1/3 -rotate-12 text-center font-display text-[56px] font-bold text-muted-foreground/30 select-none"
        >
          TẠM TÍNH – CHƯA CHỐT
        </p>
      )}
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
          {company.phone ? <p>Hotline: {company.phone}</p> : null}
        </div>
      </header>
      <h1 className="text-center text-h1 uppercase">{title}</h1>
      <section className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <p>
          <strong>Hợp đồng:</strong> {view.contract.code}
        </p>
        <p>
          <strong>Kỳ:</strong> {formatBusinessDate(period.from)} –{" "}
          {formatBusinessDate(period.to)}
        </p>
        <p>
          <strong>Nhà thầu:</strong> {view.contract.customerName}
          {view.contract.customerTaxCode
            ? ` · MST ${view.contract.customerTaxCode}`
            : ""}
        </p>
        <p>
          <strong>Công trình:</strong> {view.contract.siteName}
        </p>
        {view.contract.customerAddress ? (
          <p className="sm:col-span-2">
            <strong>Địa chỉ:</strong> {view.contract.customerAddress}
          </p>
        ) : null}
        <p className="sm:col-span-2">
          <strong>Ngày nghỉ không tính thuê:</strong>{" "}
          {view.holidays.length === 0
            ? "Không có"
            : view.holidays
                .map((holiday) => `${holiday.name} (${holiday.days} ngày)`)
                .join("; ")}
        </p>
        <p>
          <strong>VAT:</strong>{" "}
          {view.vatBasisPoints === null
            ? "Không lấy hóa đơn"
            : vatText(view.vatBasisPoints)}
        </p>
        <p>
          <strong>Hạn trả:</strong> {formatBusinessDate(view.statement.dueDate)}
        </p>
      </section>
      <StatementTable statement={view.statement} dense />
      <section className="flex flex-col gap-2">
        <h2 className="text-label">Cước vận chuyển trong kỳ</h2>
        <FreightTable statement={view.statement} />
      </section>
      <AmountDue statement={view.statement} />
      <section className="grid grid-cols-2 gap-6 pt-6 text-center text-sm">
        {SIGNERS.map((signer) => (
          <div key={signer} className="flex flex-col gap-16">
            <p className="font-medium">{signer}</p>
            <p className="text-muted-foreground">(Ký, ghi rõ họ tên)</p>
          </div>
        ))}
      </section>
    </div>
  );
}

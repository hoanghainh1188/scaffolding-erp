import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { PrintButton } from "@/components/contracts/print-button";
import { moneyText } from "@/components/deliveries/format";
import { NoteLines } from "@/components/deliveries/note-lines";
import { getDatabase } from "@/db/client";
import { formatBusinessDate } from "@/domain/business-date";
import { requirePermission } from "@/lib/auth/guard";
import { getCompanyProfile } from "@/lib/company/service";
import { deliveryDetail } from "@/lib/deliveries/queries";

export const metadata: Metadata = { title: "In phiếu xuất" };

const SIGNERS = ["Người lập phiếu", "Thủ kho", "Lái xe", "Người nhận hàng"];

/**
 * The delivery note (posted) or the picking list (not posted yet), headed
 * with the company profile of Cài đặt, never written in code (design D8).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await requirePermission("sales.view");
  const { code } = await params;
  await connection();
  const db = getDatabase();
  const found = await deliveryDetail(db, user, decodeURIComponent(code));
  if (!found.ok) {
    if (found.status === 403) forbidden();
    notFound();
  }
  const note = found.data;
  const back = (
    <Link
      href={`/sales/deliveries/${note.code}`}
      className="text-sm text-primary hover:underline"
    >
      Về phiếu
    </Link>
  );
  if (note.status === "CANCELLED") {
    return (
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 bg-card p-6">
        {back}
        <p role="status">Phiếu đã hủy nên không in được.</p>
      </div>
    );
  }
  const company = await getCompanyProfile(db);
  const posted = note.status === "POSTED";
  const sale = note.contract.type === "SALE";
  const title = posted
    ? `${sale ? "Phiếu giao hàng" : "Phiếu xuất kho"} ${note.code}`
    : `Phiếu nhặt hàng ${note.code}`;

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 bg-card p-6 print:p-0">
      <div className="flex justify-between gap-3 print:hidden">
        {back}
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
        </div>
      </header>
      <h1 className="text-center text-h1">{title}</h1>
      <section className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <p>
          <strong>Hợp đồng:</strong> {note.contract.code} · Đợt {note.batchNo}
        </p>
        <p>
          <strong>Nhà thầu:</strong> {note.contract.customerName}
        </p>
        <p className="sm:col-span-2">
          <strong>Công trình:</strong>{" "}
          {note.contract.siteName
            ? `${note.contract.siteName}${note.contract.siteAddress ? `, ${note.contract.siteAddress}` : ""}`
            : "Nhận hàng tại bãi"}
        </p>
        <p>
          <strong>{posted ? "Ngày giao" : "Ngày dự kiến"}:</strong>{" "}
          {posted && note.businessDate
            ? formatBusinessDate(note.businessDate)
            : note.plannedDate
              ? formatBusinessDate(note.plannedDate)
              : "…"}
        </p>
        <p>
          <strong>Bãi xuất:</strong> {note.source.code} · {note.source.name}
        </p>
        <p>
          <strong>Biển số xe:</strong> {note.vehiclePlate ?? "…"}
        </p>
      </section>
      <NoteLines
        lines={note.lines}
        posted={posted}
        prices={posted && sale}
        blankPicks={!posted}
      />
      {posted && note.companyTruck && note.freightAmount !== null ? (
        <p className="text-right text-sm">
          Cước vận chuyển chiều đi:{" "}
          <strong className="tabular-nums">
            {moneyText(note.freightAmount)}
          </strong>
        </p>
      ) : null}
      {posted ? (
        <section className="grid grid-cols-2 gap-6 pt-6 text-center text-sm sm:grid-cols-4">
          {SIGNERS.map((signer) => (
            <div key={signer} className="flex flex-col gap-16">
              <p className="font-semibold">{signer}</p>
              <p className="text-muted-foreground">(Ký, ghi rõ họ tên)</p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

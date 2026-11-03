import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { CompensationStatusBadge } from "@/components/compensations/compensation-badge";
import { CompensationView } from "@/components/compensations/compensation-view";
import { moneyText } from "@/components/deliveries/format";
import { PhotoGallery } from "@/components/returns/photo-gallery";
import { getDatabase } from "@/db/client";
import { formatBusinessDate, formatDateTime } from "@/domain/business-date";
import { requirePermission } from "@/lib/auth/guard";
import { compensationDetail } from "@/lib/compensations/queries";

export const metadata: Metadata = { title: "Phiếu đền bù" };

/** D8 (compensations spec "Màn D8 Phiếu đền bù"). */
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await requirePermission("sales.view");
  const { code } = await params;
  await connection();
  const found = await compensationDetail(
    getDatabase(),
    user,
    decodeURIComponent(code),
  );
  if (!found.ok) {
    if (found.status === 403) forbidden();
    notFound();
  }
  const note = found.data;
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link
          href={`/sales/contracts/${note.contract.id}`}
          className="hover:underline"
        >
          Hợp đồng {note.contract.code}
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Phiếu đền bù {note.code}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h1">Phiếu đền bù {note.code}</h1>
        <CompensationStatusBadge status={note.status} />
      </div>

      <section
        aria-labelledby="compensation-source"
        className="flex flex-col gap-3 rounded-lg border bg-card p-5"
      >
        <h2 id="compensation-source" className="text-h2">
          Nguồn
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Nhà thầu</dt>
            <dd>{note.customerName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Công trình</dt>
            <dd>{note.siteName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Phiếu thu hồi</dt>
            <dd>
              <Link
                href={`/sales/returns/${note.returnNote.code}`}
                className="text-primary hover:underline"
              >
                {note.returnNote.code}
              </Link>{" "}
              · {formatBusinessDate(note.returnNote.businessDate)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Thủ kho đếm</dt>
            <dd data-mask>
              {note.returnNote.postedByName}
              {note.returnNote.vehiclePlate
                ? ` · xe ${note.returnNote.vehiclePlate}`
                : ""}
            </dd>
          </div>
        </dl>
      </section>

      <CompensationView
        id={note.id}
        status={note.status}
        updatedAt={note.updatedAt}
        createdAtText={formatDateTime(note.createdAt)}
        contractCode={note.contract.code}
        returnCode={note.returnNote.code}
        returnDate={note.returnNote.businessDate}
        lines={note.lines}
        discountAmount={note.discountAmount}
        discountReason={note.discountReason}
        approvalReason={note.approvalReason}
        rejectedReason={note.rejectedReason}
        amountDue={note.amountDue}
        approvedByName={note.approvedByName}
        approvedDate={note.approvedDate}
        dueDate={note.dueDate}
        paymentTermsDays={note.paymentTermsDays}
        overdue={note.overdue}
        canApprove={note.canApprove}
      />

      <section
        aria-labelledby="compensation-photos"
        className="flex flex-col gap-3 rounded-lg border bg-card p-5"
      >
        <h2 id="compensation-photos" className="text-h2">
          Ảnh hiện trạng{" "}
          <span className="text-caption text-muted-foreground">
            · {note.returnNote.photos.length} ảnh · chụp khi xe hạ tải
          </span>
        </h2>
        <PhotoGallery photos={note.returnNote.photos} />
      </section>

      {note.overdue.amount > 0 && note.status === "PENDING" ? (
        <p role="status" className="text-sm text-warning">
          Nhà thầu đang nợ quá hạn {moneyText(note.overdue.amount)} (
          {note.overdue.days} ngày).
        </p>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { PhotoGallery } from "@/components/returns/photo-gallery";
import { ReturnLines } from "@/components/returns/return-lines";
import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { getDatabase } from "@/db/client";
import { formatBusinessDate, formatDateTime } from "@/domain/business-date";
import { requirePermission } from "@/lib/auth/guard";
import { returnDetail } from "@/lib/returns/queries";

export const metadata: Metadata = { title: "Phiếu thu hồi" };

const NOTE_CODE = /^PTH-\d{4}-\d{3,}$/;

/** A posted return note on the phone, read only, without money. */
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await requirePermission("returns.receive");
  const { code } = await params;
  await connection();
  if (!NOTE_CODE.test(code)) notFound();
  const found = await returnDetail(getDatabase(), user, code, {
    withValues: false,
  });
  if (!found.ok) {
    if (found.status === 403) forbidden();
    notFound();
  }
  const note = found.data;
  return (
    <MobilePage title={`Thu hồi ${note.code}`} backHref="/m/history">
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-1 rounded-lg border bg-card p-4">
          <span className="text-label">{note.siteName}</span>
          <span className="text-body text-muted-foreground">
            {note.customerName} · {note.contract.code}
          </span>
          <span className="text-body text-muted-foreground" data-mask>
            Ngày trả {formatBusinessDate(note.businessDate)} ·{" "}
            {note.postedByName} lưu lúc {formatDateTime(note.postedAt)}
            {note.vehiclePlate ? ` · xe ${note.vehiclePlate}` : ""}
          </span>
        </section>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <ReturnLines lines={note.lines} />
        </div>
        <section className="flex flex-col gap-2">
          <h2 className="text-h3">Ảnh hiện trạng</h2>
          <PhotoGallery photos={note.photos} />
        </section>
        {note.note ? <p className="text-body">Ghi chú: {note.note}</p> : null}
      </div>
    </MobilePage>
  );
}

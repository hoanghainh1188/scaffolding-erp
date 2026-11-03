import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { CompensationStatusBadge } from "@/components/compensations/compensation-badge";
import { moneyText } from "@/components/deliveries/format";
import { PhotoGallery } from "@/components/returns/photo-gallery";
import { ReturnLines } from "@/components/returns/return-lines";
import { getDatabase } from "@/db/client";
import {
  formatBusinessDate,
  formatDateTime,
  toBusinessDate,
} from "@/domain/business-date";
import { requirePermission } from "@/lib/auth/guard";
import { returnDetail } from "@/lib/returns/queries";

export const metadata: Metadata = { title: "Phiếu thu hồi" };

/** A return note for the office, read only (returns spec). */
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await requirePermission("sales.view");
  const { code } = await params;
  await connection();
  const found = await returnDetail(
    getDatabase(),
    user,
    decodeURIComponent(code),
    { withValues: true },
  );
  if (!found.ok) {
    if (found.status === 403) forbidden();
    notFound();
  }
  const note = found.data;
  const phoneDay = note.savedOnDeviceAt
    ? toBusinessDate(note.savedOnDeviceAt)
    : null;
  return (
    <div className="flex w-full max-w-[1100px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link
          href={`/sales/contracts/${note.contract.id}/deliveries`}
          className="hover:underline"
        >
          {note.contract.code}
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">{note.code}</span>
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Phiếu thu hồi {note.code}</h1>
        <p className="text-sm text-muted-foreground">
          {note.siteName} · {note.customerName}
        </p>
      </div>
      {phoneDay && phoneDay !== note.businessDate && note.savedOnDeviceAt ? (
        <p
          role="status"
          className="rounded-lg border border-warning bg-card px-4 py-3 text-sm"
        >
          Lưu trên máy {formatDateTime(note.savedOnDeviceAt)}, ghi sổ ngày{" "}
          {formatBusinessDate(note.businessDate)}.
        </p>
      ) : null}

      <section
        aria-labelledby="return-info"
        className="flex flex-col gap-3 rounded-lg border bg-card p-5"
      >
        <h2 id="return-info" className="text-h2">
          Thông tin phiếu
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Ngày trả</dt>
            <dd>{formatBusinessDate(note.businessDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Bãi nhận</dt>
            <dd>
              {note.yard.code} · {note.yard.name}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Thủ kho đếm</dt>
            <dd data-mask>
              {note.postedByName} · {formatDateTime(note.postedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Biển số xe</dt>
            <dd>{note.vehiclePlate ?? "Chưa có"}</dd>
          </div>
          {note.values ? (
            <>
              <div>
                <dt className="text-muted-foreground">
                  Giá trị giảm do đổi tình trạng
                </dt>
                <dd className="tabular-nums">
                  {moneyText(note.values.conditionLoss)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Giá trị hàng mất</dt>
                <dd className="tabular-nums">
                  {moneyText(note.values.lostValue)}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
        {note.note ? <p className="text-sm">Ghi chú: {note.note}</p> : null}
        {note.compensation ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={`/sales/compensations/${note.compensation.code}`}
              className="font-medium text-primary hover:underline"
            >
              {note.compensation.code}
            </Link>
            <CompensationStatusBadge status={note.compensation.status} />
            <span className="tabular-nums">
              {moneyText(note.compensation.amount)}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Không có hàng hỏng hay mất, không có phiếu đền bù.
          </p>
        )}
      </section>

      <section
        aria-labelledby="return-lines"
        className="flex flex-col gap-3 rounded-lg border bg-card p-5"
      >
        <h2 id="return-lines" className="text-h2">
          Hàng trả về
        </h2>
        <ReturnLines lines={note.lines} />
      </section>

      <section
        aria-labelledby="return-photos"
        className="flex flex-col gap-3 rounded-lg border bg-card p-5"
      >
        <h2 id="return-photos" className="text-h2">
          Ảnh hiện trạng
        </h2>
        <PhotoGallery photos={note.photos} />
      </section>
    </div>
  );
}

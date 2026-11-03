import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { DeliveryStatusBadge } from "@/components/deliveries/delivery-badges";
import { moneyText } from "@/components/deliveries/format";
import { BatchDialog } from "@/components/deliveries/new-batch";
import { NoteActions } from "@/components/deliveries/note-actions";
import { NoteLines } from "@/components/deliveries/note-lines";
import { getDatabase } from "@/db/client";
import {
  formatBusinessDate,
  formatDateTime,
  toBusinessDate,
} from "@/domain/business-date";
import { lineKey } from "@/domain/delivery-note";
import { formatQuantityForInput, toQuantity } from "@/domain/quantity";
import { requirePermission } from "@/lib/auth/guard";
import { contractDeliveries, deliveryDetail } from "@/lib/deliveries/queries";

export const metadata: Metadata = { title: "Phiếu xuất" };

type Note = Extract<
  Awaited<ReturnType<typeof deliveryDetail>>,
  { ok: true }
>["data"];
type Kits = Extract<
  Awaited<ReturnType<typeof contractDeliveries>>,
  { ok: true }
>["data"]["kits"];

/** What was added outside kits: each line minus the kit parts (design D4). */
function looseLines(note: Note, kits: Kits) {
  const fromKits = new Map<string, number>();
  for (const pick of note.kits) {
    const kit = kits.find((entry) => entry.id === pick.kitId);
    for (const part of kit?.components ?? []) {
      fromKits.set(
        part.itemId,
        (fromKits.get(part.itemId) ?? 0) + part.quantity * pick.quantity * 1000,
      );
    }
  }
  return note.lines.flatMap((line) => {
    const own = line.requestedMilli - (fromKits.get(line.itemId) ?? 0);
    return own > 0
      ? [
          {
            lineKey: lineKey(line.itemId, line.condition, line.pricingUnit),
            quantity: formatQuantityForInput(toQuantity(own, line.lineUnit)),
          },
        ]
      : [];
  });
}

/** A delivery note for the office: lines, picks, prices, actions. */
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
  const editable = note.canManage && note.status === "PLANNED";
  const d6 = editable
    ? await contractDeliveries(
        db,
        user,
        note.contract.id,
        toBusinessDate(new Date()),
      )
    : null;
  const sale = note.contract.type === "SALE";

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">
            {note.code} · Đợt {note.batchNo}
          </h1>
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {note.contract.siteName ??
              `${note.contract.customerName} · nhận hàng tại bãi`}
            <DeliveryStatusBadge status={note.status} />
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {editable && d6?.ok ? (
            <BatchDialog
              label="Sửa đợt xuất"
              title={`Sửa ${note.code}`}
              contractId={note.contract.id}
              type={note.contract.type}
              items={d6.data.items}
              kits={d6.data.kits}
              yards={d6.data.yards}
              plan={d6.data.plan}
              unplanned={Object.fromEntries(
                d6.data.remaining.map((row) => {
                  const own = note.lines
                    .filter(
                      (line) =>
                        lineKey(
                          line.itemId,
                          line.condition,
                          line.pricingUnit,
                        ) === row.key,
                    )
                    .reduce((sum, line) => sum + line.requestedMilli, 0);
                  return [row.key, row.unplannedMilli + own];
                }),
              )}
              defaults={
                d6.data.terms ?? { companyTruck: false, freightPerTrip: null }
              }
              initial={{
                noteId: note.id,
                updatedAt: note.updatedAt,
                kits: note.kits.map((kit) => ({
                  kitId: kit.kitId,
                  quantity: kit.quantity,
                })),
                lines: looseLines(note, d6.data.kits),
                sourceLocationId: note.source.id,
                plannedDate: note.plannedDate ?? "",
                companyTruck: note.companyTruck,
                freightAmount: note.freightAmount,
                vehiclePlate: note.vehiclePlate ?? "",
                note: note.note ?? "",
              }}
            />
          ) : null}
          <NoteActions
            id={note.id}
            code={note.code}
            status={note.status}
            canManage={note.canManage}
          />
        </div>
      </div>
      {note.status === "PLANNED" && note.returnedReason ? (
        <p
          role="status"
          className="rounded-lg border border-warning bg-card px-4 py-3 text-sm"
        >
          <strong>Trả lại:</strong> {note.returnedReason}
        </p>
      ) : null}
      {note.phoneDifferentDay && note.departedAt ? (
        <p
          role="status"
          className="rounded-lg border border-warning bg-card px-4 py-3 text-sm"
        >
          Xác nhận trên máy lúc {formatDateTime(note.departedAt)}, ghi sổ ngày{" "}
          {note.businessDate ? formatBusinessDate(note.businessDate) : ""}.
        </p>
      ) : null}

      <section
        aria-labelledby="note-info"
        className="flex flex-col gap-3 rounded-lg border bg-card p-5"
      >
        <h2 id="note-info" className="text-h2">
          Thông tin đợt
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Hàng</dt>
            <dd>{note.requested}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Bãi xuất</dt>
            <dd>
              {note.source.code} · {note.source.name}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {note.businessDate ? "Ngày giao" : "Ngày dự kiến"}
            </dt>
            <dd>
              {note.businessDate
                ? formatBusinessDate(note.businessDate)
                : note.plannedDate
                  ? formatBusinessDate(note.plannedDate)
                  : "Chưa hẹn"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vận chuyển</dt>
            <dd>
              {note.companyTruck
                ? `Công ty gọi xe · cước ${moneyText(note.freightAmount)}`
                : "Khách tự chở"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Biển số xe</dt>
            <dd>{note.vehiclePlate ?? "Chưa có"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Thủ kho</dt>
            <dd>
              {note.postedByName
                ? `${note.postedByName} xác nhận${note.postedAt ? ` lúc ${formatDateTime(note.postedAt)}` : ""}`
                : (note.pickingByName ?? "Chưa nhặt")}
            </dd>
          </div>
        </dl>
        {note.overContractConfirmed ? (
          <p className="text-sm text-warning">
            Người lập đã xác nhận xuất vượt số trên hợp đồng.
          </p>
        ) : null}
        {note.note ? <p className="text-sm">Ghi chú: {note.note}</p> : null}
      </section>

      <section
        aria-labelledby="note-lines"
        className="flex flex-col gap-3 rounded-lg border bg-card p-5"
      >
        <h2 id="note-lines" className="text-h2">
          Hàng của đợt
        </h2>
        <NoteLines
          lines={note.lines}
          posted={note.status === "POSTED"}
          prices={sale && note.status === "POSTED"}
        />
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { RepairForm } from "@/components/repairs/repair-form";
import { RepairView } from "@/components/repairs/repair-view";
import { WorkOrderActions } from "@/components/repairs/work-order-actions";
import { WorkOrderForm } from "@/components/repairs/work-order-form";
import { WorkOrderView } from "@/components/repairs/work-order-view";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import {
  awaitingRepair,
  getRepairOrder,
  repairKindOf,
  repairPlaces,
} from "@/lib/repairs/queries";
import { REPAIR_CODE } from "@/lib/repairs/respond";
import { getWorkOrder } from "@/lib/repairs/work-queries";

type Params = Promise<{ code: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { code } = await params;
  const kind = REPAIR_CODE.test(code)
    ? await repairKindOf(getDatabase(), code)
    : null;
  return {
    title: `${kind === "WORK_ORDER" ? "Lệnh sửa chữa" : "Phiếu sửa chữa"} ${code}`,
  };
}

/** D12: a draft to edit, or a slip to read (posted, or view-only role). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const user = await requirePermission("repairs.view");
  const { code } = await params;
  if (!REPAIR_CODE.test(code)) notFound();
  const db = getDatabase();
  if ((await repairKindOf(db, code)) === "WORK_ORDER") {
    return (
      <WorkOrderPage
        code={code}
        manage={can(user.role, "repairs.manage")}
        saved={(await searchParams).saved === "draft"}
      />
    );
  }
  const slip = await getRepairOrder(db, code);
  if (!slip) notFound();
  const saved = (await searchParams).saved === "draft";
  const editable = slip.status === "DRAFT" && can(user.role, "repairs.manage");
  const awaiting =
    slip.status === "DRAFT"
      ? await awaitingRepair(
          db,
          slip.fromLocationId,
          slip.lines.map((line) => line.itemId),
        )
      : null;
  const places = editable ? await repairPlaces(db) : [];
  await connection();

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/repairs" className="hover:underline">
          Sửa chữa
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">{slip.code}</span>
      </nav>
      {saved ? (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          Đã lưu nháp {slip.code}.
        </p>
      ) : null}
      {editable && awaiting ? (
        <RepairForm
          places={places}
          today={toBusinessDate(new Date())}
          defaultLocationId={slip.fromLocationId}
          awaiting={awaiting}
          slip={{
            code: slip.code,
            updatedAt: slip.updatedAt.toISOString(),
            repairDate: slip.repairDate,
            repairedBy: slip.repairedBy,
            note: slip.note,
            fromLocationId: slip.fromLocationId,
            toLocationId: slip.toLocationId,
            lines: slip.lines,
          }}
        />
      ) : (
        <RepairView slip={slip} awaiting={awaiting} />
      )}
    </div>
  );
}

/** D12 of a work order: the draft form, or the order with its buttons. */
async function WorkOrderPage({
  code,
  manage,
  saved,
}: {
  code: string;
  manage: boolean;
  saved: boolean;
}) {
  const db = getDatabase();
  const detail = await getWorkOrder(db, code);
  if (!detail) notFound();
  await connection();
  const draft = detail.status === "DRAFT" && manage;
  const [places, awaiting] = draft
    ? await Promise.all([
        repairPlaces(db),
        awaitingRepair(
          db,
          detail.from.id,
          detail.lines.map((line) => line.itemId),
        ),
      ])
    : [[], null];
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/repairs" className="hover:underline">
          Sửa chữa
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">{detail.code}</span>
      </nav>
      {saved ? (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          Đã lưu nháp {detail.code}.
        </p>
      ) : null}
      {draft && awaiting ? (
        <WorkOrderForm
          places={places}
          awaiting={awaiting.items}
          draft={{
            code: detail.code,
            updatedAt: detail.updatedAt.toISOString(),
            workshopId: detail.workshop.id,
            fromLocationId: detail.from.id,
            repairedBy: detail.repairedBy,
            note: detail.note,
            lines: detail.lines.map((line) => ({
              itemId: line.itemId,
              takenMilli: line.takenMilli,
            })),
          }}
        />
      ) : (
        <WorkOrderView
          detail={detail}
          actions={
            manage ? (
              <WorkOrderActions
                code={detail.code}
                status={detail.status}
                updatedAt={detail.updatedAt.toISOString()}
                lineCodes={detail.lines.map((line) => line.code)}
              />
            ) : undefined
          }
        />
      )}
    </div>
  );
}

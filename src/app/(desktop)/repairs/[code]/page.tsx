import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { RepairForm } from "@/components/repairs/repair-form";
import { RepairView } from "@/components/repairs/repair-view";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import {
  awaitingRepair,
  getRepairOrder,
  repairPlaces,
} from "@/lib/repairs/queries";
import { REPAIR_CODE } from "@/lib/repairs/respond";

type Params = Promise<{ code: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  return { title: `Phiếu sửa chữa ${(await params).code}` };
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

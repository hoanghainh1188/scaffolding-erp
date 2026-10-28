import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { RepairForm } from "@/components/repairs/repair-form";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { requirePermission } from "@/lib/auth/guard";
import { defaultRepairLocation } from "@/lib/repairs/orders";
import { awaitingRepair, repairPlaces } from "@/lib/repairs/queries";

export const metadata: Metadata = { title: "Phiếu sửa chữa mới" };

/** D12: a new repair slip. */
export default async function Page() {
  await requirePermission("repairs.manage");
  const db = getDatabase();
  const [places, yard] = await Promise.all([
    repairPlaces(db),
    defaultRepairLocation(db),
  ]);
  const start = yard?.id ?? places[0]?.id ?? "";
  const awaiting = start
    ? await awaitingRepair(db, start)
    : { items: [], scrapPricePerKg: null };
  await connection();
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/repairs" className="hover:underline">
          Sửa chữa
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Phiếu mới</span>
      </nav>
      <RepairForm
        places={places}
        today={toBusinessDate(new Date())}
        defaultLocationId={start}
        awaiting={awaiting}
      />
    </div>
  );
}

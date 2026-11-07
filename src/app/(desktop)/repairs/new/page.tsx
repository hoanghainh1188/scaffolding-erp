import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { WorkOrderForm } from "@/components/repairs/work-order-form";
import { getDatabase } from "@/db/client";
import { requirePermission } from "@/lib/auth/guard";
import { awaitingRepair, repairPlaces } from "@/lib/repairs/queries";

export const metadata: Metadata = { title: "Lệnh sửa chữa mới" };

/** D12: a new repair is a work order (0.2 số 121). */
export default async function Page() {
  await requirePermission("repairs.manage");
  const db = getDatabase();
  const places = await repairPlaces(db);
  const yard = places.find((place) => place.type === "YARD");
  const awaiting = yard
    ? await awaitingRepair(db, yard.id)
    : { items: [], scrapPricePerKg: null };
  await connection();
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/repairs" className="hover:underline">
          Sửa chữa
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Lệnh mới</span>
      </nav>
      <WorkOrderForm places={places} awaiting={awaiting.items} />
    </div>
  );
}

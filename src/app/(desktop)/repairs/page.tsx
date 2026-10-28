import type { Metadata } from "next";

import { RepairList } from "@/components/repairs/repair-list";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { listRepairOrders } from "@/lib/repairs/queries";
import { repairStatusFrom } from "@/lib/repairs/respond";

export const metadata: Metadata = { title: "Sửa chữa" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Repair slips, newest first (spec "Danh sách phiếu sửa chữa"). */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("repairs.view");
  const params = await searchParams;
  const status = repairStatusFrom(
    typeof params.status === "string" ? params.status : undefined,
  );
  const rows = await listRepairOrders(getDatabase(), { status });
  return (
    <RepairList
      rows={rows}
      status={status}
      canManage={can(user.role, "repairs.manage")}
    />
  );
}

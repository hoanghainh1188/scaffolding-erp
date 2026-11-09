import type { Metadata } from "next";

import { ProductionList } from "@/components/production/production-list";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { listProductionOrders } from "@/lib/production/queries";
import { productionStatusFrom } from "@/lib/production/respond";

export const metadata: Metadata = { title: "Sản xuất" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Production orders, newest first (spec "Xem lệnh trên D20 và danh sách"). */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("production.view");
  const params = await searchParams;
  const status = productionStatusFrom(
    typeof params.status === "string" ? params.status : undefined,
  );
  const rows = await listProductionOrders(getDatabase(), { status });
  return (
    <ProductionList
      rows={rows}
      status={status}
      canManage={can(user.role, "production.manage")}
    />
  );
}

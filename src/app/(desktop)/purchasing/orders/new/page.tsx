import type { Metadata } from "next";
import Link from "next/link";

import { OrderForm } from "@/components/purchasing/order-form";
import { DocumentStatusBadge } from "@/components/domain/document-status-badge";
import { getDatabase } from "@/db/client";
import { requirePermission } from "@/lib/auth/guard";
import { orderFormOptions } from "@/lib/purchasing/queries";

export const metadata: Metadata = { title: "Tạo đơn thu mua" };

/** D3: a new purchase order (spec purchase-orders "Form đơn thu mua D3"). */
export default async function Page() {
  await requirePermission("purchasing.manage");
  const options = await orderFormOptions(getDatabase());
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/purchasing" className="hover:underline">
          Đơn thu mua
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Tạo mới</span>
      </nav>
      <div className="flex items-center gap-3">
        <h1 className="text-h1">Đơn thu mua mới</h1>
        <DocumentStatusBadge status="DRAFT" />
      </div>
      <OrderForm suppliers={options.suppliers} items={options.items} />
    </div>
  );
}

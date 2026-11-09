import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { ProductionForm } from "@/components/production/production-form";
import { getDatabase } from "@/db/client";
import { requirePermission } from "@/lib/auth/guard";
import {
  bomNorms,
  orderItemChoices,
  productionPlaces,
} from "@/lib/production/queries";

export const metadata: Metadata = { title: "Lệnh sản xuất mới" };

export default async function Page() {
  await requirePermission("production.manage");
  await connection();
  const db = getDatabase();
  const [places, items] = await Promise.all([
    productionPlaces(db),
    orderItemChoices(db),
  ]);
  const norms = await bomNorms(
    db,
    items.map((item) => item.itemId),
  );
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/production" className="hover:underline">
          Sản xuất
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Lệnh mới</span>
      </nav>
      <ProductionForm places={places} items={items} norms={norms} />
    </div>
  );
}

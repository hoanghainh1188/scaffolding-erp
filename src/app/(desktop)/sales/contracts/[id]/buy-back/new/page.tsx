import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { BuyBackForm } from "@/components/site-operations/buy-back-form";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { canContract } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { buyBackForm } from "@/lib/buy-backs/queries";

export const metadata: Metadata = { title: "Khách mua lại" };

/** D6c for a new buy-back of this contract's goods (0.2 #67). */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("sales.view");
  if (!canContract(user, "RENTAL", "manage")) forbidden();
  const { id } = await params;
  await connection();
  const data = await buyBackForm(getDatabase(), id, toBusinessDate(new Date()));
  if (!data) notFound();
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/sales/contracts" className="hover:underline">
          Hợp đồng
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link
          href={`/sales/contracts/${id}/deliveries`}
          className="hover:underline"
        >
          {data.contract.code}
        </Link>{" "}
        <span aria-hidden>/</span> Khách mua lại
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Phiếu mua lại</h1>
        <p className="text-sm text-muted-foreground">
          Khách mua luôn hàng đang thuê ở công trình. Hàng thành hàng bán, ra
          khỏi sổ ở công trình.
        </p>
      </div>
      <BuyBackForm data={data} />
    </div>
  );
}

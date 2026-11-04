import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { ExchangeForm } from "@/components/site-operations/exchange-form";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { canContract } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { exchangeForm } from "@/lib/exchanges/queries";

export const metadata: Metadata = { title: "Đổi hàng tại công trình" };

/** D6d (0.2 #68): one batch out and the old items expected back. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("sales.view");
  if (!canContract(user, "RENTAL", "manage")) forbidden();
  const { id } = await params;
  await connection();
  const data = await exchangeForm(
    getDatabase(),
    id,
    toBusinessDate(new Date()),
  );
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
        <span aria-hidden>/</span> Đổi hàng
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Đổi hàng tại công trình</h1>
        <p className="text-sm text-muted-foreground">
          Một chuyến xe: chở hàng mới ra, nhận hàng cũ về. Tạo một đợt xuất và
          một phiếu thu hồi nối với nhau.
        </p>
      </div>
      <ExchangeForm data={data} />
    </div>
  );
}

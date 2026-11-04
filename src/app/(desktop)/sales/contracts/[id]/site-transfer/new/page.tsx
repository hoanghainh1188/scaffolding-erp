import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { TransferForm } from "@/components/site-operations/transfer-form";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { canContract } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { transferForm } from "@/lib/site-transfers/queries";

export const metadata: Metadata = { title: "Chuyển công trình" };

/** D6b: a new transfer from this contract's site (0.2 #66). */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("sales.view");
  if (!canContract(user, "RENTAL", "manage")) forbidden();
  const { id } = await params;
  await connection();
  const today = toBusinessDate(new Date());
  const data = await transferForm(getDatabase(), user, id, today);
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
          {data.from.code}
        </Link>{" "}
        <span aria-hidden>/</span> Chuyển công trình
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Chuyển sang công trình khác</h1>
        <p className="text-sm text-muted-foreground">
          Hàng đi thẳng từ công trình này sang công trình khác, không về bãi.
        </p>
      </div>
      <TransferForm data={data} today={today} />
    </div>
  );
}

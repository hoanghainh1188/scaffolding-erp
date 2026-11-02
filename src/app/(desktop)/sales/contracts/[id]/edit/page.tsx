import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { ContractForm } from "@/components/contracts/contract-form";
import { ToneBadge } from "@/components/domain/tone-badge";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { canContract } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { formOptions, getContractDetail } from "@/lib/contracts/queries";

export const metadata: Metadata = { title: "Soạn hợp đồng" };

/** D5a on a saved draft. Sent or approved contracts open D5 instead. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("sales.view");
  const { id } = await params;
  await connection();
  const today = toBusinessDate(new Date());
  const db = getDatabase();
  const found = await getContractDetail(db, user, id, today);
  if (!found.ok) {
    if (found.status === 403) forbidden();
    notFound();
  }
  const detail = found.data;
  if (!canContract(user, detail.head.type, "manage")) forbidden();
  if (detail.head.status !== "DRAFT") redirect(`/sales/contracts/${id}`);
  const options = await formOptions(db, user);
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/sales/contracts" className="hover:underline">
          Hợp đồng
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link href={`/sales/contracts/${id}`} className="hover:underline">
          {detail.head.code}
        </Link>
      </nav>
      <div className="flex items-center gap-3">
        <h1 className="text-h1">Soạn hợp đồng</h1>
        <ToneBadge tone="muted">Nháp · báo giá</ToneBadge>
      </div>
      <ContractForm
        options={options}
        today={today}
        checks={detail.checks.lines}
        draft={{
          id,
          code: detail.head.code,
          type: detail.head.type,
          customerId: detail.head.customer.id,
          siteId: detail.head.site?.id ?? null,
          updatedAt: detail.head.updatedAt,
          view: detail.shown,
          returnedReason: detail.shown.returnedReason,
        }}
      />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { connection } from "next/server";

import { ContractForm } from "@/components/contracts/contract-form";
import { ToneBadge } from "@/components/domain/tone-badge";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { requirePermission } from "@/lib/auth/guard";
import { formOptions } from "@/lib/contracts/queries";

export const metadata: Metadata = { title: "Soạn hợp đồng" };

/** D5a: a new contract or quote (contracts spec). */
export default async function Page() {
  const user = await requirePermission("sales.view");
  const options = await formOptions(getDatabase(), user);
  if (options.types.length === 0) forbidden();
  await connection();
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/sales/contracts" className="hover:underline">
          Hợp đồng
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Hợp đồng mới</span>
      </nav>
      <div className="flex items-center gap-3">
        <h1 className="text-h1">Soạn hợp đồng</h1>
        <ToneBadge tone="muted">Nháp · báo giá</ToneBadge>
      </div>
      <ContractForm options={options} today={toBusinessDate(new Date())} />
    </div>
  );
}

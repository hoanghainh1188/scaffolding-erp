import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { TransferActions } from "@/components/site-operations/transfer-actions";
import { TransferDetail } from "@/components/site-operations/transfer-detail";
import { TransferForm } from "@/components/site-operations/transfer-form";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { canContract } from "@/domain/permissions";
import { TRANSFER_STATUS_LABELS } from "@/domain/site-transfer";
import { requirePermission } from "@/lib/auth/guard";
import { transferForm, transferView } from "@/lib/site-transfers/queries";

export const metadata: Metadata = { title: "Phiếu chuyển công trình" };

/** D6b of a saved transfer: the form while a draft, read-only after. */
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await requirePermission("sales.view");
  if (!canContract(user, "RENTAL", "view")) forbidden();
  const { code } = await params;
  await connection();
  const db = getDatabase();
  const view = await transferView(db, decodeURIComponent(code));
  if (!view) notFound();
  const canManage = canContract(user, "RENTAL", "manage");
  const today = toBusinessDate(new Date());
  const form =
    canManage && view.status === "DRAFT"
      ? await transferForm(db, user, view.from.contractId, today)
      : null;

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/sales/contracts" className="hover:underline">
          Hợp đồng
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link
          href={`/sales/contracts/${view.from.contractId}/deliveries`}
          className="hover:underline"
        >
          {view.from.contractCode}
        </Link>{" "}
        <span aria-hidden>/</span> {view.code}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Phiếu chuyển {view.code}</h1>
          <p className="text-sm text-muted-foreground">
            {TRANSFER_STATUS_LABELS[view.status]} · {view.from.siteName} →{" "}
            {view.to.siteName}
          </p>
        </div>
        {canManage && (view.status === "DRAFT" || view.status === "SENT") ? (
          <TransferActions
            id={view.id}
            status={view.status}
            updatedAt={view.updatedAt}
          />
        ) : null}
      </div>
      {form ? (
        <TransferForm
          data={form}
          today={today}
          draft={{
            id: view.id,
            code: view.code,
            updatedAt: view.updatedAt,
            toContractId: view.to.contractId,
            counts: Object.fromEntries(
              view.lines.map((line) => [line.itemId, line.planned]),
            ),
            vehiclePlate: view.vehiclePlate ?? "",
            note: view.note ?? "",
            mode: view.confirmMode,
            otherCustomerConfirmed: view.otherCustomerConfirmed,
            overContractConfirmed: view.overContractConfirmed,
          }}
        />
      ) : (
        <TransferDetail view={view} />
      )}
    </div>
  );
}

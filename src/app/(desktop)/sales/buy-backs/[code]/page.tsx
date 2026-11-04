import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { BuyBackForm } from "@/components/site-operations/buy-back-form";
import { BuyBackView } from "@/components/site-operations/buy-back-view";
import { getDatabase } from "@/db/client";
import { formatDateTime, toBusinessDate } from "@/domain/business-date";
import { BUY_BACK_STATUS_LABELS } from "@/domain/buy-back";
import { formatQuantityForInput, toQuantity } from "@/domain/quantity";
import { can, canContract } from "@/domain/permissions";
import { dailyChange } from "@/domain/rental";
import { requirePermission } from "@/lib/auth/guard";
import { buyBackForm, buyBackView } from "@/lib/buy-backs/queries";
import { overdueDebt } from "@/lib/contracts/overdue";

export const metadata: Metadata = { title: "Phiếu mua lại" };

/** D6c of a saved note: sales edit while pending, the director decides. */
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
  const view = await buyBackView(db, decodeURIComponent(code));
  if (!view) notFound();
  const today = toBusinessDate(new Date());
  const form = await buyBackForm(db, view.contractId, today);
  const canApprove = can(user.role, "buybacks.approve");
  const editable =
    view.status === "PENDING" &&
    canContract(user, "RENTAL", "manage") &&
    !canApprove &&
    form !== null;
  const prices = new Map(
    (form?.items ?? []).map((item) => [item.itemId, item.dailyPrice]),
  );
  const drop = dailyChange(
    [],
    view.lines.map((line) => ({
      dailyPrice: prices.get(line.itemId) ?? 0,
      quantityMilli: line.milli,
    })),
  );
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/sales/contracts" className="hover:underline">
          Hợp đồng
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link
          href={`/sales/contracts/${view.contractId}/deliveries`}
          className="hover:underline"
        >
          {view.contractCode}
        </Link>{" "}
        <span aria-hidden>/</span> {view.code}
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Phiếu mua lại {view.code}</h1>
        <p className="text-sm text-muted-foreground">
          {BUY_BACK_STATUS_LABELS[view.status]} · Khách mua luôn hàng đang thuê
          ở công trình.
        </p>
      </div>
      {editable && form ? (
        <BuyBackForm
          data={form}
          draft={{
            id: view.id,
            code: view.code,
            updatedAt: view.updatedAt,
            reason: view.reason,
            counts: Object.fromEntries(
              view.lines.map((line) => [
                line.itemId,
                formatQuantityForInput(toQuantity(line.milli, line.unit)),
              ]),
            ),
            prices: Object.fromEntries(
              view.lines.map((line) => [line.itemId, String(line.unitPrice)]),
            ),
          }}
        />
      ) : (
        <BuyBackView
          view={view}
          canApprove={canApprove}
          createdAtText={formatDateTime(new Date(view.createdAt))}
          today={today}
          dailyDrop={drop}
          overdue={await overdueDebt(db, view.customerId)}
        />
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { ContractStatusBadge } from "@/components/contracts/contract-badges";
import {
  DeliveryChecks,
  DeliveryTimeline,
  OnRentCard,
  RemainingTable,
  SiteTable,
} from "@/components/deliveries/d6-view";
import { BatchDialog } from "@/components/deliveries/new-batch";
import { getDatabase } from "@/db/client";
import { formatBusinessDate, toBusinessDate } from "@/domain/business-date";
import { requirePermission } from "@/lib/auth/guard";
import { contractDeliveries } from "@/lib/deliveries/queries";

export const metadata: Metadata = { title: "Tiến độ cấp hàng" };

/** D6: one contract's goods on site, what is left and its batches. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("sales.view");
  const { id } = await params;
  await connection();
  const found = await contractDeliveries(
    getDatabase(),
    user,
    id,
    toBusinessDate(new Date()),
  );
  if (!found.ok) {
    if (found.status === 403) forbidden();
    notFound();
  }
  const view = found.data;
  const { contract } = view;
  const rental = contract.type === "RENTAL";
  const open = contract.status === "APPROVED" || contract.status === "ACTIVE";
  const title = rental
    ? (contract.siteName ?? contract.code)
    : `Giao hàng · ${contract.code}`;

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/sales/contracts" className="hover:underline">
          Hợp đồng
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link href={`/sales/contracts/${id}`} className="hover:underline">
          {contract.code}
        </Link>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{title}</h1>
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {contract.customerName}
            {contract.startDate
              ? ` · ${rental ? "thuê từ" : "giao từ"} ${formatBusinessDate(contract.startDate)}`
              : ""}
            {!rental && !contract.siteName ? " · nhận hàng tại bãi" : ""}
            <ContractStatusBadge status={contract.status} />
          </span>
        </div>
        {view.canManage && open ? (
          <BatchDialog
            label="Tạo đợt xuất"
            title="Tạo đợt xuất"
            contractId={contract.id}
            type={contract.type}
            items={view.items}
            kits={view.kits}
            yards={view.yards}
            plan={view.plan}
            unplanned={Object.fromEntries(
              view.remaining.map((row) => [row.key, row.unplannedMilli]),
            )}
            defaults={
              view.terms ?? { companyTruck: false, freightPerTrip: null }
            }
          />
        ) : null}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {rental ? (
            <section
              aria-labelledby="site-title"
              className="flex flex-col gap-3 rounded-lg border bg-card p-5"
            >
              <h2 id="site-title" className="text-h2">
                Hàng đang ở công trình
              </h2>
              <SiteTable rows={view.site} />
              <p className="text-sm text-muted-foreground">
                Chỉ tính phiếu đã xác nhận. Phiếu xuất đang nhặt hàng chưa được
                cộng.
              </p>
            </section>
          ) : null}
          <section
            aria-labelledby="remaining-title"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 id="remaining-title" className="text-h2">
              {rental ? "Còn phải giao" : "Đã giao và còn phải giao"}
            </h2>
            <RemainingTable type={contract.type} rows={view.remaining} />
          </section>
          <section
            aria-labelledby="timeline-title"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 id="timeline-title" className="text-h2">
              {rental ? "Các đợt xuất và trả" : "Các đợt giao"}
            </h2>
            <DeliveryTimeline entries={view.timeline} returns={view.returns} />
          </section>
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          {rental ? <OnRentCard rows={view.site} /> : null}
          <DeliveryChecks checks={view.checks} />
        </aside>
      </div>
    </div>
  );
}

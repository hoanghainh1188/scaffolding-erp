import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReceiptFormView } from "@/components/receiving/receipt-form";
import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { RECEIPT_MESSAGES } from "@/domain/goods-receipt";
import { PURCHASE_MESSAGES } from "@/domain/purchase-order";
import { requirePermission } from "@/lib/auth/guard";
import { orderForReceiving } from "@/lib/receiving/queries";
import { toReceivingOrder } from "@/lib/receiving/receiving-order";
import { ORDER_CODE } from "@/lib/receiving/respond";

export const metadata: Metadata = { title: "Nhập hàng từ đơn mua" };

type Params = Promise<{ orderCode: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/** M3 (spec goods-receipts "Màn nhập hàng M3"). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const user = await requirePermission("receiving.manage");
  const { orderCode } = await params;
  const { draft } = await searchParams;
  const order = ORDER_CODE.test(orderCode)
    ? await orderForReceiving(getDatabase(), orderCode)
    : null;
  if (!order) notFound();

  if (order.status !== "IN_PROGRESS") {
    return (
      <MobilePage title="Nhập hàng từ đơn mua" backHref="/m">
        <p role="alert" className="rounded-lg border bg-card p-4 text-body">
          {order.status === "DONE"
            ? RECEIPT_MESSAGES.orderDone(order.code)
            : PURCHASE_MESSAGES.notPlaced(order.code)}
        </p>
        <Button asChild className="h-12 self-start">
          <Link href="/m">Về Việc hôm nay</Link>
        </Button>
      </MobilePage>
    );
  }
  return (
    <MobilePage title="Nhập hàng từ đơn mua" backHref="/m">
      <ReceiptFormView
        order={toReceivingOrder(order)}
        userId={user.id}
        draftId={typeof draft === "string" ? draft : null}
      />
    </MobilePage>
  );
}

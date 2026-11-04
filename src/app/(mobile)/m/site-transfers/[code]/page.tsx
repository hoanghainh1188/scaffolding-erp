import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { TransferConfirmScreen } from "@/components/site-operations/transfer-confirm-screen";
import { getDatabase } from "@/db/client";
import { requirePermission } from "@/lib/auth/guard";
import { mobileTransfer } from "@/lib/site-transfers/queries";

export const metadata: Metadata = { title: "Xác nhận chuyển công trình" };

const TRANSFER_CODE = /^CCT-\d{4}-\d{3,}$/;

/** M9 (spec site-transfers). No price on this page. */
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await requirePermission("deliveries.pick");
  const { code } = await params;
  await connection();
  const transfer = TRANSFER_CODE.test(code)
    ? await mobileTransfer(getDatabase(), code)
    : null;
  if (!transfer) notFound();
  return (
    <MobilePage title="Xác nhận chuyển công trình" backHref="/m">
      <TransferConfirmScreen transfer={transfer} userId={user.id} />
    </MobilePage>
  );
}

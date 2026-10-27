import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";

import { ReceiptView } from "@/components/receiving/receipt-view";
import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requireUser } from "@/lib/auth/guard";
import { receiptByCode } from "@/lib/receiving/queries";
import { RECEIPT_CODE } from "@/lib/receiving/respond";

type Params = Promise<{ code: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { code } = await params;
  return { title: `Phiếu nhập ${code}` };
}

/** A posted receipt, read-only (spec goods-receipts "Phiếu nhập chỉ xem"). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const user = await requireUser();
  if (
    !can(user.role, "receiving.manage") &&
    !can(user.role, "purchasing.view")
  ) {
    forbidden();
  }
  const { code } = await params;
  const { posted } = await searchParams;
  const receipt = RECEIPT_CODE.test(code)
    ? await receiptByCode(getDatabase(), code)
    : null;
  if (!receipt) notFound();
  return (
    <MobilePage title="Phiếu nhập" backHref="/m/history">
      <ReceiptView receipt={receipt} posted={posted === "1"} />
    </MobilePage>
  );
}

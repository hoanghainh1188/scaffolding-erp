import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { PrintedStatement } from "@/components/billing/printed-statement";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { canContract } from "@/domain/permissions";
import { periodOf } from "@/domain/rental-billing";
import { requirePermission } from "@/lib/auth/guard";
import { contractStatement } from "@/lib/billing/queries";
import { getCompanyProfile } from "@/lib/company/service";

export const metadata: Metadata = { title: "In bảng kê tiền thuê" };

/**
 * The statement of one contract for a month (rental-billing design D9),
 * headed with the company profile of Cài đặt; an open month is stamped
 * "TẠM TÍNH – CHƯA CHỐT".
 */
export default async function Page({
  params,
}: {
  params: Promise<{ month: string; contractId: string }>;
}) {
  const user = await requirePermission("billing.view");
  if (!canContract(user, "RENTAL", "view")) forbidden();
  const { month, contractId } = await params;
  await connection();
  let period;
  try {
    period = periodOf(month);
  } catch {
    notFound();
  }
  const db = getDatabase();
  const view = await contractStatement(
    db,
    contractId,
    period.month,
    toBusinessDate(new Date()),
  );
  if (!view) notFound();
  const company = await getCompanyProfile(db);

  return (
    <PrintedStatement company={company} view={view} contractId={contractId} />
  );
}

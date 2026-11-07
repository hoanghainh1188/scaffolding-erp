import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { RepairPhoneScreen } from "@/components/repairs/phone/repair-phone-screen";
import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requireUser } from "@/lib/auth/guard";
import { phoneOrder, phoneSupplies } from "@/lib/repairs/phone-queries";
import { REPAIR_CODE } from "@/lib/repairs/respond";

export const metadata: Metadata = { title: "Sửa chữa tại xưởng" };

/** M8 (spec repair-mobile). No price on this page. */
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await requireUser();
  const work = can(user.role, "repairs.work");
  const count = can(user.role, "repairs.count");
  if (!work && !count) forbidden();
  const { code } = await params;
  await connection();
  const db = getDatabase();
  const order = REPAIR_CODE.test(code) ? await phoneOrder(db, code) : null;
  if (!order) notFound();
  // The director has both: count once the workshop reported.
  const mode =
    count && (!work || order.status === "AWAITING_CHECK") ? "count" : "work";
  return (
    <MobilePage title="Sửa chữa tại xưởng" backHref="/m/repairs">
      <RepairPhoneScreen
        order={order}
        supplies={await phoneSupplies(db)}
        userId={user.id}
        mode={mode}
      />
    </MobilePage>
  );
}

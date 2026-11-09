import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { connection } from "next/server";

import { ProductionPhoneScreen } from "@/components/production/phone/production-phone-screen";
import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requireUser } from "@/lib/auth/guard";
import { productionPhoneOrder } from "@/lib/production/phone-queries";
import { PRODUCTION_CODE } from "@/lib/production/respond";
import { phoneSupplies } from "@/lib/repairs/phone-queries";

export const metadata: Metadata = { title: "Sản xuất tại xưởng" };

/** M10 (spec production-mobile). No price on this page. */
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await requireUser();
  const work = can(user.role, "production.work");
  const count = can(user.role, "production.count");
  if (!work && !count) forbidden();
  const { code } = await params;
  await connection();
  const db = getDatabase();
  const order = PRODUCTION_CODE.test(code)
    ? await productionPhoneOrder(db, code)
    : null;
  if (!order) notFound();
  // The director has both: count once the workshop reported.
  const mode =
    count && (!work || order.status === "AWAITING_CHECK") ? "count" : "work";
  return (
    <MobilePage title="Sản xuất tại xưởng" backHref="/m/production">
      <ProductionPhoneScreen
        order={order}
        materials={await phoneSupplies(db)}
        userId={user.id}
        mode={mode}
      />
    </MobilePage>
  );
}

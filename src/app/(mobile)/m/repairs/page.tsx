import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { connection } from "next/server";

import { RepairPhoneCards } from "@/components/repairs/phone/repair-phone-list";
import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requireUser } from "@/lib/auth/guard";
import { phoneOrders, phoneStatuses } from "@/lib/repairs/phone-queries";

export const metadata: Metadata = { title: "Sửa chữa" };

/** M8 list (spec repair-mobile): the workshop's and the storekeeper's orders. */
export default async function Page() {
  const user = await requireUser();
  const scope = {
    work: can(user.role, "repairs.work"),
    count: can(user.role, "repairs.count"),
  };
  if (!scope.work && !scope.count) forbidden();
  await connection();
  const cards = await phoneOrders(getDatabase(), phoneStatuses(scope));
  return (
    <MobilePage title="Sửa chữa" backHref="/m">
      {cards.length === 0 ? (
        <p className="text-body text-muted-foreground">
          Chưa có lệnh sửa nào cần làm.
        </p>
      ) : (
        <RepairPhoneCards cards={cards} />
      )}
    </MobilePage>
  );
}

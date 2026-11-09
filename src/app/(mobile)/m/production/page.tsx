import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { connection } from "next/server";

import { ProductionPhoneCards } from "@/components/production/phone/production-phone-list";
import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requireUser } from "@/lib/auth/guard";
import {
  productionPhoneOrders,
  productionPhoneStatuses,
} from "@/lib/production/phone-queries";

export const metadata: Metadata = { title: "Sản xuất" };

/** M10 list (spec production-mobile). */
export default async function Page() {
  const user = await requireUser();
  const scope = {
    work: can(user.role, "production.work"),
    count: can(user.role, "production.count"),
  };
  if (!scope.work && !scope.count) forbidden();
  await connection();
  const cards = await productionPhoneOrders(
    getDatabase(),
    productionPhoneStatuses(scope),
  );
  return (
    <MobilePage title="Sản xuất" backHref="/m">
      {cards.length === 0 ? (
        <p className="text-body text-muted-foreground">
          Chưa có lệnh sản xuất nào cần làm.
        </p>
      ) : (
        <ProductionPhoneCards cards={cards} />
      )}
    </MobilePage>
  );
}

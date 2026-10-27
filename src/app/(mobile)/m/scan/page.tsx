import type { Metadata } from "next";

import { ScanScreen } from "@/components/scan/scan-screen";
import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Quét mã" };

/** M2 (spec item-scan "Màn quét mã M2"). */
export default async function Page() {
  const user = await requirePermission("stock.lookup");
  return (
    <MobilePage title="Quét mã">
      <ScanScreen canViewCard={can(user.role, "inventory.view")} />
    </MobilePage>
  );
}

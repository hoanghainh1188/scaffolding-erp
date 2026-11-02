import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Cho thuê & Bán" };

export default async function Page() {
  await requirePermission("sales.view");
  return (
    <PlaceholderPage
      title="Cho thuê & Bán"
      description="D4–D8: hợp đồng, xuất kho theo đợt, tính tiền thuê, phiếu đền bù."
    />
  );
}

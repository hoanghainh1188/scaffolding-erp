import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Thu mua" };

export default async function Page() {
  await requirePermission("purchasing.view");
  return (
    <PlaceholderPage
      title="Thu mua"
      description="D2, D3: đơn thu mua, chi phí vận chuyển và bốc xếp phân bổ vào giá nhập."
    />
  );
}

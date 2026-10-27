import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Công nợ" };

export default async function Page() {
  await requirePermission("receivables.view");
  return (
    <PlaceholderPage
      title="Công nợ"
      description="D14: công nợ phải thu theo nhà thầu, ghi thanh toán, xuất Excel."
    />
  );
}

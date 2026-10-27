import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Báo cáo" };

export default async function Page() {
  await requirePermission("reports.view");
  return (
    <PlaceholderPage
      title="Báo cáo"
      description="D15: lợi nhuận gộp và tỷ lệ khai thác (Bản 2)."
    />
  );
}

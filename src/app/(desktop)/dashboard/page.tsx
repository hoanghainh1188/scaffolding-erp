import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Tổng quan" };

export default async function Page() {
  await requirePermission("dashboard.view");
  return (
    <PlaceholderPage
      title="Tổng quan"
      description="D1: việc chờ duyệt, tồn kho theo tình trạng, công nợ quá hạn."
    />
  );
}

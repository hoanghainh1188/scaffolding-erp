import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Sửa chữa" };

export default async function Page() {
  await requirePermission("repairs.view");
  return (
    <PlaceholderPage
      title="Sửa chữa"
      description="D12: chuyển hàng Chờ sửa sang Tốt hoặc Phế liệu, cộng chi phí sửa vào giá vốn."
    />
  );
}

import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Kho" };

export default async function Page() {
  await requirePermission("inventory.view");
  return (
    <PlaceholderPage
      title="Kho"
      description="D9, D10, D11: danh mục vật tư, tồn kho theo vị trí và tình trạng, thẻ kho."
    />
  );
}

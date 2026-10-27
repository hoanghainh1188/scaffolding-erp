import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Danh mục" };

export default async function Page() {
  await requirePermission("catalog.view");
  return (
    <PlaceholderPage
      title="Danh mục"
      description="D16: nhà cung cấp, nhà thầu, công trình, kho bãi."
    />
  );
}

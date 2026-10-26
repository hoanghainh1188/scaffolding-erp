import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Danh mục" };

export default function Page() {
  return (
    <PlaceholderPage
      title="Danh mục"
      description="D16: nhà cung cấp, nhà thầu, công trình, kho bãi."
    />
  );
}

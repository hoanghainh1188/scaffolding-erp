import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Kho" };

export default function Page() {
  return (
    <PlaceholderPage
      title="Kho"
      description="D9, D10, D11: danh mục vật tư, tồn kho theo vị trí và tình trạng, thẻ kho."
    />
  );
}

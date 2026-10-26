import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Bán & Thuê" };

export default function Page() {
  return (
    <PlaceholderPage
      title="Bán & Thuê"
      description="D4–D8: hợp đồng, xuất kho theo đợt, tính tiền thuê, phiếu đền bù."
    />
  );
}

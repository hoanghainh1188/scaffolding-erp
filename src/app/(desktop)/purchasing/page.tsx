import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Thu mua" };

export default function Page() {
  return (
    <PlaceholderPage
      title="Thu mua"
      description="D2, D3: đơn thu mua, chi phí vận chuyển và bốc xếp phân bổ vào giá nhập."
    />
  );
}

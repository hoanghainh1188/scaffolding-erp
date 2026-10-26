import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Công nợ" };

export default function Page() {
  return (
    <PlaceholderPage
      title="Công nợ"
      description="D14: công nợ phải thu theo nhà thầu, ghi thanh toán, xuất Excel."
    />
  );
}

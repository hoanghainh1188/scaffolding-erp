import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Sửa chữa" };

export default function Page() {
  return (
    <PlaceholderPage
      title="Sửa chữa"
      description="D12: chuyển hàng Chờ sửa sang Tốt hoặc Phế liệu, cộng chi phí sửa vào giá vốn."
    />
  );
}

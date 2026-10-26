import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Tổng quan" };

export default function Page() {
  return (
    <PlaceholderPage
      title="Tổng quan"
      description="D1: việc chờ duyệt, tồn kho theo tình trạng, công nợ quá hạn."
    />
  );
}

import type { Metadata } from "next";

import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { UnderConstruction } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Lịch sử" };

export default function Page() {
  return (
    <MobilePage title="Lịch sử">
      <UnderConstruction description="M7: phiếu đã làm, lọc theo loại và ngày; phiếu nháp ở đầu danh sách." />
    </MobilePage>
  );
}

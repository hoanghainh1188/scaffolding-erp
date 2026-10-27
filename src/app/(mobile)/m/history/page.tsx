import type { Metadata } from "next";

import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { requireUser } from "@/lib/auth/guard";
import { UnderConstruction } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Lịch sử" };

export default async function Page() {
  await requireUser();
  return (
    <MobilePage title="Lịch sử">
      <UnderConstruction description="M7: phiếu đã làm, lọc theo loại và ngày; phiếu nháp ở đầu danh sách." />
    </MobilePage>
  );
}

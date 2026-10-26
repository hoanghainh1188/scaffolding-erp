import type { Metadata } from "next";

import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { UnderConstruction } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Việc hôm nay" };

export default function Page() {
  return (
    <MobilePage title="Việc hôm nay">
      <UnderConstruction description="M1: xe sắp về bãi, lệnh xuất hàng hôm nay, công trình sắp trả hàng." />
    </MobilePage>
  );
}

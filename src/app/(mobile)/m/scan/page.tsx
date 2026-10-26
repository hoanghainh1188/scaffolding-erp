import type { Metadata } from "next";

import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { UnderConstruction } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Quét mã" };

export default function Page() {
  return (
    <MobilePage title="Quét mã">
      <UnderConstruction description="M2: quét mã QR trên hàng hoặc chọn thủ công." />
    </MobilePage>
  );
}

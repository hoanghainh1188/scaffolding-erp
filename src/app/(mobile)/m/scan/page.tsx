import type { Metadata } from "next";

import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { requireUser } from "@/lib/auth/guard";
import { UnderConstruction } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Quét mã" };

export default async function Page() {
  await requireUser();
  return (
    <MobilePage title="Quét mã">
      <UnderConstruction description="M2: quét mã QR trên hàng hoặc chọn thủ công." />
    </MobilePage>
  );
}

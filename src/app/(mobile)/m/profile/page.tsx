import type { Metadata } from "next";

import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { UnderConstruction } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Cá nhân" };

export default function Page() {
  return (
    <MobilePage title="Cá nhân">
      <UnderConstruction description="Thông tin tài khoản và đăng xuất, có khi làm đăng nhập." />
    </MobilePage>
  );
}

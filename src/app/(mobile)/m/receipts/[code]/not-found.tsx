import Link from "next/link";

import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { Button } from "@/components/ui/button";
import { RECEIPT_MESSAGES } from "@/domain/goods-receipt";

export default function NotFound() {
  return (
    <MobilePage title="Phiếu nhập" backHref="/m/history">
      <p role="alert" className="text-h3">
        {RECEIPT_MESSAGES.notFound}
      </p>
      <Button asChild variant="secondary" className="h-12 self-start">
        <Link href="/m/history">Về Lịch sử</Link>
      </Button>
    </MobilePage>
  );
}

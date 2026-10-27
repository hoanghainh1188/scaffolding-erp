import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { requireUser } from "@/lib/auth/guard";
import { DemoStepper } from "@/components/domain/stepper-demo";

export const metadata: Metadata = { title: "Phiếu nhập" };

/** Sample detail page (back button, form field near the bottom). Dev only. */
export default async function DevDetailPage() {
  await requireUser();
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <MobilePage title="Phiếu nhập" backHref="/m/history">
      <p className="text-body text-muted-foreground">
        Trang mẫu cho kiểm tra: nút quay lại, ô nhập ở cuối trang.
      </p>
      <div className="h-[120dvh]" aria-hidden />
      <DemoStepper />
    </MobilePage>
  );
}

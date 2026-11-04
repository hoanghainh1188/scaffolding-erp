import { Calculator, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { UnderConstruction } from "@/components/shell/placeholder-page";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Công nợ" };

export default async function Page() {
  await requirePermission("receivables.view");
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1">Công nợ</h1>
      <Link
        href="/receivables/billing"
        className="flex max-w-xl items-center gap-4 rounded-lg border bg-card p-5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Calculator aria-hidden className="size-5" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span className="text-label">Tính tiền thuê</span>
          <span className="text-body text-muted-foreground">
            Tiền thuê từng hợp đồng theo tháng, chốt kỳ, in bảng kê, xuất Excel.
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
      </Link>
      <UnderConstruction description="D14: công nợ phải thu theo nhà thầu, ghi thanh toán, xuất Excel." />
    </div>
  );
}

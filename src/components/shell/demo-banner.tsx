import { Info } from "lucide-react";

import { isDemoMode } from "@/lib/env";

export const DEMO_BANNER_TEXT =
  "Bản thử nghiệm — Dữ liệu được làm mới vào 0:00 mỗi ngày";

export function DemoBanner() {
  if (!isDemoMode()) {
    return null;
  }

  return (
    <aside
      role="status"
      aria-label="Thông báo môi trường thử nghiệm"
      className="relative z-50 flex items-center justify-center gap-2 border-b border-border bg-highlight px-3 py-1.5 text-center text-xs font-medium text-highlight-foreground sm:text-sm"
    >
      <Info className="size-4 shrink-0" aria-hidden="true" />
      <span>{DEMO_BANNER_TEXT}</span>
    </aside>
  );
}

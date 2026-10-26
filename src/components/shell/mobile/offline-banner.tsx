"use client";

import { WifiOff } from "lucide-react";

import { useOnlineStatus } from "@/hooks/use-online-status";

/** Shown at the top of /m while offline. Draft saving comes with M3–M5. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <p
      role="status"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-foreground px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-label text-card print:hidden"
    >
      <WifiOff aria-hidden className="size-4" />
      Mất kết nối
    </p>
  );
}

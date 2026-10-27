"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { draftPresence } from "@/lib/drafts/runtime";

/**
 * Shown at the top of /m while offline; on a page that keeps a draft it
 * says the draft is safe (spec app-shell, goods-receipt design D1).
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const drafting = useSyncExternalStore(
    draftPresence.subscribe,
    draftPresence.current,
    () => false,
  );
  if (online) return null;
  return (
    <p
      role="status"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-foreground px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-label text-card print:hidden"
    >
      <WifiOff aria-hidden className="size-4" />
      {drafting ? "Mất kết nối – đã lưu nháp" : "Mất kết nối"}
    </p>
  );
}

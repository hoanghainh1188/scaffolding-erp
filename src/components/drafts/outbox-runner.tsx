"use client";

// Sends queued drafts of the signed-in user (goods-receipt design D1): when
// the app opens, when the network comes back, and every 30 s (doubling up
// to 5 minutes while it keeps failing) while the page is visible.
import { CheckCircle2, X } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { nextRetryDelay, RETRY_BASE_MS } from "@/lib/drafts/outbox";
import { outboxFor, postedNotices } from "@/lib/drafts/runtime";

export function OutboxRunner({ userId }: { userId: string }) {
  useEffect(() => {
    const outbox = outboxFor(userId);
    let delay = RETRY_BASE_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (!stopped) timer = setTimeout(tick, delay);
    };
    const tick = async () => {
      if (navigator.onLine && document.visibilityState === "visible") {
        delay = nextRetryDelay(delay, await outbox.flush());
      }
      schedule();
    };
    const now = () => {
      delay = RETRY_BASE_MS;
      void tick();
    };
    void tick();
    window.addEventListener("online", now);
    document.addEventListener("visibilitychange", now);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", now);
      document.removeEventListener("visibilitychange", now);
    };
  }, [userId]);

  const notice = useSyncExternalStore(
    postedNotices.subscribe,
    postedNotices.current,
    () => null,
  );
  if (!notice) return null;
  return (
    <p
      role="status"
      className="sticky top-0 z-30 flex items-center gap-2 bg-success px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-label text-card"
    >
      <CheckCircle2 aria-hidden className="size-4 shrink-0" />
      <span className="flex-1">
        {notice.kind === "STOCKTAKE"
          ? `Đã gửi ${notice.code} về văn phòng`
          : notice.kind === "DELIVERY"
            ? `Đã xuất ${notice.code}`
            : notice.kind === "TRANSFER"
              ? `Đã chuyển ${notice.code}`
              : notice.kind === "REPAIR" || notice.kind === "PRODUCTION"
                ? `Đã gửi ${notice.code} về văn phòng`
                : `Đã nhập kho ${notice.code} · ${notice.title}`}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Đóng thông báo"
        onClick={postedNotices.clear}
      >
        <X aria-hidden className="size-4" />
      </Button>
    </p>
  );
}

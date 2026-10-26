"use client";

import type { ReactNode } from "react";

import { useKeepFocusedInputVisible } from "@/hooks/use-keep-focused-input-visible";

import { BottomNav } from "./bottom-nav";
import { OfflineBanner } from "./offline-banner";

/**
 * Phone layout for M1..M8: offline banner, page (with its AppBar), bottom
 * tabs. Capped at 640px and centred on wide screens; open to every role.
 */
export function MobileShell({ children }: { children: ReactNode }) {
  useKeepFocusedInputVisible();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <OfflineBanner />
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col bg-background pb-[calc(4rem+env(safe-area-inset-bottom))] sm:border-x">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}

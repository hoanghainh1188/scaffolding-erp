import type { ReactNode } from "react";

import { AppBar } from "./app-bar";

interface MobilePageProps {
  title: string;
  backHref?: string;
  children: ReactNode;
}

export function MobilePage({ title, backHref, children }: MobilePageProps) {
  return (
    <>
      <AppBar title={title} backHref={backHref} />
      <main className="flex flex-1 flex-col gap-6 px-[max(1rem,env(safe-area-inset-left))] py-6">
        {children}
      </main>
    </>
  );
}

import type { ReactNode } from "react";

import { MobileShell } from "@/components/shell/mobile/mobile-shell";

/** Phone area for every role, including office roles on their phones. */
export default function MobileLayout({ children }: { children: ReactNode }) {
  return <MobileShell>{children}</MobileShell>;
}

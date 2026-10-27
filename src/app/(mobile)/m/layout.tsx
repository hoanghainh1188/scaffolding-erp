import type { ReactNode } from "react";

import { MobileShell } from "@/components/shell/mobile/mobile-shell";

// Pages wait for the session check before sending anything, so a signed-out
// visitor gets a real redirect to /login (design D7).
export const instant = false;

/** Phone area for every role, including office roles on their phones. */
export default function MobileLayout({ children }: { children: ReactNode }) {
  return <MobileShell>{children}</MobileShell>;
}

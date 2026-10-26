import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { AppSidebar } from "@/components/shell/desktop/app-sidebar";
import { TopHeader } from "@/components/shell/desktop/top-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { defaultSurfaceForRole } from "@/domain/role";
import { getCurrentUser } from "@/lib/current-user";
import { navItemsForRole } from "@/lib/navigation";
import {
  SIDEBAR_COOKIE_NAME,
  parseSidebarPreference,
} from "@/lib/sidebar-preference";

/** Office layout for D1..D17: sidebar + header + content. */
export default function DesktopLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <DesktopShell>{children}</DesktopShell>
    </Suspense>
  );
}

async function DesktopShell({ children }: { children: ReactNode }) {
  // Reading the cookie makes the shell request-time: the user and the saved
  // sidebar choice are per request.
  const preference = parseSidebarPreference(
    (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value,
  );
  const user = getCurrentUser();
  if (defaultSurfaceForRole(user.role) === "MOBILE") redirect("/m");

  return (
    <SidebarProvider defaultPreference={preference}>
      <AppSidebar items={navItemsForRole(user.role)} />
      <SidebarInset className="min-w-0">
        <TopHeader user={user} />
        <main className="flex-1 px-4 py-8 lg:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

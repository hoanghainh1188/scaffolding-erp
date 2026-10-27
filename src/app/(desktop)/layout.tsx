import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppSidebar } from "@/components/shell/desktop/app-sidebar";
import { TopHeader } from "@/components/shell/desktop/top-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { defaultSurfaceForRole } from "@/domain/role";
import { requireUser } from "@/lib/auth/guard";
import { navItemsForRole } from "@/lib/navigation";
import {
  SIDEBAR_COOKIE_NAME,
  parseSidebarPreference,
} from "@/lib/sidebar-preference";

// Every office page waits for the session check before sending anything, so
// /login redirects and 403 pages keep their real HTTP status (design D7).
export const instant = false;

/** Office layout for D1..D17: sidebar + header + content. */
export default async function DesktopLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Pages check their own permission too: layouts do not re-run on every
  // client navigation (design D7).
  const user = await requireUser();
  if (defaultSurfaceForRole(user.role) === "MOBILE") redirect("/m");
  const preference = parseSidebarPreference(
    (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value,
  );

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

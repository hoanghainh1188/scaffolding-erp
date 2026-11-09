import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { SessionsList } from "@/components/sessions/sessions-list";
import { AppBar } from "@/components/shell/mobile/app-bar";
import { MobileShell } from "@/components/shell/mobile/mobile-shell";
import { BrandPanel } from "@/components/two-factor/brand-panel";
import { getDatabase } from "@/db/client";
import { ROLE_LABELS } from "@/domain/role";
import { requireUser } from "@/lib/auth/guard";
import { homePathFor } from "@/lib/auth/paths";
import { listDeviceSessions } from "@/lib/auth/sessions";
import { dict } from "@/locales";

export const metadata: Metadata = { title: "Thiết bị đăng nhập" };

// Waits for the session check: signed-out visitors get a real redirect.
export const instant = false;

const TEXT = dict.auth.sessions;

/** A user's own signed-in devices (spec session-management). */
export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const user = await requireUser();
  await connection();
  const rows = await listDeviceSessions(
    { db: getDatabase() },
    {
      actor: { id: user.id },
      username: user.username,
      currentSessionId: user.sessionId,
      now: new Date(),
    },
  );
  const body =
    rows === null ? (
      <p className="rounded-2xl border bg-card p-5 text-body">{TEXT.demoOff}</p>
    ) : (
      <SessionsList rows={rows} twoFactorEnabled={user.twoFactorEnabled} />
    );

  if ((await searchParams).from === "m") {
    return (
      <MobileShell>
        <AppBar title={TEXT.title} backHref="/m/profile" />
        <main className="flex flex-1 flex-col gap-5 px-[max(1rem,env(safe-area-inset-left))] py-6">
          {body}
        </main>
      </MobileShell>
    );
  }

  const home = homePathFor(user.role);
  return (
    <div className="flex min-h-dvh flex-wrap bg-background text-foreground">
      <BrandPanel
        headline={TEXT.panel}
        className="lg:sticky lg:top-0 lg:h-dvh lg:self-start"
      >
        <p className="text-body opacity-90">
          {user.name}
          <br />
          {user.username} · {ROLE_LABELS[user.role]}
        </p>
      </BrandPanel>
      <main className="flex flex-[1_1_420px] flex-col gap-5 px-4 py-8 sm:px-14 sm:py-12">
        <Link
          href={home}
          className="self-start text-sm underline-offset-4 hover:underline"
        >
          ← {home === "/dashboard" ? TEXT.backDashboard : TEXT.backHome}
        </Link>
        <h1 className="text-h1">{TEXT.title}</h1>
        <div className="flex w-full max-w-[720px] flex-col gap-5">{body}</div>
      </main>
    </div>
  );
}

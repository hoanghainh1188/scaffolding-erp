import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { connection } from "next/server";

import { TwoFactorManage } from "@/components/two-factor/two-factor-manage";
import { TwoFactorSetup } from "@/components/two-factor/two-factor-setup";
import { getDatabase } from "@/db/client";
import { canManageTwoFactor } from "@/domain/permissions";
import { requireUser } from "@/lib/auth/guard";
import { homePathFor } from "@/lib/auth/paths";
import { readTwoFactorStatus } from "@/lib/auth/two-factor";
import { isDemoMode } from "@/lib/env";
import { dict } from "@/locales";

export const metadata: Metadata = { title: "Xác thực 2 lớp" };

// Waits for the session check: signed-out visitors get a real redirect.
export const instant = false;

/** Own second factor; the only page open before a required one is on. */
export default async function TwoFactorPage() {
  const user = await requireUser({ allowPendingTwoFactor: true });
  if (!canManageTwoFactor(user)) forbidden();
  await connection();

  if (user.twoFactorEnabled) {
    const status = await readTwoFactorStatus(
      getDatabase(),
      user.id,
      new Date(),
    );
    return <TwoFactorManage {...status} />;
  }
  if (isDemoMode()) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-4">
        <p className="text-body">{dict.auth.twoFactor.demoOff}</p>
      </main>
    );
  }
  return <TwoFactorSetup doneHref={homePathFor(user.role)} />;
}

import { and, eq, ne } from "drizzle-orm";

import type { Database } from "@/db/client";
import { account, session, user } from "@/db/schema";
import { validateNewPassword } from "@/domain/password";
import type { ActivityActor } from "@/lib/activity/actor";
import { logActivity } from "@/lib/activity/log";
import { isDemoMode } from "@/lib/env";
import { isDemoAccount } from "@/lib/users/seed";

import type { Auth } from "./auth";
import {
  CREDENTIAL_PROVIDER,
  hashPassword,
  verifyPassword,
} from "./credentials";

export const CHANGE_PASSWORD_MESSAGES = {
  wrongCurrent: "Mật khẩu hiện tại không đúng",
  demoAccountBlocked: "Tài khoản demo dùng chung không được đổi mật khẩu",
} as const;

export interface ChangePasswordInput {
  /** The signed-in user changing their own password. */
  actor: ActivityActor;
  /** Kept signed in; every other session of the user ends. */
  currentSessionId: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export type ChangePasswordResult =
  { ok: true } | { ok: false; status: 400; error: string };

/** A user changing their own password, temporary or not (spec auth). */
export async function changePassword(
  { db, auth }: { db: Database; auth: Auth },
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  const [row] = await db
    .select({ username: user.username, hash: account.password })
    .from(user)
    .innerJoin(
      account,
      and(
        eq(account.userId, user.id),
        eq(account.providerId, CREDENTIAL_PROVIDER),
      ),
    )
    .where(eq(user.id, input.actor.id));
  if (row?.username && isDemoMode() && isDemoAccount(row.username)) {
    return {
      ok: false,
      status: 400,
      error: CHANGE_PASSWORD_MESSAGES.demoAccountBlocked,
    };
  }
  if (
    !row?.hash ||
    !(await verifyPassword(auth, row.hash, input.currentPassword))
  ) {
    return {
      ok: false,
      status: 400,
      error: CHANGE_PASSWORD_MESSAGES.wrongCurrent,
    };
  }

  const check = validateNewPassword({
    password: input.newPassword,
    confirm: input.confirmPassword,
    username: row.username,
    currentPassword: input.currentPassword,
  });
  if (!check.ok) return { ok: false, status: 400, error: check.error };

  const hash = await hashPassword(auth, input.newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(account)
      .set({ password: hash, updatedAt: new Date() })
      .where(
        and(
          eq(account.userId, input.actor.id),
          eq(account.providerId, CREDENTIAL_PROVIDER),
        ),
      );
    await tx
      .update(user)
      .set({
        mustChangePassword: false,
        tempPasswordExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, input.actor.id));
    await tx
      .delete(session)
      .where(
        and(
          eq(session.userId, input.actor.id),
          ne(session.id, input.currentSessionId),
        ),
      );
    // Never the password itself (activity-log design D7).
    await logActivity(tx, input.actor, {
      action: "UPDATE",
      document: { type: "USER", id: input.actor.id, code: row.username },
      summary: "Đổi mật khẩu",
    });
  });
  return { ok: true };
}

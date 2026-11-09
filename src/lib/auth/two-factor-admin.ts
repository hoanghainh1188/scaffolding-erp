// Clearing a second factor for someone else, from D17 or the command line,
// and the "Admin hệ thống" flag (director-mfa design D5, D12).
import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { loginThrottle, session, user } from "@/db/schema";
import {
  canResetOthersTwoFactor,
  type AccountUser,
} from "@/domain/permissions";
import { parseRole } from "@/domain/role";
import { normalizeUsername } from "@/domain/username";
import { systemActor, type ActivityActor } from "@/lib/activity/actor";
import { logActivity, type Tx } from "@/lib/activity/log";

import {
  clearTwoFactor,
  consumeManageAttempt,
  isOwnPassword,
  verifyOwnCode,
  type TwoFactorDeps,
  type TwoFactorResult,
} from "./two-factor";
import { TWO_FACTOR_MESSAGES } from "./two-factor-sign-in";

export const ADMIN_MESSAGES = {
  forbidden: "Bạn không có quyền thực hiện thao tác này",
  self: "Không gỡ được cho chính bạn. Dùng Đổi điện thoại",
  notEnabled: "Tài khoản này chưa bật xác thực 2 lớp",
  notFound: "Không tìm thấy tài khoản",
} as const;

async function lockTarget(tx: Tx, id: string) {
  const [row] = await tx
    .select({
      id: user.id,
      username: user.username,
      enabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(eq(user.id, id))
    .for("update");
  return row;
}

/** The one way a whole second factor goes away for another account. */
async function wipeAccount(
  tx: Tx,
  target: { id: string; username: string },
): Promise<void> {
  await clearTwoFactor(tx, target.id);
  await tx.delete(session).where(eq(session.userId, target.id));
  await tx
    .delete(loginThrottle)
    .where(eq(loginThrottle.usernameKey, target.username));
}

/** D17: an admin clears it after proving who they are again. */
export async function resetTwoFactorByAdmin(
  deps: TwoFactorDeps,
  input: {
    admin: AccountUser;
    actor: ActivityActor;
    targetId: string;
    password: string;
    code: string;
    headers: Headers;
    now?: Date;
  },
): Promise<TwoFactorResult<{ reset: true }>> {
  const { db } = deps;
  const now = input.now ?? new Date();
  const refuse = (status: 400 | 403 | 404 | 409, error: string) =>
    ({ ok: false, status, error }) as const;
  if (!canResetOthersTwoFactor(input.admin)) {
    return refuse(403, ADMIN_MESSAGES.forbidden);
  }
  if (input.targetId === input.actor.id) {
    return refuse(400, ADMIN_MESSAGES.self);
  }
  const [before] = await db
    .select({ enabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, input.targetId));
  if (!before) return refuse(404, ADMIN_MESSAGES.notFound);
  if (!before.enabled) return refuse(409, ADMIN_MESSAGES.notEnabled);
  if (!(await consumeManageAttempt(db, input.actor.id, now))) {
    return {
      ok: false,
      status: 429,
      error: "Thao tác quá nhanh. Thử lại sau ít phút",
    };
  }
  if (!(await isOwnPassword(deps, input.actor.id, input.password))) {
    return refuse(400, TWO_FACTOR_MESSAGES.wrongPassword);
  }
  const verified = await verifyOwnCode(
    deps,
    input.actor.id,
    input.code,
    input.headers,
    now,
  );
  if (!verified) return refuse(400, TWO_FACTOR_MESSAGES.wrongCode);
  return db.transaction(async (tx) => {
    const target = await lockTarget(tx, input.targetId);
    if (!target) return refuse(404, ADMIN_MESSAGES.notFound);
    if (!target.enabled) return refuse(409, ADMIN_MESSAGES.notEnabled);
    await wipeAccount(tx, target);
    await logActivity(tx, input.actor, {
      action: "UPDATE",
      document: { type: "USER", id: target.id, code: target.username },
      summary: `Gỡ xác thực 2 lớp của ${target.username}`,
      sensitive: true,
    });
    return { ok: true, data: { reset: true as const } };
  });
}

export type CommandResult =
  { ok: true; message: string } | { ok: false; message: string };

async function findAccount(tx: Tx, username: string) {
  const [row] = await tx
    .select({
      id: user.id,
      username: user.username,
      role: user.role,
      enabled: user.twoFactorEnabled,
      systemAdmin: user.systemAdmin,
    })
    .from(user)
    .where(eq(user.username, normalizeUsername(username)))
    .for("update");
  return row;
}

/** `auth:reset-2fa`: the way out when no admin can do it on D17. */
export async function resetTwoFactorByCli(
  db: Database,
  username: string,
): Promise<CommandResult> {
  return db.transaction(async (tx): Promise<CommandResult> => {
    const target = await findAccount(tx, username);
    if (!target) {
      return { ok: false, message: `Không tìm thấy tài khoản "${username}".` };
    }
    if (!target.enabled) {
      return {
        ok: false,
        message: `Tài khoản "${username}" chưa bật xác thực 2 lớp.`,
      };
    }
    await wipeAccount(tx, target);
    await logActivity(
      tx,
      systemActor({ id: target.id, role: parseRole(target.role) }),
      {
        action: "UPDATE",
        document: { type: "USER", id: target.id, code: target.username },
        summary: "Tắt xác thực 2 lớp bằng lệnh cứu hộ",
        sensitive: true,
      },
    );
    return {
      ok: true,
      message: `Đã tắt xác thực 2 lớp của "${target.username}". Mọi máy phải đăng nhập lại.`,
    };
  });
}

/** `auth:set-admin`: the only way the flag changes. */
export async function setSystemAdmin(
  db: Database,
  username: string,
  on: boolean,
): Promise<CommandResult> {
  return db.transaction(async (tx): Promise<CommandResult> => {
    const target = await findAccount(tx, username);
    if (!target) {
      return { ok: false, message: `Không tìm thấy tài khoản "${username}".` };
    }
    if (target.systemAdmin === on) {
      return {
        ok: true,
        message: `Tài khoản "${target.username}" đã ở trạng thái này, không đổi gì.`,
      };
    }
    await tx
      .update(user)
      .set({ systemAdmin: on, updatedAt: new Date() })
      .where(eq(user.id, target.id));
    await logActivity(
      tx,
      systemActor({ id: target.id, role: parseRole(target.role) }),
      {
        action: "UPDATE",
        document: { type: "USER", id: target.id, code: target.username },
        summary: on ? "Đặt cờ Admin hệ thống" : "Gỡ cờ Admin hệ thống",
        sensitive: true,
      },
    );
    return {
      ok: true,
      message: on
        ? `Đã đặt cờ Admin hệ thống cho "${target.username}".`
        : `Đã gỡ cờ Admin hệ thống của "${target.username}".`,
    };
  });
}

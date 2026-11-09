// A user's own signed-in devices (session-management design D1, D8). Never
// goes through Better Auth's revoke routes: those take the session token,
// which must not leave the server.
import { and, desc, eq, gt, ne, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { session, user } from "@/db/schema";
import {
  DEVICE_SESSION_LIST_LIMIT,
  deviceNameOf,
  isLiveDeviceSession,
  otherDevicesSummary,
  toDeviceSessionRows,
  type DeviceSessionRow,
} from "@/domain/device-session";
import type { ActivityActor } from "@/lib/activity/actor";
import { logActivity } from "@/lib/activity/log";
import { isDemoMode } from "@/lib/env";
import { isDemoAccount } from "@/lib/users/seed";
import type { ServiceResult } from "@/lib/users/service";

import { forgetCountingLive } from "./trusted-devices";

export const DEVICE_SESSION_MESSAGES = {
  thisDevice: "Muốn đăng xuất máy đang dùng, chọn Đăng xuất ở menu tài khoản",
  alreadyGone: "Thiết bị này đã đăng xuất. Danh sách đã cập nhật.",
  demoBlocked: "Tài khoản demo dùng chung không dùng được tính năng này",
} as const;

export interface OwnDevicesInput {
  actor: ActivityActor;
  username: string;
  currentSessionId: string;
}

interface Deps {
  db: Database;
}

const isSharedDemo = (username: string) =>
  isDemoMode() && isDemoAccount(username);

const demoBlocked = {
  ok: false as const,
  status: 409 as const,
  error: DEVICE_SESSION_MESSAGES.demoBlocked,
};

const ownDocument = (input: OwnDevicesInput) => ({
  type: "USER" as const,
  id: input.actor.id,
  code: input.username,
});

/** The page's rows; null for a shared demo account (no list there). */
export async function listDeviceSessions(
  { db }: Deps,
  input: Omit<OwnDevicesInput, "actor"> & {
    actor: Pick<ActivityActor, "id">;
    now: Date;
  },
): Promise<DeviceSessionRow[] | null> {
  if (isSharedDemo(input.username)) return null;
  const records = await db
    .select({
      id: session.id,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      persistent: session.persistent,
    })
    .from(session)
    .where(
      and(eq(session.userId, input.actor.id), gt(session.expiresAt, input.now)),
    )
    .orderBy(
      desc(sql`${session.id} = ${input.currentSessionId}`),
      desc(session.updatedAt),
    )
    .limit(DEVICE_SESSION_LIST_LIMIT);
  return toDeviceSessionRows(records, input.currentSessionId, input.now);
}

export async function signOutDevice(
  { db }: Deps,
  input: OwnDevicesInput & { sessionId: string; now?: Date },
): Promise<ServiceResult<{ signedOut: true }>> {
  if (isSharedDemo(input.username)) return demoBlocked;
  if (input.sessionId === input.currentSessionId) {
    return {
      ok: false,
      status: 400,
      error: DEVICE_SESSION_MESSAGES.thisDevice,
    };
  }
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(session)
      .where(
        and(
          eq(session.id, input.sessionId),
          eq(session.userId, input.actor.id),
        ),
      )
      .returning({
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        persistent: session.persistent,
      });
    if (!removed || !isLiveDeviceSession(removed, now)) {
      return {
        ok: false as const,
        status: 404 as const,
        error: DEVICE_SESSION_MESSAGES.alreadyGone,
      };
    }
    await logActivity(tx, input.actor, {
      action: "UPDATE",
      document: ownDocument(input),
      summary: `Đăng xuất máy khác: ${deviceNameOf(removed.userAgent)}`,
      sensitive: true,
    });
    return { ok: true as const, data: { signedOut: true as const } };
  });
}

export async function signOutOtherDevices(
  { db }: Deps,
  input: OwnDevicesInput & { now?: Date },
): Promise<ServiceResult<{ count: number; forgotten: number }>> {
  if (isSharedDemo(input.username)) return demoBlocked;
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    // Same row lock as signOutAllDevices, so the two cannot interleave.
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, input.actor.id))
      .for("update");
    const removed = await tx
      .delete(session)
      .where(
        and(
          eq(session.userId, input.actor.id),
          ne(session.id, input.currentSessionId),
        ),
      )
      .returning({
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        persistent: session.persistent,
      });
    const count = removed.filter((row) => isLiveDeviceSession(row, now)).length;
    // No other device: a stray click must not cost the trusted ones.
    if (count === 0)
      return { ok: true as const, data: { count, forgotten: 0 } };
    const forgotten = await forgetCountingLive(tx, input.actor.id, now);
    const counts = { sessions: count, trusted: forgotten };
    await logActivity(tx, input.actor, {
      action: "UPDATE",
      document: ownDocument(input),
      summary: otherDevicesSummary(counts),
      sensitive: true,
    });
    return { ok: true as const, data: { count, forgotten } };
  });
}

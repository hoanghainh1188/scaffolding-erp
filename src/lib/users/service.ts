// User management for D17 (spec user-management, design D5, D6). Each write
// is one transaction; route handlers only parse input and call these.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/db/client";
import { account, loginThrottle, session, user } from "@/db/schema";
import { isDevice, type Device } from "@/domain/device";
import {
  allDevicesSummary,
  isLiveDeviceSession,
  signOutOutcome,
} from "@/domain/device-session";
import { joinParts } from "@/domain/activity-summary";
import {
  CONTRACT_SCOPE_LABELS,
  CONTRACT_SCOPES,
  parseContractScope,
  type ContractScope,
} from "@/domain/permissions";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/role";
import { generateTempPassword } from "@/domain/temp-password";
import { isValidUsername, normalizeUsername } from "@/domain/username";
import {
  forgetCountingLive,
  forgetTrustedDevices,
} from "@/lib/auth/trusted-devices";
import type { ActivityActor } from "@/lib/activity/actor";
import { logActivity } from "@/lib/activity/log";
import type { Auth } from "@/lib/auth/auth";
import {
  CREDENTIAL_PROVIDER,
  hashPassword,
  insertUser,
  type Executor,
  type UserStatus,
} from "@/lib/auth/credentials";
import { isDemoMode } from "@/lib/env";
import { isDemoAccount } from "@/lib/users/seed";

export const USER_MESSAGES = {
  notFound: "Không tìm thấy người dùng",
  usernameTaken: "Tên đăng nhập đã có người dùng",
  selfLock: "Không thể tự khóa tài khoản của mình",
  selfRole: "Không thể tự đổi vai trò của mình",
  selfReset: "Đổi mật khẩu của bạn ở mục Đổi mật khẩu",
  lastDirector: "Phải còn ít nhất một Giám đốc đang dùng",
  resetLocked: "Mở khóa tài khoản trước khi đặt lại mật khẩu",
  alreadyActive: "Tài khoản này đang dùng",
  notDirector: "Bạn không có quyền thực hiện thao tác này",
  demoResetBlocked: "Tài khoản demo dùng chung không thể đặt lại mật khẩu",
  demoLockBlocked: "Tài khoản demo dùng chung không thể khóa",
  demoRoleBlocked: "Tài khoản demo dùng chung không thể đổi vai trò",
  demoSignOutBlocked: "Tài khoản demo dùng chung không thể đăng xuất từ xa",
  selfSignOutAll: "Máy của bạn quản lý ở mục Thiết bị đăng nhập",
  scopeNotSales: "Phạm vi hợp đồng chỉ đặt cho tài khoản Kinh doanh.",
} as const;

export const TEMP_PASSWORD_TTL_MS = 48 * 60 * 60 * 1000;

export interface UserRow {
  id: string;
  name: string;
  username: string;
  role: Role;
  /** Contract types a SALES account works on (0.2 #51). */
  contractScope: ContractScope;
  status: UserStatus;
  mustChangePassword: boolean;
  /** ISO time when the temporary password expires, or null if already changed. */
  tempPasswordExpiresAt: string | null;
  /** ISO time, or null if the user never signed in. */
  lastLoginAt: string | null;
  lastLoginDevice: Device | null;
  twoFactorEnabled: boolean;
  systemAdmin: boolean;
}

export interface UserCounts {
  active: number;
  locked: number;
  /** Every account per role, locked ones included. */
  byRole: Record<Role, number>;
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

export interface UserServiceDeps {
  db: Database;
  auth: Auth;
}

/** The director doing the change, as the activity log records them. */
export type Actor = ActivityActor;

const USER_STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  ACTIVE: "Đang dùng",
  LOCKED: "Đã khóa",
};

const userDocument = (target: { id: string; username: string }) => ({
  type: "USER" as const,
  id: target.id,
  code: target.username,
});

const MAX_NAME_LENGTH = 100;

export const createUserSchema = z.object({
  name: z
    .string({ error: "Nhập họ tên" })
    .trim()
    .min(1, { error: "Nhập họ tên" })
    .max(MAX_NAME_LENGTH, {
      error: `Họ tên dài tối đa ${MAX_NAME_LENGTH} ký tự`,
    }),
  username: z
    .string({ error: "Nhập tên đăng nhập" })
    .transform(normalizeUsername)
    .refine(isValidUsername, {
      error: "Chữ thường không dấu, không khoảng trắng",
    }),
  role: z.enum(ROLES, { error: "Chọn một vai trò" }),
  /** Only kept for SALES; anything else stores ALL. */
  contractScope: z
    .enum(CONTRACT_SCOPES, { error: "Chọn phạm vi hợp đồng" })
    .optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const changeRoleSchema = z.object({
  role: z.enum(ROLES, { error: "Chọn một vai trò" }),
});

/** PATCH /api/users/[id]: a new role or a new contract scope. */
export const updateUserSchema = z.union(
  [
    changeRoleSchema,
    z.object({
      contractScope: z.enum(CONTRACT_SCOPES, {
        error: "Chọn phạm vi hợp đồng",
      }),
    }),
  ],
  { error: "Chọn vai trò hoặc phạm vi hợp đồng" },
);

const rowColumns = {
  id: user.id,
  name: user.name,
  username: user.username,
  role: user.role,
  contractScope: user.contractScope,
  status: user.status,
  mustChangePassword: user.mustChangePassword,
  tempPasswordExpiresAt: user.tempPasswordExpiresAt,
  lastLoginAt: user.lastLoginAt,
  lastLoginDevice: user.lastLoginDevice,
  twoFactorEnabled: user.twoFactorEnabled,
  systemAdmin: user.systemAdmin,
};

type StoredRow = {
  id: string;
  name: string;
  username: string;
  role: string;
  contractScope: string;
  status: string;
  mustChangePassword: boolean;
  tempPasswordExpiresAt: Date | null;
  lastLoginAt: Date | null;
  lastLoginDevice: string | null;
  twoFactorEnabled: boolean;
  systemAdmin: boolean;
};

function toUserRow(row: StoredRow): UserRow {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role as Role,
    contractScope: parseContractScope(row.contractScope),
    status: row.status as UserStatus,
    mustChangePassword: row.mustChangePassword,
    tempPasswordExpiresAt: row.tempPasswordExpiresAt?.toISOString() ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    lastLoginDevice:
      row.lastLoginDevice && isDevice(row.lastLoginDevice)
        ? row.lastLoginDevice
        : null,
    twoFactorEnabled: row.twoFactorEnabled,
    systemAdmin: row.systemAdmin,
  };
}

const collator = new Intl.Collator("vi");

/** Active accounts first, then by name in Vietnamese order. */
export function sortUsers(rows: readonly UserRow[]): UserRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(a.status === "LOCKED") - Number(b.status === "LOCKED") ||
      collator.compare(a.name, b.name),
  );
}

export function countUsers(rows: readonly UserRow[]): UserCounts {
  const byRole = Object.fromEntries(ROLES.map((role) => [role, 0])) as Record<
    Role,
    number
  >;
  for (const row of rows) byRole[row.role] += 1;
  const locked = rows.filter((row) => row.status === "LOCKED").length;
  return { active: rows.length - locked, locked, byRole };
}

export async function listUsers(
  db: Database,
  filter: { role?: Role } = {},
): Promise<{ users: UserRow[]; counts: UserCounts }> {
  const all = (await db.select(rowColumns).from(user)).map(toUserRow);
  const shown = filter.role
    ? all.filter((row) => row.role === filter.role)
    : all;
  return { users: sortUsers(shown), counts: countUsers(all) };
}

export interface WithTempPassword {
  user: UserRow;
  /** Shown once to the director; only its hash is stored. */
  tempPassword: string;
}

export async function createUser(
  { db, auth }: UserServiceDeps,
  actor: Actor,
  input: CreateUserInput,
): Promise<ServiceResult<WithTempPassword>> {
  const tempPassword = generateTempPassword();
  try {
    const row = await db.transaction(async (tx) => {
      if (!(await isActiveDirector(tx, actor))) return "forbidden" as const;
      const [taken] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.username, input.username));
      if (taken) return null;
      const id = await insertUser(tx, auth, {
        ...input,
        password: tempPassword,
        mustChangePassword: true,
        tempPasswordExpiresAt: new Date(Date.now() + TEMP_PASSWORD_TTL_MS),
      });
      if (input.role === "SALES" && input.contractScope) {
        await tx
          .update(user)
          .set({ contractScope: input.contractScope })
          .where(eq(user.id, id));
      }
      // Never the temporary password (activity-log design D7).
      await logActivity(tx, actor, {
        action: "CREATE",
        document: userDocument({ id, username: input.username }),
        summary: joinParts(input.name, ROLE_LABELS[input.role]),
      });
      return loadRow(tx, id);
    });
    if (row === "forbidden") return forbidden();
    if (!row) return conflict(USER_MESSAGES.usernameTaken);
    return { ok: true, data: { user: row, tempPassword } };
  } catch (error: unknown) {
    // Two directors adding the same name at once: the unique index decides.
    if (isUniqueViolation(error)) return conflict(USER_MESSAGES.usernameTaken);
    throw error;
  }
}

export async function resetPassword(
  { db, auth }: UserServiceDeps,
  actor: Actor,
  targetId: string,
): Promise<ServiceResult<WithTempPassword>> {
  if (targetId === actor.id) return conflict(USER_MESSAGES.selfReset);
  const tempPassword = generateTempPassword();
  const hash = await hashPassword(auth, tempPassword);
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MS);
  return db.transaction(async (tx) => {
    if (!(await isActiveDirector(tx, actor))) return forbidden();
    const target = await lockRow(tx, targetId);
    if (!target) return notFound();
    if (isDemoMode() && isDemoAccount(target.username)) {
      return conflict(USER_MESSAGES.demoResetBlocked);
    }
    if (target.status !== "ACTIVE") return conflict(USER_MESSAGES.resetLocked);
    await setPassword(tx, target, hash, expiresAt);
    await logActivity(tx, actor, {
      action: "UPDATE",
      document: userDocument(target),
      summary: `Đặt lại mật khẩu cho ${target.username}`,
      sensitive: true,
    });
    return {
      ok: true as const,
      data: {
        user: {
          ...toUserRow(target),
          mustChangePassword: true,
          tempPasswordExpiresAt: expiresAt.toISOString(),
        },
        tempPassword,
      },
    };
  });
}

export async function unlockUser(
  { db, auth }: UserServiceDeps,
  actor: Actor,
  targetId: string,
): Promise<ServiceResult<WithTempPassword>> {
  const tempPassword = generateTempPassword();
  const hash = await hashPassword(auth, tempPassword);
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MS);
  return db.transaction(async (tx) => {
    const directors = await lockActiveDirectors(tx);
    if (!directors.includes(actor.id)) return forbidden();
    const target = await lockRow(tx, targetId);
    if (!target) return notFound();
    if (target.status === "ACTIVE")
      return conflict(USER_MESSAGES.alreadyActive);
    // A new password, so the one used before leaving no longer works.
    await setPassword(tx, target, hash, expiresAt);
    await tx
      .update(user)
      .set({ status: "ACTIVE", updatedAt: new Date() })
      .where(eq(user.id, targetId));
    await logActivity(tx, actor, {
      action: "UPDATE",
      document: userDocument(target),
      summary: `Mở khóa ${target.username}, cấp mật khẩu tạm mới`,
      changes: [statusChange(target.status as UserStatus, "ACTIVE")],
      sensitive: true,
    });
    return {
      ok: true as const,
      data: {
        user: {
          ...toUserRow(target),
          status: "ACTIVE",
          mustChangePassword: true,
          tempPasswordExpiresAt: expiresAt.toISOString(),
        },
        tempPassword,
      },
    };
  });
}

export async function lockUser(
  { db }: UserServiceDeps,
  actor: Actor,
  targetId: string,
): Promise<ServiceResult<{ user: UserRow }>> {
  if (targetId === actor.id) return conflict(USER_MESSAGES.selfLock);
  return db.transaction(async (tx) => {
    const directors = await lockActiveDirectors(tx);
    const target = await lockRow(tx, targetId);
    if (!target) return notFound();
    if (isDemoMode() && isDemoAccount(target.username)) {
      return conflict(USER_MESSAGES.demoLockBlocked);
    }
    if (leavesNoDirector(directors, target)) {
      return conflict(USER_MESSAGES.lastDirector);
    }
    if (!directors.includes(actor.id)) return forbidden();
    await tx
      .update(user)
      .set({ status: "LOCKED", updatedAt: new Date() })
      .where(eq(user.id, targetId));
    // Signed out everywhere, right away (D5).
    await tx.delete(session).where(eq(session.userId, targetId));
    await logActivity(tx, actor, {
      action: "UPDATE",
      document: userDocument(target),
      summary: `Khóa tài khoản ${target.username}`,
      changes: [statusChange(target.status as UserStatus, "LOCKED")],
      sensitive: true,
    });
    return {
      ok: true as const,
      data: { user: { ...toUserRow(target), status: "LOCKED" as const } },
    };
  });
}

/**
 * Signs an employee out of every device and forgets their trusted ones, even
 * with no session left: a lost phone's short session may be long over while
 * its trust still runs (0.2 số 148). The account stays usable.
 */
export async function signOutAllDevices(
  { db }: Pick<UserServiceDeps, "db">,
  actor: Actor,
  targetId: string,
  now: Date = new Date(),
): Promise<ServiceResult<{ count: number; forgotten: number }>> {
  if (targetId === actor.id) return conflict(USER_MESSAGES.selfSignOutAll);
  return db.transaction(async (tx) => {
    const target = await lockRow(tx, targetId);
    if (!target) return notFound();
    if (isDemoMode() && isDemoAccount(target.username)) {
      return conflict(USER_MESSAGES.demoSignOutBlocked);
    }
    const removed = await tx
      .delete(session)
      .where(eq(session.userId, targetId))
      .returning({
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        persistent: session.persistent,
      });
    const count = removed.filter((row) => isLiveDeviceSession(row, now)).length;
    const forgotten = await forgetCountingLive(tx, targetId, now);
    const counts = { sessions: count, trusted: forgotten };
    if (signOutOutcome(counts).log) {
      await logActivity(tx, actor, {
        action: "UPDATE",
        document: userDocument(target),
        summary: allDevicesSummary(target.username, counts),
        sensitive: true,
      });
    }
    return { ok: true as const, data: { count, forgotten } };
  });
}

export async function changeRole(
  { db }: UserServiceDeps,
  actor: Actor,
  targetId: string,
  role: Role,
): Promise<ServiceResult<{ user: UserRow }>> {
  if (targetId === actor.id) return conflict(USER_MESSAGES.selfRole);
  return db.transaction(async (tx) => {
    const directors = await lockActiveDirectors(tx);
    const target = await lockRow(tx, targetId);
    if (!target) return notFound();
    if (isDemoMode() && isDemoAccount(target.username)) {
      return conflict(USER_MESSAGES.demoRoleBlocked);
    }
    if (role !== "DIRECTOR" && leavesNoDirector(directors, target)) {
      return conflict(USER_MESSAGES.lastDirector);
    }
    if (!directors.includes(actor.id)) return forbidden();
    await tx
      .update(user)
      .set({ role, updatedAt: new Date() })
      .where(eq(user.id, targetId));
    const was = target.role as Role;
    const changes =
      was === role
        ? []
        : [
            {
              field: "role",
              label: "Vai trò",
              before: ROLE_LABELS[was],
              after: ROLE_LABELS[role],
            },
          ];
    await logActivity(tx, actor, {
      action: "UPDATE",
      document: userDocument(target),
      summary: `Vai trò ${target.username}: ${ROLE_LABELS[was]} → ${ROLE_LABELS[role]}`,
      changes,
      sensitive: true,
    });
    return {
      ok: true as const,
      data: { user: { ...toUserRow(target), role } },
    };
  });
}

/**
 * Contract scope of a SALES account (user-management spec "Đặt phạm vi hợp
 * đồng cho Kinh doanh"): only an active director, logged like a role.
 */
export async function changeContractScope(
  { db }: UserServiceDeps,
  actor: Actor,
  targetId: string,
  scope: ContractScope,
): Promise<ServiceResult<{ user: UserRow }>> {
  return db.transaction(async (tx) => {
    const directors = await lockActiveDirectors(tx);
    if (!directors.includes(actor.id)) return forbidden();
    const target = await lockRow(tx, targetId);
    if (!target) return notFound();
    if (target.role !== "SALES") return conflict(USER_MESSAGES.scopeNotSales);
    const was = parseContractScope(target.contractScope);
    await tx
      .update(user)
      .set({ contractScope: scope, updatedAt: new Date() })
      .where(eq(user.id, targetId));
    await logActivity(tx, actor, {
      action: "UPDATE",
      document: userDocument(target),
      summary: `Phạm vi hợp đồng ${target.username}: ${CONTRACT_SCOPE_LABELS[was]} → ${CONTRACT_SCOPE_LABELS[scope]}`,
      changes:
        was === scope
          ? []
          : [
              {
                field: "contractScope",
                label: "Phạm vi hợp đồng",
                before: CONTRACT_SCOPE_LABELS[was],
                after: CONTRACT_SCOPE_LABELS[scope],
              },
            ],
      sensitive: true,
    });
    return {
      ok: true as const,
      data: { user: { ...toUserRow(target), contractScope: scope } },
    };
  });
}

function statusChange(from: UserStatus, to: UserStatus) {
  return {
    field: "status",
    label: "Trạng thái",
    before: USER_STATUS_LABELS[from],
    after: USER_STATUS_LABELS[to],
  };
}

/**
 * Locks the rows of every active director, in id order so concurrent
 * changes queue up (design D6). Under READ COMMITTED a row changed by the
 * transaction we waited for is re-checked, so a director locked meanwhile
 * drops out of the result.
 */
async function lockActiveDirectors(tx: Executor): Promise<string[]> {
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "DIRECTOR"), eq(user.status, "ACTIVE")))
    .orderBy(asc(user.id))
    .for("update");
  return rows.map((row) => row.id);
}

/**
 * Is the actor still an active director, now, under the same row locks as
 * every other user change? withAuth checked at the start of the request;
 * another tab may have locked or demoted them since (design D6).
 */
async function isActiveDirector(tx: Executor, actor: Actor): Promise<boolean> {
  return (await lockActiveDirectors(tx)).includes(actor.id);
}

/** Would locking or demoting `target` leave no active director? */
function leavesNoDirector(
  directors: readonly string[],
  target: StoredRow,
): boolean {
  return directors.includes(target.id) && directors.length <= 1;
}

async function lockRow(tx: Executor, id: string): Promise<StoredRow | null> {
  const [row] = await tx
    .select(rowColumns)
    .from(user)
    .where(eq(user.id, id))
    .for("update");
  return row ?? null;
}

async function loadRow(tx: Executor, id: string): Promise<UserRow | null> {
  const [row] = await tx.select(rowColumns).from(user).where(eq(user.id, id));
  return row ? toUserRow(row) : null;
}

/**
 * New temporary password: must change at next sign-in, every session ends,
 * and a pending "too many tries" lock on the name is lifted.
 */
async function setPassword(
  tx: Executor,
  target: StoredRow,
  hash: string,
  expiresAt: Date = new Date(Date.now() + TEMP_PASSWORD_TTL_MS),
): Promise<void> {
  // A device trusted under the old password must enter a code again.
  await forgetTrustedDevices(tx, target.id);
  await tx
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(
      and(
        eq(account.userId, target.id),
        eq(account.providerId, CREDENTIAL_PROVIDER),
      ),
    );
  await tx
    .update(user)
    .set({
      mustChangePassword: true,
      tempPasswordExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(user.id, target.id));
  await tx.delete(session).where(eq(session.userId, target.id));
  await tx
    .delete(loginThrottle)
    .where(eq(loginThrottle.usernameKey, target.username));
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return cause?.code === "23505";
}

const conflict = (error: string) =>
  ({ ok: false, status: 409, error }) as const;
const notFound = () =>
  ({ ok: false, status: 404, error: USER_MESSAGES.notFound }) as const;
const forbidden = () =>
  ({ ok: false, status: 403, error: USER_MESSAGES.notDirector }) as const;

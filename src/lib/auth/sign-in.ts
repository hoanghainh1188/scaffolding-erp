// Sign-in with throttling, lock checks and session length (design D1, D3, D9).
import { eq } from "drizzle-orm";
import { isAPIError } from "better-auth/api";

import type { Database } from "@/db/client";
import { loginThrottle, session, user } from "@/db/schema";
import {
  evaluateLoginThrottle,
  recordFailure,
  type ThrottleState,
} from "@/domain/login-throttle";
import type { Role } from "@/domain/role";
import { isValidUsername, normalizeUsername } from "@/domain/username";
import { actorFromRequest } from "@/lib/activity/actor";
import { logActivity } from "@/lib/activity/log";

import type { Auth } from "./auth";
import { clientIp, consumeSignInAttempt } from "./rate-limit";

/** "Giữ đăng nhập" not ticked: the session ends 12 h after sign-in. */
export const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;

export const SIGN_IN_MESSAGES = {
  invalid: "Tên đăng nhập hoặc mật khẩu không đúng",
  throttled:
    "Nhập sai quá nhiều lần. Thử lại sau 15 phút hoặc nhờ Giám đốc đặt lại mật khẩu",
  rateLimited: "Thao tác quá nhanh. Thử lại sau ít phút",
  locked: "Tài khoản đã bị khóa. Liên hệ Giám đốc",
} as const;

export interface SignInInput {
  username: string;
  password: string;
  remember: boolean;
  /** Request headers: client address and User-Agent. */
  headers: Headers;
  now?: Date;
}

export interface SignedInUser {
  id: string;
  role: Role;
  mustChangePassword: boolean;
}

export type SignInResult =
  | { ok: true; user: SignedInUser; setCookies: string[] }
  | { ok: false; status: 401 | 403 | 429; error: string };

export interface SignInDeps {
  db: Database;
  auth: Auth;
  /** Sign-in attempts per IP per minute; 20 unless configured. */
  ipLimitPerMinute?: number;
}

export async function signIn(
  { db, auth, ipLimitPerMinute }: SignInDeps,
  input: SignInInput,
): Promise<SignInResult> {
  const now = input.now ?? new Date();
  const ip = clientIp(input.headers);
  if (!(await consumeSignInAttempt(db, ip, now, ipLimitPerMinute))) {
    return { ok: false, status: 429, error: SIGN_IN_MESSAGES.rateLimited };
  }

  const usernameKey = normalizeUsername(input.username);
  const throttle = await loadThrottle(db, usernameKey);
  if (evaluateLoginThrottle(throttle, now).locked) {
    return { ok: false, status: 429, error: SIGN_IN_MESSAGES.throttled };
  }

  const attempt = await tryPassword(auth, input);
  if (!attempt) {
    // A name that breaks the D17 rule cannot exist; counting it would only
    // let anyone fill the table with junk keys.
    if (isValidUsername(usernameKey)) {
      await recordFailedAttempt(db, usernameKey, now);
    }
    return { ok: false, status: 401, error: SIGN_IN_MESSAGES.invalid };
  }

  const [account] = await db
    .select({
      role: user.role,
      status: user.status,
      mustChange: user.mustChangePassword,
    })
    .from(user)
    .where(eq(user.id, attempt.userId));
  // Right password, locked account: say so, and drop the session just made.
  if (!account || account.status !== "ACTIVE") {
    await db.delete(session).where(eq(session.token, attempt.token));
    return { ok: false, status: 403, error: SIGN_IN_MESSAGES.locked };
  }

  await db
    .delete(loginThrottle)
    .where(eq(loginThrottle.usernameKey, usernameKey));
  if (!input.remember) {
    await db
      .update(session)
      .set({
        persistent: false,
        expiresAt: new Date(now.getTime() + SHORT_SESSION_MS),
      })
      .where(eq(session.token, attempt.token));
  }
  try {
    await recordSignIn(
      db,
      { id: attempt.userId, role: account.role as Role },
      input.headers,
      now,
    );
  } catch (error: unknown) {
    // No session without its log row (activity-log design D4).
    await db.delete(session).where(eq(session.token, attempt.token));
    throw error;
  }

  return {
    ok: true,
    user: {
      id: attempt.userId,
      role: account.role as Role,
      mustChangePassword: account.mustChange,
    },
    setCookies: attempt.setCookies,
  };
}

interface PasswordAttempt {
  userId: string;
  token: string;
  setCookies: string[];
}

/** Better Auth checks the password and creates the session; null if wrong. */
async function tryPassword(
  auth: Auth,
  input: SignInInput,
): Promise<PasswordAttempt | null> {
  try {
    const { headers, response } = await auth.api.signInUsername({
      body: {
        username: input.username,
        password: input.password,
        rememberMe: input.remember,
      },
      headers: input.headers,
      returnHeaders: true,
    });
    return {
      userId: response.user.id,
      token: response.token,
      setCookies: headers.getSetCookie(),
    };
  } catch (error: unknown) {
    // 401 wrong name/password, 422 a name that cannot exist (bad format).
    if (
      isAPIError(error) &&
      (error.statusCode === 401 || error.statusCode === 422)
    ) {
      return null;
    }
    throw error;
  }
}

async function loadThrottle(
  db: Database,
  usernameKey: string,
): Promise<ThrottleState | null> {
  const [row] = await db
    .select()
    .from(loginThrottle)
    .where(eq(loginThrottle.usernameKey, usernameKey));
  return row ?? null;
}

/**
 * One more wrong password for `usernameKey`. The row is locked while it is
 * read and rewritten, so concurrent failures are all counted.
 */
async function recordFailedAttempt(
  db: Database,
  usernameKey: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    // A zero-count row behaves like "no failures yet" in recordFailure.
    await tx
      .insert(loginThrottle)
      .values({
        usernameKey,
        failedCount: 0,
        firstFailedAt: now,
        lockedUntil: null,
      })
      .onConflictDoNothing();
    const [current] = await tx
      .select()
      .from(loginThrottle)
      .where(eq(loginThrottle.usernameKey, usernameKey))
      .for("update");
    await tx
      .update(loginThrottle)
      .set(recordFailure(current ?? null, now))
      .where(eq(loginThrottle.usernameKey, usernameKey));
  });
}

/**
 * The last sign-in of D17 and the SIGN_IN row of the activity log, in one
 * transaction (activity-log design D4).
 */
async function recordSignIn(
  db: Database,
  account: { id: string; role: Role },
  headers: Headers,
  now: Date,
): Promise<void> {
  const actor = actorFromRequest(account, headers);
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ lastLoginAt: now, lastLoginDevice: actor.device })
      .where(eq(user.id, account.id));
    await logActivity(
      tx,
      actor,
      { action: "SIGN_IN", summary: "Đăng nhập thành công" },
      { now },
    );
  });
}

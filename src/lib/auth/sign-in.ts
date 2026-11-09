// Sign-in with throttling, lock checks and session length (design D1, D3, D9).
import { and, eq } from "drizzle-orm";
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
import { saveChallenge } from "./two-factor-challenge";

/** "Giữ đăng nhập" not ticked: the session ends 12 h after sign-in. */
export const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;

export const SIGN_IN_MESSAGES = {
  invalid: "Tên đăng nhập hoặc mật khẩu không đúng",
  throttled:
    "Nhập sai quá nhiều lần. Thử lại sau 15 phút hoặc nhờ Giám đốc đặt lại mật khẩu",
  rateLimited: "Thao tác quá nhanh. Thử lại sau ít phút",
  locked: "Tài khoản đã bị khóa. Liên hệ Giám đốc",
  tempPasswordExpired: "Mật khẩu tạm đã hết hạn. Liên hệ Giám đốc để cấp lại",
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
  /** Right password; the code step comes next and no session exists yet. */
  | { ok: true; twoFactorRequired: true; setCookies: string[] }
  | { ok: false; status: 401 | 403 | 429; error: string };

/** How a sign-in reads in the activity log, when not the plain row. */
export interface SignInLogEntry {
  summary: string;
  sensitive?: boolean;
}

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
  const throttle = await loadThrottle(db, usernameKey, ip);
  if (evaluateLoginThrottle(throttle, now).locked) {
    return { ok: false, status: 429, error: SIGN_IN_MESSAGES.throttled };
  }

  const attempt = await tryPassword(auth, input);
  if (!attempt) {
    // A name that breaks the D17 rule cannot exist; counting it would only
    // let anyone fill the table with junk keys.
    if (isValidUsername(usernameKey)) {
      await recordFailedAttempt(db, usernameKey, ip, now);
    }
    return { ok: false, status: 401, error: SIGN_IN_MESSAGES.invalid };
  }

  const [account] = await db
    .select({
      id: user.id,
      role: user.role,
      status: user.status,
      mustChange: user.mustChangePassword,
      tempPasswordExpiresAt: user.tempPasswordExpiresAt,
    })
    .from(user)
    .where(eq(user.username, usernameKey));
  // Right password, locked account: say so, and drop the session just made.
  if (!account || account.status !== "ACTIVE") {
    await dropSession(db, attempt);
    return { ok: false, status: 403, error: SIGN_IN_MESSAGES.locked };
  }

  if (
    account.mustChange &&
    account.tempPasswordExpiresAt &&
    now.getTime() >= account.tempPasswordExpiresAt.getTime()
  ) {
    await dropSession(db, attempt);
    return {
      ok: false,
      status: 401,
      error: SIGN_IN_MESSAGES.tempPasswordExpired,
    };
  }

  if (attempt.kind === "challenge") {
    // The counter stays: only a right code clears it (design D3).
    await saveChallenge(db, auth, attempt.setCookies, {
      userId: account.id,
      usernameKey,
      remember: input.remember,
    });
    return {
      ok: true,
      twoFactorRequired: true,
      setCookies: attempt.setCookies,
    };
  }

  await finishSignIn(db, {
    token: attempt.token,
    usernameKey,
    ip,
    remember: input.remember,
    account: { id: account.id, role: account.role as Role },
    headers: input.headers,
    now,
  });

  return {
    ok: true,
    user: {
      id: account.id,
      role: account.role as Role,
      mustChangePassword: account.mustChange,
    },
    setCookies: attempt.setCookies,
  };
}

/** The steps every completed sign-in shares, whatever proved it. */
export async function finishSignIn(
  db: Database,
  input: {
    token: string;
    usernameKey: string;
    ip: string;
    remember: boolean;
    account: { id: string; role: Role };
    headers: Headers;
    now: Date;
    logEntry?: SignInLogEntry;
  },
): Promise<void> {
  await db
    .delete(loginThrottle)
    .where(
      and(
        eq(loginThrottle.usernameKey, input.usernameKey),
        eq(loginThrottle.ip, input.ip),
      ),
    );
  if (!input.remember) {
    await db
      .update(session)
      .set({
        persistent: false,
        expiresAt: new Date(input.now.getTime() + SHORT_SESSION_MS),
      })
      .where(eq(session.token, input.token));
  }
  try {
    await recordSignIn(
      db,
      input.account,
      input.headers,
      input.now,
      input.logEntry,
    );
  } catch (error: unknown) {
    // No session without its log row (activity-log design D4).
    await db.delete(session).where(eq(session.token, input.token));
    throw error;
  }
}

type PasswordAttempt =
  | { kind: "session"; userId: string; token: string; setCookies: string[] }
  | { kind: "challenge"; setCookies: string[] };

async function dropSession(
  db: Database,
  attempt: PasswordAttempt,
): Promise<void> {
  if (attempt.kind === "session") {
    await db.delete(session).where(eq(session.token, attempt.token));
  }
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
    const setCookies = headers.getSetCookie();
    // Better Auth's twoFactor plugin replaced the session with a challenge.
    if ("twoFactorRedirect" in response) {
      return { kind: "challenge", setCookies };
    }
    return {
      kind: "session",
      userId: response.user.id,
      token: response.token,
      setCookies,
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

export async function loadThrottle(
  db: Database,
  usernameKey: string,
  ip: string,
): Promise<ThrottleState | null> {
  const [row] = await db
    .select()
    .from(loginThrottle)
    .where(
      and(eq(loginThrottle.usernameKey, usernameKey), eq(loginThrottle.ip, ip)),
    );
  return row ?? null;
}

/**
 * One more wrong password for `(usernameKey, ip)`. The row is locked while it is
 * read and rewritten, so concurrent failures are all counted.
 */
export async function recordFailedAttempt(
  db: Database,
  usernameKey: string,
  ip: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    // A zero-count row behaves like "no failures yet" in recordFailure.
    await tx
      .insert(loginThrottle)
      .values({
        usernameKey,
        ip,
        failedCount: 0,
        firstFailedAt: now,
        lockedUntil: null,
      })
      .onConflictDoNothing();
    const [current] = await tx
      .select()
      .from(loginThrottle)
      .where(
        and(
          eq(loginThrottle.usernameKey, usernameKey),
          eq(loginThrottle.ip, ip),
        ),
      )
      .for("update");
    await tx
      .update(loginThrottle)
      .set(recordFailure(current ?? null, now))
      .where(
        and(
          eq(loginThrottle.usernameKey, usernameKey),
          eq(loginThrottle.ip, ip),
        ),
      );
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
  entry: SignInLogEntry = { summary: "Đăng nhập thành công" },
): Promise<void> {
  const actor = actorFromRequest(account, headers);
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ lastLoginAt: now, lastLoginDevice: actor.device })
      .where(eq(user.id, account.id));
    await logActivity(tx, actor, { action: "SIGN_IN", ...entry }, { now });
  });
}

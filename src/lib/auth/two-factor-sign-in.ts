// The code step of signing in (director-mfa design D2, D3).
import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { isAPIError } from "better-auth/api";

import { session, twoFactor, user } from "@/db/schema";
import { evaluateLoginThrottle } from "@/domain/login-throttle";
import type { Role } from "@/domain/role";
import {
  classifyCode,
  TOTP_REUSE_WINDOW_SECONDS,
  TRUST_DEVICE_DAYS,
  type OneTimeCode,
} from "@/domain/two-factor";

import { hashBackupCode } from "./backup-codes";
import { clientIp, consumeRateLimit, consumeSignInAttempt } from "./rate-limit";
import {
  finishSignIn,
  loadThrottle,
  recordFailedAttempt,
  SIGN_IN_MESSAGES,
  type SignedInUser,
  type SignInDeps,
  type SignInLogEntry,
} from "./sign-in";
import { dropChallenge, loadChallenge } from "./two-factor-challenge";

export const TWO_FACTOR_MESSAGES = {
  wrongCode: "Mã xác thực không đúng",
  expired: "Phiên nhập mã đã hết hạn. Đăng nhập lại",
  wrongPassword: "Mật khẩu hiện tại không đúng",
  demo: "Bản demo không dùng xác thực 2 lớp",
  unreadable: "Không đọc được dữ liệu xác thực. Liên hệ admin hệ thống",
  alreadyOn: "Tài khoản này đã bật xác thực 2 lớp",
} as const;

export interface CodeInput {
  code: string;
  /** "Tin thiết bị này 30 ngày"; ignored for a backup code. */
  trustDevice: boolean;
  headers: Headers;
  now?: Date;
}

export type CodeResult =
  | { ok: true; user: SignedInUser; setCookies: string[] }
  | {
      ok: false;
      status: 401 | 403 | 429 | 500;
      error: string;
      /** The browser must go back to the password step. */
      restart?: boolean;
    };

type Verified =
  | { ok: true; token: string; userId: string; setCookies: string[] }
  | { ok: false; reason: "WRONG" | "LOCKED" | "EXPIRED" | "UNREADABLE" };

/**
 * Atomic, so two requests with one code cannot both pass (design D3). A code
 * spent here while wrong costs nothing: it was not going to work.
 */
export function consumeTotpCode(
  db: SignInDeps["db"],
  userId: string,
  code: string,
  now: Date,
): Promise<boolean> {
  const digest = createHash("sha256").update(code).digest("hex");
  return consumeRateLimit(
    db,
    `totp-used:${userId}:${digest}`,
    now,
    1,
    TOTP_REUSE_WINDOW_SECONDS,
  );
}

/** Asks the plugin; turns its errors into what the sign-in needs to know. */
async function verifyWithPlugin(
  { auth }: SignInDeps,
  parsed: OneTimeCode,
  trustDevice: boolean,
  headers: Headers,
): Promise<Verified> {
  try {
    const { headers: responseHeaders, response } =
      parsed.kind === "TOTP"
        ? await auth.api.verifyTOTP({
            body: { code: parsed.code, trustDevice },
            headers,
            returnHeaders: true,
          })
        : await auth.api.verifyBackupCode({
            body: { code: hashBackupCode(parsed.code) },
            headers,
            returnHeaders: true,
          });
    if (!response.token) return { ok: false, reason: "EXPIRED" };
    return {
      ok: true,
      token: response.token,
      userId: response.user.id,
      setCookies: responseHeaders.getSetCookie(),
    };
  } catch (error: unknown) {
    if (!isAPIError(error)) {
      // The secret cannot be decrypted: a changed BETTER_AUTH_SECRET (D10).
      console.error("[auth] second factor check failed", error);
      return { ok: false, reason: "UNREADABLE" };
    }
    const code = error.body?.code;
    if (code === "ACCOUNT_TEMPORARILY_LOCKED") {
      return { ok: false, reason: "LOCKED" };
    }
    if (
      code === "INVALID_TWO_FACTOR_COOKIE" ||
      code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE"
    ) {
      return { ok: false, reason: "EXPIRED" };
    }
    return { ok: false, reason: "WRONG" };
  }
}

/**
 * The plugin prefers any session in the request over the challenge, so an
 * old session left in the browser would have its secret checked instead.
 */
async function withoutSessionCookie(
  auth: SignInDeps["auth"],
  headers: Headers,
): Promise<Headers> {
  const { name } = (await auth.$context).authCookies.sessionToken;
  const kept = (headers.get("cookie") ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair !== "" && !pair.startsWith(`${name}=`));
  const copy = new Headers(headers);
  copy.set("cookie", kept.join("; "));
  return copy;
}

async function backupCodesLeft(
  db: SignInDeps["db"],
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ backupCodes: twoFactor.backupCodes })
    .from(twoFactor)
    .where(eq(twoFactor.userId, userId));
  return row ? (JSON.parse(row.backupCodes) as string[]).length : 0;
}

async function logEntryFor(
  db: SignInDeps["db"],
  userId: string,
  parsed: OneTimeCode,
  trustDevice: boolean,
): Promise<SignInLogEntry | undefined> {
  if (parsed.kind === "BACKUP") {
    const left = await backupCodesLeft(db, userId);
    return {
      summary: `Đăng nhập bằng mã dự phòng, còn ${left} mã`,
      sensitive: true,
    };
  }
  if (trustDevice) {
    return {
      summary: `Đăng nhập thành công, tin thiết bị ${TRUST_DEVICE_DAYS} ngày`,
      sensitive: true,
    };
  }
  return undefined;
}

const expired: CodeResult = {
  ok: false,
  status: 401,
  error: TWO_FACTOR_MESSAGES.expired,
  restart: true,
};
const throttled: CodeResult = {
  ok: false,
  status: 429,
  error: SIGN_IN_MESSAGES.throttled,
};

export async function completeTwoFactorSignIn(
  deps: SignInDeps,
  input: CodeInput,
): Promise<CodeResult> {
  const { db, auth, ipLimitPerMinute } = deps;
  const now = input.now ?? new Date();
  const ip = clientIp(input.headers);
  if (!(await consumeSignInAttempt(db, ip, now, ipLimitPerMinute))) {
    return { ok: false, status: 429, error: SIGN_IN_MESSAGES.rateLimited };
  }

  const challenge = await loadChallenge(db, auth, input.headers, now);
  if (!challenge) return expired;
  const { usernameKey, userId, remember } = challenge;
  const throttle = await loadThrottle(db, usernameKey, ip);
  if (evaluateLoginThrottle(throttle, now).locked) return throttled;

  const wrong = async (): Promise<CodeResult> => {
    await recordFailedAttempt(db, usernameKey, ip, now);
    return { ok: false, status: 401, error: TWO_FACTOR_MESSAGES.wrongCode };
  };

  const parsed = classifyCode(input.code);
  if (!parsed) return wrong();
  if (
    parsed.kind === "TOTP" &&
    !(await consumeTotpCode(db, userId, parsed.code, now))
  ) {
    return wrong();
  }

  const trustDevice = parsed.kind === "TOTP" && input.trustDevice;
  const verified = await verifyWithPlugin(
    deps,
    parsed,
    trustDevice,
    await withoutSessionCookie(auth, input.headers),
  );
  if (!verified.ok) {
    if (verified.reason === "LOCKED") return throttled;
    if (verified.reason === "EXPIRED") return expired;
    if (verified.reason === "UNREADABLE") {
      return { ok: false, status: 500, error: TWO_FACTOR_MESSAGES.unreadable };
    }
    return wrong();
  }

  if (verified.userId !== userId) {
    await db.delete(session).where(eq(session.token, verified.token));
    return expired;
  }

  const [account] = await db
    .select({
      role: user.role,
      status: user.status,
      mustChange: user.mustChangePassword,
    })
    .from(user)
    .where(eq(user.id, verified.userId));
  if (!account || account.status !== "ACTIVE") {
    await db
      .delete(session)
      .where(
        and(
          eq(session.token, verified.token),
          eq(session.userId, verified.userId),
        ),
      );
    return { ok: false, status: 403, error: SIGN_IN_MESSAGES.locked };
  }

  const role = account.role as Role;
  await finishSignIn(db, {
    token: verified.token,
    usernameKey,
    ip,
    remember,
    account: { id: verified.userId, role },
    headers: input.headers,
    now,
    logEntry: await logEntryFor(db, verified.userId, parsed, trustDevice),
  });
  await dropChallenge(db, challenge.identifier);

  return {
    ok: true,
    user: {
      id: verified.userId,
      role,
      mustChangePassword: account.mustChange,
    },
    setCookies: verified.setCookies,
  };
}

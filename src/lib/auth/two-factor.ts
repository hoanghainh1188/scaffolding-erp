// Managing one's own second factor (director-mfa design D2, D4, D5, D7).
import { and, eq, ne } from "drizzle-orm";
import { isAPIError } from "better-auth/api";

import type { Database } from "@/db/client";
import { account, session, twoFactor, user } from "@/db/schema";
import {
  classifyCode,
  relabelTotpUri,
  secretTextOf,
  TWO_FACTOR_MANAGE_LIMIT_PER_MINUTE,
} from "@/domain/two-factor";
import type { ActivityActor } from "@/lib/activity/actor";
import { logActivity, type Tx } from "@/lib/activity/log";
import { getCompanyProfile } from "@/lib/company/service";
import { isDemoMode } from "@/lib/env";

import type { Auth } from "./auth";
import { hashBackupCode } from "./backup-codes";
import { CREDENTIAL_PROVIDER, verifyPassword } from "./credentials";
import { consumeRateLimit } from "./rate-limit";
import { countTrustedDevices, forgetTrustedDevices } from "./trusted-devices";
import { consumeTotpCode, TWO_FACTOR_MESSAGES } from "./two-factor-sign-in";

export interface TwoFactorDeps {
  db: Database;
  auth: Auth;
}

export type TwoFactorResult<T> =
  | { ok: true; data: T; setCookies?: string[] }
  | { ok: false; status: 400 | 403 | 404 | 409 | 429; error: string };

const fail = (
  status: 400 | 403 | 404 | 409 | 429,
  error: string,
): TwoFactorResult<never> => ({ ok: false, status, error });

const wrongPassword = () => fail(400, TWO_FACTOR_MESSAGES.wrongPassword);
const wrongCode = () => fail(400, TWO_FACTOR_MESSAGES.wrongCode);
const rateLimited = () => fail(429, "Thao tác quá nhanh. Thử lại sau ít phút");

const WINDOW_SECONDS = 60;

/** Guesses at one's own code, per account. */
export function consumeManageAttempt(
  db: Database,
  userId: string,
  now: Date,
): Promise<boolean> {
  return consumeRateLimit(
    db,
    `two-factor-manage:${userId}`,
    now,
    TWO_FACTOR_MANAGE_LIMIT_PER_MINUTE,
    WINDOW_SECONDS,
  );
}

/** Checked before a code is spent, so a wrong password cannot burn one. */
export async function isOwnPassword(
  { db, auth }: TwoFactorDeps,
  userId: string,
  password: string,
): Promise<boolean> {
  const [row] = await db
    .select({ hash: account.password })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, CREDENTIAL_PROVIDER),
      ),
    );
  return Boolean(row?.hash && (await verifyPassword(auth, row.hash, password)));
}

/** One's own app code or backup code, inside an open session. */
export async function verifyOwnCode(
  { db, auth }: TwoFactorDeps,
  userId: string,
  input: string,
  headers: Headers,
  now: Date,
): Promise<boolean> {
  const parsed = classifyCode(input);
  if (!parsed) return false;
  if (
    parsed.kind === "TOTP" &&
    !(await consumeTotpCode(db, userId, parsed.code, now))
  ) {
    return false;
  }
  try {
    if (parsed.kind === "TOTP") {
      await auth.api.verifyTOTP({ body: { code: parsed.code }, headers });
    } else {
      await auth.api.verifyBackupCode({
        body: { code: hashBackupCode(parsed.code), disableSession: true },
        headers,
      });
    }
    return true;
  } catch (error: unknown) {
    if (isAPIError(error)) return false;
    throw error;
  }
}

export interface SetupData {
  totpUri: string;
  secretText: string;
  backupCodes: string[];
}

/** Step 1 of turning it on. Nothing is on until the code is confirmed. */
export async function startTwoFactorSetup(
  { db, auth }: TwoFactorDeps,
  input: {
    userId: string;
    username: string;
    twoFactorEnabled: boolean;
    password: string;
    headers: Headers;
    now?: Date;
  },
): Promise<TwoFactorResult<SetupData>> {
  if (isDemoMode()) return fail(400, TWO_FACTOR_MESSAGES.demo);
  if (input.twoFactorEnabled) return fail(409, TWO_FACTOR_MESSAGES.alreadyOn);
  // A stolen session must not become a way to guess the password.
  if (
    !(await consumeManageAttempt(db, input.userId, input.now ?? new Date()))
  ) {
    return rateLimited();
  }
  const company = await getCompanyProfile(db);
  const issuer = company.shortName || auth.options.appName || "ERP";
  try {
    const response = await auth.api.enableTwoFactor({
      body: { password: input.password, issuer },
      headers: input.headers,
    });
    if (response.method !== "totp") throw new Error("expected a TOTP setup");
    const totpUri = relabelTotpUri(response.totpURI, issuer, input.username);
    return {
      ok: true,
      data: {
        totpUri,
        secretText: secretTextOf(totpUri),
        backupCodes: response.backupCodes,
      },
    };
  } catch (error: unknown) {
    if (isAPIError(error) && error.body?.code === "INVALID_PASSWORD") {
      return wrongPassword();
    }
    if (isAPIError(error) && error.body?.code === "TOTP_ALREADY_ENABLED") {
      return fail(409, TWO_FACTOR_MESSAGES.alreadyOn);
    }
    throw error;
  }
}

/** The new session the plugin made when it replaced the current one. */
async function newSessionToken(
  auth: Auth,
  setCookies: readonly string[],
): Promise<string | null> {
  const prefix = `${(await auth.$context).authCookies.sessionToken.name}=`;
  const line = setCookies.find((entry) => entry.startsWith(prefix));
  if (!line) return null;
  const value = decodeURIComponent(
    line.slice(prefix.length).split(";")[0] ?? "",
  );
  return value.split(".")[0] ?? null;
}

async function undoEnable(db: Database, userId: string): Promise<void> {
  await db.delete(twoFactor).where(eq(twoFactor.userId, userId));
  await db
    .update(user)
    .set({ twoFactorEnabled: false, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

const ownDocument = (actor: ActivityActor, username: string) => ({
  type: "USER" as const,
  id: actor.id,
  code: username,
});

/** Step 2: the code proves the phone has the secret. */
export async function confirmTwoFactorSetup(
  deps: TwoFactorDeps,
  input: {
    actor: ActivityActor;
    username: string;
    twoFactorEnabled: boolean;
    code: string;
    headers: Headers;
    now?: Date;
  },
): Promise<TwoFactorResult<{ enabled: true }>> {
  const { db, auth } = deps;
  const now = input.now ?? new Date();
  if (input.twoFactorEnabled) return fail(409, TWO_FACTOR_MESSAGES.alreadyOn);
  if (!(await consumeManageAttempt(db, input.actor.id, now))) {
    return rateLimited();
  }
  const parsed = classifyCode(input.code);
  if (parsed?.kind !== "TOTP") return wrongCode();
  let setCookies: string[];
  try {
    const { headers } = await auth.api.verifyTOTP({
      body: { code: parsed.code },
      headers: input.headers,
      returnHeaders: true,
    });
    setCookies = headers.getSetCookie();
  } catch (error: unknown) {
    if (isAPIError(error)) return wrongCode();
    throw error;
  }
  const keep = await newSessionToken(auth, setCookies);
  if (!keep) throw new Error("two-factor setup did not renew the session");
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(session)
        .where(
          and(eq(session.userId, input.actor.id), ne(session.token, keep)),
        );
      await logActivity(tx, input.actor, {
        action: "UPDATE",
        document: ownDocument(input.actor, input.username),
        summary: "Bật xác thực 2 lớp",
        sensitive: true,
      });
    });
  } catch (error: unknown) {
    // Never on without its log row (design D7).
    await undoEnable(db, input.actor.id);
    throw error;
  }
  return { ok: true, data: { enabled: true }, setCookies };
}

export async function regenerateBackupCodes(
  { db, auth }: TwoFactorDeps,
  input: {
    actor: ActivityActor;
    username: string;
    password: string;
    headers: Headers;
    now?: Date;
  },
): Promise<TwoFactorResult<{ backupCodes: string[] }>> {
  if (
    !(await consumeManageAttempt(db, input.actor.id, input.now ?? new Date()))
  ) {
    return rateLimited();
  }
  if (!(await isOwnPassword({ db, auth }, input.actor.id, input.password))) {
    return wrongPassword();
  }
  const { backupCodes } = await auth.api.generateBackupCodes({
    body: { password: input.password },
    headers: input.headers,
  });
  await db.transaction(async (tx) => {
    await logActivity(tx, input.actor, {
      action: "UPDATE",
      document: ownDocument(input.actor, input.username),
      summary: "Tạo lại mã dự phòng",
      sensitive: true,
    });
  });
  return { ok: true, data: { backupCodes } };
}

/** Removes the second factor itself; callers decide about sessions. */
export async function clearTwoFactor(tx: Tx, userId: string): Promise<void> {
  await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
  await tx
    .update(user)
    .set({ twoFactorEnabled: false, updatedAt: new Date() })
    .where(eq(user.id, userId));
  await forgetTrustedDevices(tx, userId);
}

/** "Đổi điện thoại": off now, and the D1 gate sends them to set it up again. */
export async function replaceTwoFactor(
  deps: TwoFactorDeps,
  input: {
    actor: ActivityActor;
    username: string;
    currentSessionId: string;
    password: string;
    code: string;
    headers: Headers;
    now?: Date;
  },
): Promise<TwoFactorResult<{ enabled: false }>> {
  const { db } = deps;
  const now = input.now ?? new Date();
  if (!(await consumeManageAttempt(db, input.actor.id, now))) {
    return rateLimited();
  }
  if (!(await isOwnPassword(deps, input.actor.id, input.password))) {
    return wrongPassword();
  }
  const verified = await verifyOwnCode(
    deps,
    input.actor.id,
    input.code,
    input.headers,
    now,
  );
  if (!verified) return wrongCode();
  await db.transaction(async (tx) => {
    await clearTwoFactor(tx, input.actor.id);
    await tx
      .delete(session)
      .where(
        and(
          eq(session.userId, input.actor.id),
          ne(session.id, input.currentSessionId),
        ),
      );
    await logActivity(tx, input.actor, {
      action: "UPDATE",
      document: ownDocument(input.actor, input.username),
      summary: "Đổi điện thoại xác thực 2 lớp",
      sensitive: true,
    });
  });
  return { ok: true, data: { enabled: false } };
}

export async function forgetDevices(
  { db }: Pick<TwoFactorDeps, "db">,
  input: { actor: ActivityActor; username: string },
): Promise<TwoFactorResult<{ forgotten: number }>> {
  const forgotten = await db.transaction(async (tx) => {
    const removed = await forgetTrustedDevices(tx, input.actor.id);
    await logActivity(tx, input.actor, {
      action: "UPDATE",
      document: ownDocument(input.actor, input.username),
      summary: "Quên mọi thiết bị đã tin",
      sensitive: true,
    });
    return removed;
  });
  return { ok: true, data: { forgotten } };
}

export interface TwoFactorStatus {
  backupCodesLeft: number;
  trustedDevices: number;
}

/** What /two-factor shows once it is on. Never the codes themselves. */
export async function readTwoFactorStatus(
  db: Database,
  userId: string,
  now: Date,
): Promise<TwoFactorStatus> {
  const [row] = await db
    .select({ backupCodes: twoFactor.backupCodes })
    .from(twoFactor)
    .where(eq(twoFactor.userId, userId));
  return {
    backupCodesLeft: row ? (JSON.parse(row.backupCodes) as string[]).length : 0,
    trustedDevices: await countTrustedDevices(db, userId, now),
  };
}

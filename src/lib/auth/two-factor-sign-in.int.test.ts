import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  activityLog,
  loginThrottle,
  session,
  twoFactor,
  user,
  verification,
} from "@/db/schema";
import { createAuth } from "@/lib/auth/auth";
import {
  TEST_BASE_URL,
  TEST_SECRET,
  createTestContext,
  createTestUser,
  resetAuthTables,
  type TestUser,
} from "@/test/auth";
import { cookiesOf, enroll, plainSession, totpCode } from "@/test/two-factor";

import { SIGN_IN_MESSAGES, signIn, SHORT_SESSION_MS } from "./sign-in";
import {
  completeTwoFactorSignIn,
  TWO_FACTOR_MESSAGES,
} from "./two-factor-sign-in";

const ctx = createTestContext();

afterAll(ctx.close);
beforeEach(() => resetAuthTables());

let ipCounter = 0;
const nextIp = () => `203.0.113.${(ipCounter = (ipCounter + 1) % 250)}`;

const headersFor = (ip: string, cookie = "") =>
  new Headers({
    "user-agent": "vitest",
    "x-forwarded-for": ip,
    ...(cookie ? { cookie } : {}),
  });

/** The password step; returns the browser's cookies for the code step. */
async function passwordStep(
  who: TestUser,
  ip: string,
  options: { remember?: boolean; password?: string; deps?: typeof ctx } = {},
) {
  const result = await signIn(options.deps ?? ctx, {
    username: who.username,
    password: options.password ?? who.password,
    remember: options.remember ?? true,
    headers: headersFor(ip),
  });
  return {
    result,
    cookie: result.ok ? cookiesOf(result.setCookies) : "",
  };
}

const codeStep = (
  ip: string,
  cookie: string,
  code: string,
  options: { trustDevice?: boolean; now?: Date; deps?: typeof ctx } = {},
) =>
  completeTwoFactorSignIn(options.deps ?? ctx, {
    code,
    trustDevice: options.trustDevice ?? false,
    headers: headersFor(ip, cookie),
    now: options.now,
  });

const director = (username = "minhanh") =>
  createTestUser(ctx, { role: "DIRECTOR", username });

const sessionCount = async (userId: string) =>
  (await ctx.db.select().from(session).where(eq(session.userId, userId)))
    .length;

/** Sessions other than the one kept from enrolment. */
async function dropSessions(userId: string) {
  await ctx.db.delete(session).where(eq(session.userId, userId));
}

const logRows = (userId: string) =>
  ctx.db.select().from(activityLog).where(eq(activityLog.userId, userId));

/** A live session that skips the code step: flag off, sign in, flag on. */
async function plainSessionOf(who: TestUser): Promise<string> {
  const setFlag = (on: boolean) =>
    ctx.db
      .update(user)
      .set({ twoFactorEnabled: on })
      .where(eq(user.id, who.id));
  await setFlag(false);
  const cookie = await plainSession(ctx, who);
  await setFlag(true);
  return cookie;
}

async function enrolled(username?: string) {
  const who = await director(username);
  const factor = await enroll(ctx, who);
  await dropSessions(who.id);
  return { who, ...factor };
}

describe("two-step sign-in", () => {
  it("creates no session until the code is right", async () => {
    const { who, secret } = await enrolled();
    const ip = nextIp();
    const { result, cookie } = await passwordStep(who, ip);
    expect(result).toMatchObject({ ok: true, twoFactorRequired: true });
    expect(await sessionCount(who.id)).toBe(0);

    const done = await codeStep(ip, cookie, totpCode(secret));
    expect(done).toMatchObject({ ok: true, user: { id: who.id } });
    expect(await sessionCount(who.id)).toBe(1);
    const rows = await logRows(who.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.summary).toBe("Đăng nhập thành công");
  });

  it("refuses a locked account at the password step", async () => {
    const { who } = await enrolled();
    await ctx.db.execute(
      `update "user" set status = 'LOCKED' where id = '${who.id}'`,
    );
    const { result } = await passwordStep(who, nextIp());
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: SIGN_IN_MESSAGES.locked,
    });
  });

  it("keeps the 'do not remember' choice from the password step", async () => {
    const { who, secret } = await enrolled();
    const ip = nextIp();
    const { cookie } = await passwordStep(who, ip, { remember: false });
    const before = Date.now();
    await codeStep(ip, cookie, totpCode(secret));
    const [row] = await ctx.db
      .select()
      .from(session)
      .where(eq(session.userId, who.id));
    expect(row?.persistent).toBe(false);
    expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(
      before + SHORT_SESSION_MS + 5_000,
    );
  });

  it("sends the browser back when the step has expired", async () => {
    const { who, secret } = await enrolled();
    const ip = nextIp();
    const { cookie } = await passwordStep(who, ip);
    const result = await codeStep(ip, cookie, totpCode(secret), {
      now: new Date(Date.now() + 11 * 60 * 1000),
    });
    expect(result).toEqual({
      ok: false,
      status: 401,
      error: TWO_FACTOR_MESSAGES.expired,
      restart: true,
    });
    expect(await sessionCount(who.id)).toBe(0);
  });

  it("ignores an old session of someone else in the browser", async () => {
    const other = await enrolled("thuha");
    const { who, secret } = await enrolled();
    const stale = await plainSessionOf(other.who);
    const ip = nextIp();
    const { cookie } = await passwordStep(who, ip);
    const result = await codeStep(ip, `${stale}; ${cookie}`, totpCode(secret));
    expect(result).toMatchObject({ ok: true, user: { id: who.id } });
  });

  it("refuses a forged challenge cookie", async () => {
    const { secret } = await enrolled();
    const name = (await ctx.auth.$context).createAuthCookie("two_factor").name;
    const result = await codeStep(
      nextIp(),
      `${name}=forged.value`,
      totpCode(secret),
    );
    expect(result).toMatchObject({ ok: false, restart: true });
  });
});

describe("wrong codes", () => {
  it("counts together with wrong passwords", async () => {
    const { who, secret } = await enrolled();
    const ip = nextIp();
    for (let i = 0; i < 3; i += 1) {
      await passwordStep(who, ip, { password: "sai-mat-khau" });
    }
    const { cookie } = await passwordStep(who, ip);
    await codeStep(ip, cookie, "000000");
    await codeStep(ip, cookie, "000001");
    const result = await codeStep(ip, cookie, totpCode(secret));
    expect(result).toEqual({
      ok: false,
      status: 429,
      error: SIGN_IN_MESSAGES.throttled,
    });
    expect(await sessionCount(who.id)).toBe(0);
  });

  it("is not reset by a right password", async () => {
    const { who, secret } = await enrolled();
    const ip = nextIp();
    const first = await passwordStep(who, ip);
    for (const code of ["000000", "000001", "000002", "000003"]) {
      await codeStep(ip, first.cookie, code);
    }
    const second = await passwordStep(who, ip);
    await codeStep(ip, second.cookie, "000004");
    const result = await codeStep(ip, second.cookie, totpCode(secret));
    expect(result).toMatchObject({ ok: false, status: 429 });
  });

  it("is reset by a right code", async () => {
    const { who, secret } = await enrolled();
    const ip = nextIp();
    const { cookie } = await passwordStep(who, ip);
    for (const code of ["000000", "000001", "000002", "000003"]) {
      await codeStep(ip, cookie, code);
    }
    expect(await codeStep(ip, cookie, totpCode(secret))).toMatchObject({
      ok: true,
    });
    const rows = await ctx.db
      .select()
      .from(loginThrottle)
      .where(eq(loginThrottle.ip, ip));
    expect(rows).toHaveLength(0);
  });

  it("locks the account after 10 misses from several addresses", async () => {
    const { who, secret } = await enrolled();
    let miss = 0;
    for (const count of [4, 3, 3]) {
      const ip = nextIp();
      const { cookie } = await passwordStep(who, ip);
      for (let i = 0; i < count; i += 1) {
        miss += 1;
        await codeStep(ip, cookie, String(miss).padStart(6, "0"));
      }
    }
    const ip = nextIp();
    const { cookie } = await passwordStep(who, ip);
    const locked = await codeStep(ip, cookie, totpCode(secret));
    expect(locked).toEqual({
      ok: false,
      status: 429,
      error: SIGN_IN_MESSAGES.throttled,
    });

    await ctx.db
      .update(twoFactor)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(twoFactor.userId, who.id));
    // The refused code above was spent; the app has moved on to the next.
    expect(
      await codeStep(ip, cookie, totpCode(secret, Date.now(), 1)),
    ).toMatchObject({ ok: true });
    const [row] = await ctx.db
      .select()
      .from(twoFactor)
      .where(eq(twoFactor.userId, who.id));
    expect(row?.failedVerificationCount).toBe(0);
  });
});

describe("a used code", () => {
  it("is refused while it is still valid", async () => {
    const { who, secret } = await enrolled();
    const code = totpCode(secret);
    const ipA = nextIp();
    const a = await passwordStep(who, ipA);
    expect(await codeStep(ipA, a.cookie, code)).toMatchObject({ ok: true });

    const ipB = nextIp();
    const b = await passwordStep(who, ipB);
    expect(await codeStep(ipB, b.cookie, code)).toEqual({
      ok: false,
      status: 401,
      error: TWO_FACTOR_MESSAGES.wrongCode,
    });
  });

  it("passes only once when sent twice at the same moment", async () => {
    const { who, secret } = await enrolled();
    const code = totpCode(secret);
    const [ipA, ipB] = [nextIp(), nextIp()];
    const a = await passwordStep(who, ipA);
    const b = await passwordStep(who, ipB);
    const results = await Promise.all([
      codeStep(ipA, a.cookie, code),
      codeStep(ipB, b.cookie, code),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });
});

describe("backup codes", () => {
  it("work once and say how many are left", async () => {
    const { who, backupCodes } = await enrolled();
    const code = backupCodes[0] ?? "";
    const ip = nextIp();
    const first = await passwordStep(who, ip);
    expect(await codeStep(ip, first.cookie, code)).toMatchObject({ ok: true });
    const rows = await logRows(who.id);
    expect(rows[0]?.summary).toBe("Đăng nhập bằng mã dự phòng, còn 9 mã");
    expect(rows[0]?.flags).toContain("SENSITIVE");
    expect(JSON.stringify(rows)).not.toContain(code);

    const ipB = nextIp();
    const again = await passwordStep(who, ipB);
    expect(await codeStep(ipB, again.cookie, code)).toEqual({
      ok: false,
      status: 401,
      error: TWO_FACTOR_MESSAGES.wrongCode,
    });
  });

  it("accept lower case without hyphens", async () => {
    const { who, backupCodes } = await enrolled();
    const typed = (backupCodes[1] ?? "").replaceAll("-", " ").toLowerCase();
    const ip = nextIp();
    const { cookie } = await passwordStep(who, ip);
    expect(await codeStep(ip, cookie, typed)).toMatchObject({ ok: true });
  });

  it("pass only once when sent twice at the same moment", async () => {
    const { who, backupCodes } = await enrolled();
    const code = backupCodes[2] ?? "";
    const [ipA, ipB] = [nextIp(), nextIp()];
    const a = await passwordStep(who, ipA);
    const b = await passwordStep(who, ipB);
    const results = await Promise.all([
      codeStep(ipA, a.cookie, code),
      codeStep(ipB, b.cookie, code),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });
});

describe("trusted devices", () => {
  const trustCookie = (setCookies: readonly string[]) =>
    cookiesOf(setCookies.filter((line) => line.includes("trust_device")));

  async function trustThisDevice() {
    const factor = await enrolled();
    const ip = nextIp();
    const { cookie } = await passwordStep(factor.who, ip);
    const done = await codeStep(ip, cookie, totpCode(factor.secret), {
      trustDevice: true,
    });
    if (!done.ok) throw new Error(done.error);
    return { ...factor, trust: trustCookie(done.setCookies) };
  }

  const signInOn = (who: TestUser, ip: string, cookie: string) =>
    signIn(ctx, {
      username: who.username,
      password: who.password,
      remember: true,
      headers: headersFor(ip, cookie),
    });

  it("logs the choice", async () => {
    const { who } = await trustThisDevice();
    const rows = await logRows(who.id);
    expect(rows[0]?.summary).toBe("Đăng nhập thành công, tin thiết bị 30 ngày");
    expect(rows[0]?.flags).toContain("SENSITIVE");
  });

  it("skip the code and still clear the counter", async () => {
    const { who, trust } = await trustThisDevice();
    const ip = nextIp();
    await passwordStep(who, ip, { password: "sai-mat-khau" });
    const result = await signInOn(who, ip, trust);
    expect(result).toMatchObject({ ok: true, user: { id: who.id } });
    const rows = await ctx.db
      .select()
      .from(loginThrottle)
      .where(eq(loginThrottle.ip, ip));
    expect(rows).toHaveLength(0);
    const log = await logRows(who.id);
    const plain = log.filter((row) => row.summary === "Đăng nhập thành công");
    expect(plain).toHaveLength(1);
    expect(plain[0]?.flags).not.toContain("SENSITIVE");
  });

  it("still need the password", async () => {
    const { who, trust } = await trustThisDevice();
    const result = await signIn(ctx, {
      username: who.username,
      password: "sai-mat-khau",
      remember: true,
      headers: headersFor(nextIp(), trust),
    });
    expect(result).toEqual({
      ok: false,
      status: 401,
      error: SIGN_IN_MESSAGES.invalid,
    });
  });

  it("ask for the code again after 30 days", async () => {
    const { who, trust } = await trustThisDevice();
    await ctx.db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        and(
          like(verification.identifier, "trust-device-%"),
          eq(verification.value, who.id),
        ),
      );
    expect(await signInOn(who, nextIp(), trust)).toMatchObject({
      ok: true,
      twoFactorRequired: true,
    });
  });

  it("renew the 30 days at each sign-in", async () => {
    const { who, trust } = await trustThisDevice();
    const rows = () =>
      ctx.db
        .select()
        .from(verification)
        .where(
          and(
            like(verification.identifier, "trust-device-%"),
            eq(verification.value, who.id),
          ),
        );
    const [before] = await rows();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await signInOn(who, nextIp(), trust);
    const [after] = await rows();
    expect(after?.identifier).not.toBe(before?.identifier);
    expect(after?.expiresAt.getTime()).toBeGreaterThan(
      before?.expiresAt.getTime() ?? 0,
    );
  });

  it("cannot be set with a backup code", async () => {
    const { who, backupCodes } = await enrolled();
    const ip = nextIp();
    const { cookie } = await passwordStep(who, ip);
    const done = await codeStep(ip, cookie, backupCodes[0] ?? "", {
      trustDevice: true,
    });
    expect(done).toMatchObject({ ok: true });
    if (done.ok) expect(trustCookie(done.setCookies)).toBe("");
    const rows = await ctx.db
      .select()
      .from(verification)
      .where(
        and(
          like(verification.identifier, "trust-device-%"),
          eq(verification.value, who.id),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  it("keep a short session short", async () => {
    const factor = await enrolled();
    const ip = nextIp();
    const { cookie } = await passwordStep(factor.who, ip, { remember: false });
    await codeStep(ip, cookie, totpCode(factor.secret), { trustDevice: true });
    const [row] = await ctx.db
      .select()
      .from(session)
      .where(eq(session.userId, factor.who.id));
    expect(row?.persistent).toBe(false);
  });
});

describe("changing the secret key", () => {
  afterAll(() => vi.unstubAllEnvs());

  it("still reads a secret when the old key is kept in rotation", async () => {
    const { who, secret } = await enrolled();
    // BETTER_AUTH_SECRET stays the old key: data written before the first
    // rotation has no version and is read with it (design D10).
    vi.stubEnv(
      "BETTER_AUTH_SECRETS",
      "1:rotated-secret-0123456789abcdefghijkl",
    );
    const rotated = createAuth({
      db: ctx.db,
      secret: TEST_SECRET,
      baseURL: TEST_BASE_URL,
    });
    vi.unstubAllEnvs();
    const deps = { ...ctx, auth: rotated };
    const ip = nextIp();
    const { cookie } = await passwordStep(who, ip, { deps });
    expect(
      await codeStep(ip, cookie, totpCode(secret), { deps }),
    ).toMatchObject({ ok: true });
  });

  it("reports a clear error when the key is gone", async () => {
    const { who, secret } = await enrolled();
    const deps = {
      ...ctx,
      auth: createAuth({
        db: ctx.db,
        secret: "another-secret-0123456789abcdefghijklmn",
        baseURL: TEST_BASE_URL,
      }),
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const ip = nextIp();
    const { cookie } = await passwordStep(who, ip, { deps });
    const result = await codeStep(ip, cookie, totpCode(secret), { deps });
    expect(result).toEqual({
      ok: false,
      status: 500,
      error: TWO_FACTOR_MESSAGES.unreadable,
    });
    error.mockRestore();
  });
});

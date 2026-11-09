import { and, eq, like } from "drizzle-orm";
import {
  afterEach,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  activityLog,
  session,
  twoFactor,
  user,
  verification,
} from "@/db/schema";
import { actorFromRequest } from "@/lib/activity/actor";
import { resetPassword } from "@/lib/users/service";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
  type TestUser,
} from "@/test/auth";
import {
  cookiesOf,
  enroll,
  plainSession,
  secretOf,
  totpCode,
} from "@/test/two-factor";

import { changePassword } from "./change-password";
import { resolveCurrentUser } from "./session";
import {
  confirmTwoFactorSetup,
  forgetDevices,
  readTwoFactorStatus,
  regenerateBackupCodes,
  replaceTwoFactor,
  startTwoFactorSetup,
} from "./two-factor";
import { TWO_FACTOR_MESSAGES } from "./two-factor-sign-in";

const ctx = createTestContext();

afterAll(ctx.close);
beforeEach(() => resetAuthTables());
afterEach(() => vi.unstubAllEnvs());

const headersOf = (cookie: string) =>
  new Headers({
    cookie,
    "user-agent": "vitest",
    "x-forwarded-for": "198.18.0.1",
  });

const makeUser = (role: TestUser["role"] = "DIRECTOR", username = "minhanh") =>
  createTestUser(ctx, { role, username });

const start = (who: TestUser, cookie: string, password = who.password) =>
  startTwoFactorSetup(ctx, {
    userId: who.id,
    username: who.username,
    twoFactorEnabled: false,
    password,
    headers: headersOf(cookie),
  });

const confirm = (who: TestUser, cookie: string, code: string) =>
  confirmTwoFactorSetup(ctx, {
    actor: who,
    username: who.username,
    twoFactorEnabled: false,
    code,
    headers: headersOf(cookie),
  });

const flagOf = async (id: string) => {
  const [row] = await ctx.db
    .select({ on: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, id));
  return row?.on;
};

const rowOf = async (id: string) => {
  const [row] = await ctx.db
    .select()
    .from(twoFactor)
    .where(eq(twoFactor.userId, id));
  return row;
};

const logs = (id: string) =>
  ctx.db.select().from(activityLog).where(eq(activityLog.userId, id));

const addTrusted = (userId: string, name: string) =>
  ctx.db.insert(verification).values({
    id: name,
    identifier: `trust-device-${name}`,
    value: userId,
    expiresAt: new Date(Date.now() + 86_400_000),
  });

const trustedCount = async (userId: string) =>
  (
    await ctx.db
      .select()
      .from(verification)
      .where(
        and(
          like(verification.identifier, "trust-device-%"),
          eq(verification.value, userId),
        ),
      )
  ).length;

describe("turning it on", () => {
  it("needs the right password", async () => {
    const who = await makeUser();
    const cookie = await plainSession(ctx, who);
    expect(await start(who, cookie, "sai-mat-khau")).toEqual({
      ok: false,
      status: 400,
      error: TWO_FACTOR_MESSAGES.wrongPassword,
    });
    expect(await rowOf(who.id)).toBeUndefined();
  });

  it("limits password guesses per account", async () => {
    const who = await makeUser();
    const cookie = await plainSession(ctx, who);
    let last;
    for (let i = 0; i < 6; i += 1) {
      last = await start(who, cookie, `sai-mat-khau-${i}`);
    }
    expect(last).toMatchObject({ ok: false, status: 429 });
  });

  it("stays off after a wrong code", async () => {
    const who = await makeUser();
    const cookie = await plainSession(ctx, who);
    await start(who, cookie);
    expect(await confirm(who, cookie, "000000")).toEqual({
      ok: false,
      status: 400,
      error: TWO_FACTOR_MESSAGES.wrongCode,
    });
    expect(await flagOf(who.id)).toBe(false);
  });

  it("starts over with a new secret after being abandoned", async () => {
    const who = await makeUser();
    const cookie = await plainSession(ctx, who);
    const first = await start(who, cookie);
    const second = await start(who, cookie);
    if (!first.ok || !second.ok) throw new Error("setup failed");
    expect(secretOf(second.data.totpUri)).not.toBe(
      secretOf(first.data.totpUri),
    );
    expect(await flagOf(who.id)).toBe(false);
  });

  it("labels the app entry with the login name", async () => {
    const who = await makeUser();
    const cookie = await plainSession(ctx, who);
    const result = await start(who, cookie);
    if (!result.ok) throw new Error("setup failed");
    expect(result.data.totpUri).toContain(":minhanh?");
    expect(result.data.totpUri).not.toContain("users.invalid");
    expect(result.data.backupCodes).toHaveLength(10);
  });

  it("is refused in demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const who = await makeUser();
    const cookie = await plainSession(ctx, who);
    expect(await start(who, cookie)).toEqual({
      ok: false,
      status: 400,
      error: TWO_FACTOR_MESSAGES.demo,
    });
  });

  it("turns on, keeps this session, ends the others, stores no secret", async () => {
    const who = await makeUser();
    const other = await plainSession(ctx, who);
    const cookie = await plainSession(ctx, who);
    const started = await start(who, cookie);
    if (!started.ok) throw new Error("setup failed");
    const secret = secretOf(started.data.totpUri);

    const result = await confirm(who, cookie, totpCode(secret));
    expect(result).toMatchObject({ ok: true, data: { enabled: true } });
    if (!result.ok) return;
    expect(await flagOf(who.id)).toBe(true);

    const current = await resolveCurrentUser(
      ctx.auth,
      headersOf(cookiesOf(result.setCookies ?? [])),
    );
    expect(current?.id).toBe(who.id);
    expect(current?.mustEnrollTwoFactor).toBe(false);
    expect(await resolveCurrentUser(ctx.auth, headersOf(other))).toBeNull();
    const sessions = await ctx.db
      .select()
      .from(session)
      .where(eq(session.userId, who.id));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.persistent).toBe(true);

    const row = await rowOf(who.id);
    expect(row?.secret).not.toContain(secret);
    for (const code of started.data.backupCodes) {
      expect(row?.backupCodes).not.toContain(code);
    }
    const rows = await logs(who.id);
    expect(rows.map((entry) => entry.summary)).toEqual(["Bật xác thực 2 lớp"]);
    expect(rows[0]?.flags).toContain("SENSITIVE");
  });

  it("is undone when the log row cannot be written", async () => {
    const who = await makeUser();
    const cookie = await plainSession(ctx, who);
    const started = await start(who, cookie);
    if (!started.ok) throw new Error("setup failed");
    const spy = vi
      .spyOn(ctx.db, "transaction")
      .mockRejectedValueOnce(new Error("log failed"));
    await expect(
      confirm(who, cookie, totpCode(secretOf(started.data.totpUri))),
    ).rejects.toThrow("log failed");
    spy.mockRestore();
    expect(await flagOf(who.id)).toBe(false);
    expect(await rowOf(who.id)).toBeUndefined();
  });
});

describe("once it is on", () => {
  async function on() {
    const who = await makeUser();
    const factor = await enroll(ctx, who);
    return { who, ...factor };
  }

  it("makes new backup codes and retires the old ones", async () => {
    const { who, cookie, backupCodes } = await on();
    const result = await regenerateBackupCodes(ctx, {
      actor: who,
      username: who.username,
      password: who.password,
      headers: headersOf(cookie),
    });
    if (!result.ok) throw new Error("regenerate failed");
    expect(result.data.backupCodes).toHaveLength(10);
    expect(result.data.backupCodes).not.toContain(backupCodes[0]);
    const status = await readTwoFactorStatus(ctx.db, who.id, new Date());
    expect(status.backupCodesLeft).toBe(10);
    expect((await logs(who.id)).at(-1)?.summary).toBe("Tạo lại mã dự phòng");
  });

  it("limits password guesses for new backup codes", async () => {
    const { who, cookie } = await on();
    let last;
    for (let i = 0; i < 6; i += 1) {
      last = await regenerateBackupCodes(ctx, {
        actor: who,
        username: who.username,
        password: `sai-mat-khau-${i}`,
        headers: headersOf(cookie),
      });
    }
    expect(last).toMatchObject({ ok: false, status: 429 });
  });

  it("refuses new backup codes on a wrong password", async () => {
    const { who, cookie } = await on();
    const result = await regenerateBackupCodes(ctx, {
      actor: who,
      username: who.username,
      password: "sai-mat-khau",
      headers: headersOf(cookie),
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  const replace = (
    who: TestUser,
    cookie: string,
    sessionId: string,
    code: string,
    password = who.password,
  ) =>
    replaceTwoFactor(ctx, {
      actor: who,
      username: who.username,
      currentSessionId: sessionId,
      password,
      code,
      headers: headersOf(cookie),
    });

  const sessionIdOf = async (cookie: string) => {
    const current = await resolveCurrentUser(ctx.auth, headersOf(cookie));
    return current?.sessionId ?? "";
  };

  it("replaces the phone with an app code", async () => {
    const { who, cookie, secret } = await on();
    await addTrusted(who.id, "a");
    await addTrusted(who.id, "b");
    const other = await ctx.db.select().from(session);
    expect(other).toHaveLength(1);
    const result = await replace(
      who,
      cookie,
      await sessionIdOf(cookie),
      totpCode(secret),
    );
    expect(result).toEqual({ ok: true, data: { enabled: false } });
    expect(await rowOf(who.id)).toBeUndefined();
    expect(await flagOf(who.id)).toBe(false);
    expect(await trustedCount(who.id)).toBe(0);
    const current = await resolveCurrentUser(ctx.auth, headersOf(cookie));
    expect(current?.mustEnrollTwoFactor).toBe(true);
  });

  it("replaces the phone with a backup code", async () => {
    const { who, cookie, backupCodes } = await on();
    expect(
      await replace(
        who,
        cookie,
        await sessionIdOf(cookie),
        backupCodes[0] ?? "",
      ),
    ).toMatchObject({ ok: true });
  });

  it("keeps everything on a wrong code", async () => {
    const { who, cookie } = await on();
    expect(
      await replace(who, cookie, await sessionIdOf(cookie), "000000"),
    ).toEqual({
      ok: false,
      status: 400,
      error: TWO_FACTOR_MESSAGES.wrongCode,
    });
    expect(await flagOf(who.id)).toBe(true);
  });

  it("does not spend a backup code on a wrong password", async () => {
    const { who, cookie, backupCodes } = await on();
    await replace(
      who,
      cookie,
      await sessionIdOf(cookie),
      backupCodes[0] ?? "",
      "sai-mat-khau",
    );
    const status = await readTwoFactorStatus(ctx.db, who.id, new Date());
    expect(status.backupCodesLeft).toBe(10);
  });

  it("limits guesses per account", async () => {
    const { who, cookie } = await on();
    const id = await sessionIdOf(cookie);
    let last;
    for (let i = 0; i < 6; i += 1) {
      last = await replace(who, cookie, id, String(i).padStart(6, "0"));
    }
    expect(last).toMatchObject({ ok: false, status: 429 });
  });

  it("forgets every trusted device and counts only live ones", async () => {
    const { who } = await on();
    await addTrusted(who.id, "a");
    await addTrusted(who.id, "b");
    await ctx.db.insert(verification).values({
      id: "old",
      identifier: "trust-device-old",
      value: who.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    const before = await readTwoFactorStatus(ctx.db, who.id, new Date());
    expect(before.trustedDevices).toBe(2);
    const result = await forgetDevices(ctx, {
      actor: who,
      username: who.username,
    });
    expect(result).toEqual({ ok: true, data: { forgotten: 3 } });
    expect((await logs(who.id)).at(-1)?.summary).toBe(
      "Quên mọi thiết bị đã tin",
    );
  });

  it("forgets trusted devices when the password changes", async () => {
    const { who, cookie } = await on();
    await addTrusted(who.id, "a");
    const newPassword = "bai-sau-kho-9";
    const result = await changePassword(ctx, {
      actor: actorFromRequest(who, headersOf(cookie)),
      currentSessionId: await sessionIdOf(cookie),
      currentPassword: who.password,
      newPassword,
      confirmPassword: newPassword,
    });
    expect(result.ok).toBe(true);
    expect(await trustedCount(who.id)).toBe(0);
  });

  it("forgets trusted devices when the password is reset", async () => {
    const director = await makeUser("DIRECTOR", "giamdoc2");
    const { who } = await (async () => {
      const target = await makeUser("ACCOUNTANT", "thuha");
      await enroll(ctx, target);
      return { who: target };
    })();
    await addTrusted(who.id, "a");
    const result = await resetPassword(ctx, director, who.id);
    expect(result.ok).toBe(true);
    expect(await trustedCount(who.id)).toBe(0);
  });
});

describe("who must have it", () => {
  const current = (cookie: string) =>
    resolveCurrentUser(ctx.auth, headersOf(cookie));

  it("gates directors and accountants, not sales", async () => {
    const director = await makeUser("DIRECTOR", "minhanh");
    const accountant = await makeUser("ACCOUNTANT", "thuha");
    const sales = await makeUser("SALES", "quocbao");
    expect(
      (await current(await plainSession(ctx, director)))?.mustEnrollTwoFactor,
    ).toBe(true);
    expect(
      (await current(await plainSession(ctx, accountant)))?.mustEnrollTwoFactor,
    ).toBe(true);
    expect(
      (await current(await plainSession(ctx, sales)))?.mustEnrollTwoFactor,
    ).toBe(false);
  });

  it("does not gate anyone in demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const director = await makeUser("DIRECTOR", "giamdoc");
    expect(
      (await current(await plainSession(ctx, director)))?.mustEnrollTwoFactor,
    ).toBe(false);
  });

  it("applies at once when a role changes", async () => {
    const who = await makeUser("SALES", "lanphuong");
    const cookie = await plainSession(ctx, who);
    expect((await current(cookie))?.mustEnrollTwoFactor).toBe(false);
    await ctx.db
      .update(user)
      .set({ role: "DIRECTOR" })
      .where(eq(user.id, who.id));
    expect((await current(cookie))?.mustEnrollTwoFactor).toBe(true);
  });

  it("gates a flagged account of any role", async () => {
    const who = await makeUser("SALES", "quocbao");
    const cookie = await plainSession(ctx, who);
    await ctx.db
      .update(user)
      .set({ systemAdmin: true })
      .where(eq(user.id, who.id));
    expect(await current(cookie)).toMatchObject({
      systemAdmin: true,
      mustEnrollTwoFactor: true,
    });
  });
});

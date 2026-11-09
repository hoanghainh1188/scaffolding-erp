import { and, eq, like } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { activityLog, session, user, verification } from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { signOutAllDevices, USER_MESSAGES } from "@/lib/users/service";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
  signInAs,
  type TestUser,
} from "@/test/auth";
import { cookiesOf, enroll, totpCode } from "@/test/two-factor";

import { resolveCurrentUser } from "./session";
import {
  DEVICE_SESSION_MESSAGES,
  listDeviceSessions,
  signOutDevice,
  signOutOtherDevices,
} from "./sessions";
import { signIn } from "./sign-in";
import { completeTwoFactorSignIn } from "./two-factor-sign-in";

vi.mock("@/lib/activity/log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/activity/log")>();
  return { ...actual, logActivity: vi.fn(actual.logActivity) };
});

const ctx = createTestContext();

afterAll(ctx.close);
beforeEach(() => resetAuthTables());
afterEach(() => vi.unstubAllEnvs());

const DAY = 86_400_000;

const sales = (username = "quocbao") =>
  createTestUser(ctx, { role: "SALES", username });
const director = (username = "minhanh") =>
  createTestUser(ctx, { role: "DIRECTOR", username });

const current = (cookie: string) =>
  resolveCurrentUser(ctx.auth, new Headers({ cookie }));

async function idOf(cookie: string): Promise<string> {
  const found = await current(cookie);
  if (!found) throw new Error("expected a live session");
  return found.sessionId;
}

const logsOf = (userId: string) =>
  ctx.db
    .select({
      summary: activityLog.summary,
      flags: activityLog.flags,
      documentCode: activityLog.documentCode,
    })
    .from(activityLog)
    .where(
      and(eq(activityLog.userId, userId), eq(activityLog.action, "UPDATE")),
    );

const sessionsOf = (userId: string) =>
  ctx.db.select().from(session).where(eq(session.userId, userId));

const trust = (userId: string, id: string, expiresIn = DAY) =>
  ctx.db.insert(verification).values({
    id,
    identifier: `trust-device-${id}`,
    value: userId,
    expiresAt: new Date(Date.now() + expiresIn),
  });

const trustedOf = (userId: string) =>
  ctx.db
    .select()
    .from(verification)
    .where(
      and(
        like(verification.identifier, "trust-device-%"),
        eq(verification.value, userId),
      ),
    );

const self = (who: TestUser, currentSessionId: string) => ({
  actor: who,
  username: who.username,
  currentSessionId,
});

describe("listDeviceSessions", () => {
  it("shows only the user's own live sessions, this device first", async () => {
    const who = await sales();
    const other = await sales("thuha");
    const first = await signInAs(ctx, who);
    const second = await signInAs(ctx, who);
    await signInAs(ctx, other);
    await ctx.db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(session.id, await idOf(first)));
    const here = await idOf(second);

    const rows = await listDeviceSessions(ctx, {
      ...self(who, here),
      now: new Date(),
    });

    expect(rows?.map((row) => row.id)).toEqual([here]);
    expect(rows?.[0]?.isCurrent).toBe(true);
  });

  it("never carries a token or an address", async () => {
    const who = await sales();
    const cookie = await signInAs(ctx, who);
    await ctx.db
      .update(session)
      .set({ ipAddress: "203.0.113.9" })
      .where(eq(session.userId, who.id));
    const [row] = await sessionsOf(who.id);

    const rows = await listDeviceSessions(ctx, {
      ...self(who, await idOf(cookie)),
      now: new Date(),
    });

    const text = JSON.stringify(rows);
    expect(text).not.toContain(row?.token);
    expect(text).not.toContain("203.0.113.9");
  });

  it("does not read a shared demo account", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const who = await sales("thukho");
    const cookie = await signInAs(ctx, who);
    expect(
      await listDeviceSessions(ctx, {
        ...self(who, await idOf(cookie)),
        now: new Date(),
      }),
    ).toBeNull();
  });
});

describe("signOutDevice", () => {
  async function twoDevices() {
    const who = await sales();
    const here = await signInAs(ctx, who);
    const there = await signInAs(ctx, who);
    return { who, here, there, hereId: await idOf(here) };
  }

  it("ends that session at once and logs it", async () => {
    const { who, here, there, hereId } = await twoDevices();
    const result = await signOutDevice(ctx, {
      ...self(who, hereId),
      sessionId: await idOf(there),
    });

    expect(result).toEqual({ ok: true, data: { signedOut: true } });
    expect(await current(there)).toBeNull();
    expect(await current(here)).not.toBeNull();
    const logs = await logsOf(who.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.summary).toBe("Đăng xuất máy khác: Máy tính · Khác");
    expect(logs[0]?.flags).toContain("SENSITIVE");
    expect(logs[0]?.documentCode).toBe(who.username);
  });

  it("refuses this device", async () => {
    const { who, here, hereId } = await twoDevices();
    expect(
      await signOutDevice(ctx, { ...self(who, hereId), sessionId: hereId }),
    ).toEqual({
      ok: false,
      status: 400,
      error: DEVICE_SESSION_MESSAGES.thisDevice,
    });
    expect(await current(here)).not.toBeNull();
  });

  it("answers 404 for someone else's session and changes nothing", async () => {
    const { who, hereId } = await twoDevices();
    const other = await sales("thuha");
    const theirs = await signInAs(ctx, other);

    expect(
      await signOutDevice(ctx, {
        ...self(who, hereId),
        sessionId: await idOf(theirs),
      }),
    ).toEqual({
      ok: false,
      status: 404,
      error: DEVICE_SESSION_MESSAGES.alreadyGone,
    });
    expect(await current(theirs)).not.toBeNull();
    expect(await logsOf(who.id)).toHaveLength(0);
  });

  it("answers 404 the second time", async () => {
    const { who, there, hereId } = await twoDevices();
    const sessionId = await idOf(there);
    await signOutDevice(ctx, { ...self(who, hereId), sessionId });
    const again = await signOutDevice(ctx, {
      ...self(who, hereId),
      sessionId,
    });
    expect(again).toMatchObject({ ok: false, status: 404 });
    expect(await logsOf(who.id)).toHaveLength(1);
  });

  it("does not forget trusted devices", async () => {
    const { who, there, hereId } = await twoDevices();
    await trust(who.id, "t1");
    await signOutDevice(ctx, {
      ...self(who, hereId),
      sessionId: await idOf(there),
    });
    expect(await trustedOf(who.id)).toHaveLength(1);
  });

  it("refuses a shared demo account", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const who = await sales("thukho");
    const here = await signInAs(ctx, who);
    const there = await signInAs(ctx, who);
    expect(
      await signOutDevice(ctx, {
        ...self(who, await idOf(here)),
        sessionId: await idOf(there),
      }),
    ).toMatchObject({ ok: false, status: 409 });
    expect(await current(there)).not.toBeNull();
  });

  it("keeps the session when the log row fails", async () => {
    const { who, there, hereId } = await twoDevices();
    vi.mocked(logActivity).mockRejectedValueOnce(new Error("log down"));
    await expect(
      signOutDevice(ctx, {
        ...self(who, hereId),
        sessionId: await idOf(there),
      }),
    ).rejects.toThrow("log down");
    expect(await current(there)).not.toBeNull();
  });
});

describe("signOutOtherDevices", () => {
  it("keeps this device, spares other people, logs one row", async () => {
    const who = await sales();
    const other = await sales("thuha");
    const here = await signInAs(ctx, who);
    const devices = [
      await signInAs(ctx, who),
      await signInAs(ctx, who),
      await signInAs(ctx, who),
    ];
    const theirs = await signInAs(ctx, other);

    const result = await signOutOtherDevices(ctx, self(who, await idOf(here)));

    expect(result).toEqual({ ok: true, data: { count: 3, forgotten: 0 } });
    expect(await current(here)).not.toBeNull();
    for (const cookie of devices) expect(await current(cookie)).toBeNull();
    expect(await current(theirs)).not.toBeNull();
    const logs = await logsOf(who.id);
    expect(logs.map((row) => row.summary)).toEqual(["Đăng xuất 3 máy khác"]);
    expect(logs[0]?.flags).toContain("SENSITIVE");
  });

  it("forgets the owner's trusted devices, only theirs", async () => {
    const who = await sales();
    const other = await sales("thuha");
    const here = await signInAs(ctx, who);
    await signInAs(ctx, who);
    await trust(who.id, "t1");
    await trust(who.id, "t2");
    await trust(other.id, "t3");

    const result = await signOutOtherDevices(ctx, self(who, await idOf(here)));

    expect(result).toEqual({ ok: true, data: { count: 1, forgotten: 2 } });
    expect(await trustedOf(who.id)).toHaveLength(0);
    expect(await trustedOf(other.id)).toHaveLength(1);
    expect((await logsOf(who.id)).map((row) => row.summary)).toEqual([
      "Đăng xuất 1 máy khác, quên 2 máy đã tin",
    ]);
  });

  it("makes the other device enter a code again", async () => {
    const who = await createTestUser(ctx, {
      role: "ACCOUNTANT",
      username: "thuha",
    });
    const factor = await enroll(ctx, who);
    const headers = (ip: string, cookie = "") =>
      new Headers({
        "user-agent": "vitest",
        "x-forwarded-for": ip,
        ...(cookie ? { cookie } : {}),
      });
    const first = await signIn(ctx, {
      username: who.username,
      password: who.password,
      remember: true,
      headers: headers("203.0.113.20"),
    });
    if (!first.ok) throw new Error("expected the code step");
    const done = await completeTwoFactorSignIn(ctx, {
      code: totpCode(factor.secret),
      trustDevice: true,
      headers: headers("203.0.113.20", cookiesOf(first.setCookies)),
    });
    if (!done.ok) throw new Error("expected a session");
    const trustCookie = cookiesOf(
      done.setCookies.filter((line) => line.includes("trust_device")),
    );
    expect(trustCookie).not.toBe("");

    const result = await signOutOtherDevices(
      ctx,
      self(who, await idOf(factor.cookie)),
    );

    expect(result).toEqual({ ok: true, data: { count: 1, forgotten: 1 } });
    expect(
      await signIn(ctx, {
        username: who.username,
        password: who.password,
        remember: true,
        headers: headers("203.0.113.21", trustCookie),
      }),
    ).toMatchObject({ ok: true, twoFactorRequired: true });
  });

  it("does nothing with no other device, even with a trusted one", async () => {
    const who = await sales();
    const here = await signInAs(ctx, who);
    await trust(who.id, "t1");

    const result = await signOutOtherDevices(ctx, self(who, await idOf(here)));

    expect(result).toEqual({ ok: true, data: { count: 0, forgotten: 0 } });
    expect(await trustedOf(who.id)).toHaveLength(1);
    expect(await logsOf(who.id)).toHaveLength(0);
  });

  it("does not count a session that was already over", async () => {
    const who = await sales();
    const here = await signInAs(ctx, who);
    const stale = await signInAs(ctx, who);
    await ctx.db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(session.id, await idOf(stale)));

    expect(await signOutOtherDevices(ctx, self(who, await idOf(here)))).toEqual(
      { ok: true, data: { count: 0, forgotten: 0 } },
    );
    expect(await logsOf(who.id)).toHaveLength(0);
  });

  it("refuses a shared demo account", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const who = await sales("thukho");
    const here = await signInAs(ctx, who);
    const there = await signInAs(ctx, who);
    expect(
      await signOutOtherDevices(ctx, self(who, await idOf(here))),
    ).toMatchObject({ ok: false, status: 409 });
    expect(await current(there)).not.toBeNull();
  });
});

describe("signOutAllDevices", () => {
  it("ends every session, keeps the account usable, logs one row", async () => {
    const boss = await director();
    const who = await sales("vantung");
    const devices = [await signInAs(ctx, who), await signInAs(ctx, who)];

    const result = await signOutAllDevices(ctx, boss, who.id);

    expect(result).toEqual({ ok: true, data: { count: 2, forgotten: 0 } });
    for (const cookie of devices) expect(await current(cookie)).toBeNull();
    const [row] = await ctx.db.select().from(user).where(eq(user.id, who.id));
    expect(row?.status).toBe("ACTIVE");
    expect(await current(await signInAs(ctx, who))).not.toBeNull();
    const logs = await logsOf(boss.id);
    expect(logs.map((entry) => entry.summary)).toEqual([
      "Đăng xuất mọi máy của vantung (2 máy)",
    ]);
    expect(logs[0]?.flags).toContain("SENSITIVE");
    expect(logs[0]?.documentCode).toBe("vantung");
  });

  it("forgets trusted devices, only the target's", async () => {
    const boss = await director();
    const who = await sales("vantung");
    await signInAs(ctx, who);
    await signInAs(ctx, who);
    await trust(who.id, "t1");
    await trust(boss.id, "t2");

    const result = await signOutAllDevices(ctx, boss, who.id);

    expect(result).toEqual({ ok: true, data: { count: 2, forgotten: 1 } });
    expect(await trustedOf(who.id)).toHaveLength(0);
    expect(await trustedOf(boss.id)).toHaveLength(1);
    expect((await logsOf(boss.id)).map((row) => row.summary)).toEqual([
      "Đăng xuất mọi máy của vantung (2 máy), quên 1 máy đã tin",
    ]);
  });

  it("forgets a trusted device when no session is left", async () => {
    const boss = await director();
    const who = await sales("thuha");
    await trust(who.id, "t1");

    expect(await signOutAllDevices(ctx, boss, who.id)).toEqual({
      ok: true,
      data: { count: 0, forgotten: 1 },
    });
    expect(await trustedOf(who.id)).toHaveLength(0);
    expect((await logsOf(boss.id)).map((row) => row.summary)).toEqual([
      "Đăng xuất mọi máy của thuha (0 máy), quên 1 máy đã tin",
    ]);
  });

  it("removes an expired trusted device without counting it", async () => {
    const boss = await director();
    const who = await sales("thuha");
    await trust(who.id, "old", -1000);

    expect(await signOutAllDevices(ctx, boss, who.id)).toEqual({
      ok: true,
      data: { count: 0, forgotten: 0 },
    });
    expect(await trustedOf(who.id)).toHaveLength(0);
    expect(await logsOf(boss.id)).toHaveLength(0);
  });

  it("logs nothing with no session and no trusted device", async () => {
    const boss = await director();
    const who = await sales("ngoclam");
    expect(await signOutAllDevices(ctx, boss, who.id)).toEqual({
      ok: true,
      data: { count: 0, forgotten: 0 },
    });
    expect(await logsOf(boss.id)).toHaveLength(0);
  });

  it("refuses the director's own account", async () => {
    const boss = await director();
    const cookie = await signInAs(ctx, boss);
    expect(await signOutAllDevices(ctx, boss, boss.id)).toEqual({
      ok: false,
      status: 409,
      error: USER_MESSAGES.selfSignOutAll,
    });
    expect(await current(cookie)).not.toBeNull();
  });

  it("answers 404 for a missing user", async () => {
    expect(
      await signOutAllDevices(ctx, await director(), "no-such-user"),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses a shared demo account but not a trial one", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const boss = await director("giamdoc");
    const shared = await sales("thukho");
    const trial = await sales("thu_nghiem");
    const sharedCookie = await signInAs(ctx, shared);
    await signInAs(ctx, trial);

    expect(await signOutAllDevices(ctx, boss, shared.id)).toEqual({
      ok: false,
      status: 409,
      error: USER_MESSAGES.demoSignOutBlocked,
    });
    expect(await current(sharedCookie)).not.toBeNull();
    expect(await signOutAllDevices(ctx, boss, trial.id)).toEqual({
      ok: true,
      data: { count: 1, forgotten: 0 },
    });
  });

  it("keeps sessions and trusted devices when the log row fails", async () => {
    const boss = await director();
    const who = await sales("vantung");
    const cookie = await signInAs(ctx, who);
    await trust(who.id, "t1");
    vi.mocked(logActivity).mockRejectedValueOnce(new Error("log down"));

    await expect(signOutAllDevices(ctx, boss, who.id)).rejects.toThrow(
      "log down",
    );
    expect(await current(cookie)).not.toBeNull();
    expect(await trustedOf(who.id)).toHaveLength(1);
  });
});

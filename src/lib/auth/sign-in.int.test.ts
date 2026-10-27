import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { loginThrottle, session, user } from "@/db/schema";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
  type TestUser,
} from "@/test/auth";

import { SHORT_SESSION_MS, SIGN_IN_MESSAGES, signIn } from "./sign-in";

const ctx = createTestContext();

afterAll(ctx.close);
beforeEach(() => resetAuthTables(ctx));

const ANDROID =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
const EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0";

// Local times on 02/11/2026 in Vietnam.
const at = (time: string) => new Date(`2026-11-02T${time}:00+07:00`);

let ipCounter = 0;
/** A fresh address per call keeps the per-IP limit out of these tests. */
const headers = (userAgent = EDGE) => {
  ipCounter += 1;
  return new Headers({
    "user-agent": userAgent,
    "x-forwarded-for": `198.51.100.${ipCounter % 250}`,
  });
};

const attempt = (
  who: Pick<TestUser, "username">,
  password: string,
  now: Date,
  options: { remember?: boolean; userAgent?: string } = {},
) =>
  signIn(ctx, {
    username: who.username,
    password,
    remember: options.remember ?? true,
    headers: headers(options.userAgent),
    now,
  });

async function sessionsOf(userId: string) {
  return ctx.db.select().from(session).where(eq(session.userId, userId));
}

async function lastLoginOf(userId: string) {
  const [row] = await ctx.db
    .select({ at: user.lastLoginAt, device: user.lastLoginDevice })
    .from(user)
    .where(eq(user.id, userId));
  return row;
}

describe("signIn: wrong credentials", () => {
  let thuha: TestUser;

  beforeEach(async () => {
    thuha = await createTestUser(ctx, {
      role: "ACCOUNTANT",
      username: "thuha",
    });
  });

  it("gives the same message for a wrong password and an unknown name", async () => {
    const wrongPassword = await attempt(thuha, "sai-mat-khau", at("09:00"));
    const unknownName = await attempt(
      { username: "khongco" },
      "bat-ky-1234",
      at("09:00"),
    );
    const badFormat = await attempt(
      { username: "đức lực" },
      "bat-ky-1234",
      at("09:00"),
    );

    for (const result of [wrongPassword, unknownName, badFormat]) {
      expect(result).toEqual({
        ok: false,
        status: 401,
        error: "Tên đăng nhập hoặc mật khẩu không đúng",
      });
    }
    expect(await sessionsOf(thuha.id)).toHaveLength(0);
  });

  it("does not record a wrong password as the last sign-in", async () => {
    await attempt(thuha, thuha.password, at("07:55"));
    await attempt(thuha, "sai-mat-khau", at("09:00"));
    expect(await lastLoginOf(thuha.id)).toEqual({
      at: at("07:55"),
      device: "DESKTOP",
    });
  });

  it("locks the name after 5 wrong tries, even with the right password", async () => {
    for (const time of ["08:00", "08:01", "08:01", "08:02", "08:03"]) {
      await attempt(thuha, "sai-mat-khau", at(time));
    }
    expect(await attempt(thuha, thuha.password, at("08:04"))).toEqual({
      ok: false,
      status: 429,
      error: SIGN_IN_MESSAGES.throttled,
    });
    expect(await sessionsOf(thuha.id)).toHaveLength(0);
  });

  it("lets the right password in once the 15 minutes have passed", async () => {
    for (const time of ["08:00", "08:01", "08:01", "08:02", "08:03"]) {
      await attempt(thuha, "sai-mat-khau", at(time));
    }
    const result = await attempt(thuha, thuha.password, at("08:19"));
    expect(result.ok).toBe(true);

    // The counter is back to 0: 4 more failures do not lock.
    for (const time of ["08:20", "08:21", "08:22", "08:23"]) {
      await attempt(thuha, "sai-mat-khau", at(time));
    }
    expect((await attempt(thuha, thuha.password, at("08:24"))).ok).toBe(true);
  });

  it("resets the counter on success after 4 failures", async () => {
    for (const time of ["08:00", "08:01", "08:02", "08:03"]) {
      await attempt(thuha, "sai-mat-khau", at(time));
    }
    expect((await attempt(thuha, thuha.password, at("08:04"))).ok).toBe(true);
    await attempt(thuha, "sai-mat-khau", at("08:05"));
    expect((await attempt(thuha, thuha.password, at("08:06"))).ok).toBe(true);
  });

  it("throttles an unknown name like a real one", async () => {
    const ghost = { username: "khongco" };
    for (const time of ["08:00", "08:01", "08:02", "08:03", "08:04"]) {
      await attempt(ghost, "bat-ky-1234", at(time));
    }
    expect(await attempt(ghost, "bat-ky-1234", at("08:05"))).toMatchObject({
      status: 429,
      error: SIGN_IN_MESSAGES.throttled,
    });
  });

  it("keeps the lock when more failures than the limit arrive at once", async () => {
    await Promise.all(
      Array.from({ length: 8 }, () =>
        attempt(thuha, "sai-mat-khau", at("08:00")),
      ),
    );
    expect(await attempt(thuha, thuha.password, at("08:01"))).toMatchObject({
      status: 429,
    });
  });

  it("stores nothing for a name that cannot exist", async () => {
    await attempt({ username: "x".repeat(500) }, "bat-ky-1234", at("08:00"));
    await attempt({ username: "đức lực" }, "bat-ky-1234", at("08:00"));
    expect(await ctx.db.select().from(loginThrottle)).toHaveLength(0);
  });

  it("counts every failure when several arrive at once", async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        attempt(thuha, "sai-mat-khau", at("08:00")),
      ),
    );
    expect(await attempt(thuha, thuha.password, at("08:01"))).toMatchObject({
      status: 429,
    });
  });
});

describe("signIn: success", () => {
  it("records the device and the time of the sign-in", async () => {
    const vantung = await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "vantung",
    });
    const now = new Date("2026-10-26T23:48:00Z");
    const result = await attempt(vantung, vantung.password, now, {
      userAgent: ANDROID,
    });

    expect(result).toMatchObject({
      ok: true,
      user: { id: vantung.id, role: "WAREHOUSE", mustChangePassword: false },
    });
    expect(result.ok && result.setCookies.join(";")).toContain("session_token");
    expect(await lastLoginOf(vantung.id)).toEqual({
      at: now,
      device: "MOBILE",
    });
  });

  it("keeps a ticked session for 30 days", async () => {
    const vantung = await createTestUser(ctx, { role: "WAREHOUSE" });
    await attempt(vantung, vantung.password, new Date());
    const [stored] = await sessionsOf(vantung.id);
    expect(stored?.persistent).toBe(true);
    const days =
      ((stored?.expiresAt.getTime() ?? 0) - Date.now()) / (24 * 3600 * 1000);
    expect(days).toBeGreaterThan(29.9);
  });

  it("ends an unticked session 12 hours after sign-in", async () => {
    const thuha = await createTestUser(ctx, { role: "ACCOUNTANT" });
    const now = at("08:00");
    await attempt(thuha, thuha.password, now, { remember: false });
    const [stored] = await sessionsOf(thuha.id);
    expect(stored?.persistent).toBe(false);
    expect(stored?.expiresAt).toEqual(
      new Date(now.getTime() + SHORT_SESSION_MS),
    );
  });
});

describe("signIn: locked account", () => {
  let ngoclam: TestUser;

  beforeEach(async () => {
    ngoclam = await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "ngoclam",
      status: "LOCKED",
    });
  });

  it("says the account is locked when the password is right", async () => {
    expect(await attempt(ngoclam, ngoclam.password, at("09:00"))).toEqual({
      ok: false,
      status: 403,
      error: "Tài khoản đã bị khóa. Liên hệ Giám đốc",
    });
    expect(await sessionsOf(ngoclam.id)).toHaveLength(0);
  });

  it("gives the usual message when the password is wrong", async () => {
    expect(await attempt(ngoclam, "sai-mat-khau", at("09:00"))).toMatchObject({
      status: 401,
      error: SIGN_IN_MESSAGES.invalid,
    });
    expect(await sessionsOf(ngoclam.id)).toHaveLength(0);
  });

  it("does not record the attempt as a sign-in", async () => {
    await attempt(ngoclam, ngoclam.password, at("09:00"));
    expect(await lastLoginOf(ngoclam.id)).toEqual({ at: null, device: null });
  });
});

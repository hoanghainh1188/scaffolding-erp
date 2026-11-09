import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  activityLog,
  loginThrottle,
  session,
  twoFactor,
  user,
  verification,
} from "@/db/schema";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
  type TestUser,
} from "@/test/auth";
import { enroll, totpCode } from "@/test/two-factor";

import {
  ADMIN_MESSAGES,
  resetTwoFactorByAdmin,
  resetTwoFactorByCli,
  setSystemAdmin,
} from "./two-factor-admin";
import { TWO_FACTOR_MESSAGES } from "./two-factor-sign-in";

const ctx = createTestContext();

afterAll(ctx.close);
beforeEach(() => resetAuthTables());

const headersOf = (cookie: string) =>
  new Headers({ cookie, "user-agent": "vitest" });

async function setup() {
  const admin = await createTestUser(ctx, {
    role: "SALES",
    username: "quocbao",
  });
  const target = await createTestUser(ctx, {
    role: "ACCOUNTANT",
    username: "thuha",
  });
  await ctx.db
    .update(user)
    .set({ systemAdmin: true })
    .where(eq(user.id, admin.id));
  const adminFactor = await enroll(ctx, admin);
  const targetFactor = await enroll(ctx, target);
  await ctx.db.insert(verification).values({
    id: "t1",
    identifier: "trust-device-t1",
    value: target.id,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  await ctx.db.insert(loginThrottle).values({
    usernameKey: "thuha",
    ip: "1.2.3.4",
    failedCount: 2,
    firstFailedAt: new Date(),
  });
  return { admin, target, adminFactor, targetFactor };
}

const reset = (
  admin: TestUser,
  cookie: string,
  targetId: string,
  code: string,
  options: { systemAdmin?: boolean; password?: string } = {},
) =>
  resetTwoFactorByAdmin(ctx, {
    admin: { role: admin.role, systemAdmin: options.systemAdmin ?? true },
    actor: admin,
    targetId,
    password: options.password ?? admin.password,
    code,
    headers: headersOf(cookie),
  });

async function isWiped(id: string) {
  const [row] = await ctx.db.select().from(user).where(eq(user.id, id));
  const factors = await ctx.db
    .select()
    .from(twoFactor)
    .where(eq(twoFactor.userId, id));
  const sessions = await ctx.db
    .select()
    .from(session)
    .where(eq(session.userId, id));
  const trusted = await ctx.db
    .select()
    .from(verification)
    .where(eq(verification.value, id));
  return (
    row?.twoFactorEnabled === false &&
    factors.length === 0 &&
    sessions.length === 0 &&
    trusted.length === 0
  );
}

describe("an admin clearing someone's second factor", () => {
  it("wipes the account and logs who did it", async () => {
    const { admin, target, adminFactor } = await setup();
    const result = await reset(
      admin,
      adminFactor.cookie,
      target.id,
      totpCode(adminFactor.secret),
    );
    expect(result).toEqual({ ok: true, data: { reset: true } });
    expect(await isWiped(target.id)).toBe(true);
    const throttle = await ctx.db
      .select()
      .from(loginThrottle)
      .where(eq(loginThrottle.usernameKey, "thuha"));
    expect(throttle).toHaveLength(0);
    const [row] = await ctx.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.userId, admin.id));
    expect(row?.summary).toBe("Gỡ xác thực 2 lớp của thuha");
    expect(row?.flags).toContain("SENSITIVE");
  });

  it("refuses a director without the flag", async () => {
    const { target, adminFactor } = await setup();
    const director = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "minhanh",
    });
    expect(
      await reset(director, adminFactor.cookie, target.id, "000000", {
        systemAdmin: false,
      }),
    ).toEqual({ ok: false, status: 403, error: ADMIN_MESSAGES.forbidden });
    expect(await isWiped(target.id)).toBe(false);
  });

  it("refuses a wrong code of the admin", async () => {
    const { admin, target, adminFactor } = await setup();
    expect(await reset(admin, adminFactor.cookie, target.id, "000000")).toEqual(
      { ok: false, status: 400, error: TWO_FACTOR_MESSAGES.wrongCode },
    );
    expect(await isWiped(target.id)).toBe(false);
  });

  it("refuses a wrong password of the admin", async () => {
    const { admin, target, adminFactor } = await setup();
    expect(
      await reset(
        admin,
        adminFactor.cookie,
        target.id,
        totpCode(adminFactor.secret),
        { password: "sai-mat-khau" },
      ),
    ).toEqual({
      ok: false,
      status: 400,
      error: TWO_FACTOR_MESSAGES.wrongPassword,
    });
  });

  it("refuses the admin's own account", async () => {
    const { admin, adminFactor } = await setup();
    expect(await reset(admin, adminFactor.cookie, admin.id, "000000")).toEqual({
      ok: false,
      status: 400,
      error: ADMIN_MESSAGES.self,
    });
  });

  it("refuses an account that has not turned it on", async () => {
    const { admin, adminFactor } = await setup();
    const none = await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "vantung",
    });
    expect(await reset(admin, adminFactor.cookie, none.id, "000000")).toEqual({
      ok: false,
      status: 409,
      error: ADMIN_MESSAGES.notEnabled,
    });
  });
});

describe("the recovery command", () => {
  it("wipes the account and logs it", async () => {
    const { target } = await setup();
    const result = await resetTwoFactorByCli(ctx.db, "thuha");
    expect(result.ok).toBe(true);
    expect(await isWiped(target.id)).toBe(true);
    const [row] = await ctx.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.userId, target.id));
    expect(row?.summary).toBe("Tắt xác thực 2 lớp bằng lệnh cứu hộ");
  });

  it("reports an unknown name and changes nothing", async () => {
    expect((await resetTwoFactorByCli(ctx.db, "khongco")).ok).toBe(false);
  });

  it("reports an account that has not turned it on", async () => {
    await createTestUser(ctx, { role: "WAREHOUSE", username: "vantung" });
    const result = await resetTwoFactorByCli(ctx.db, "vantung");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("chưa bật");
  });
});

describe("the admin flag command", () => {
  const flag = async (id: string) => {
    const [row] = await ctx.db
      .select({ on: user.systemAdmin, role: user.role })
      .from(user)
      .where(eq(user.id, id));
    return row;
  };

  it("sets and clears the flag without touching the role", async () => {
    const who = await createTestUser(ctx, {
      role: "SALES",
      username: "quocbao",
    });
    expect((await setSystemAdmin(ctx.db, "quocbao", true)).ok).toBe(true);
    expect(await flag(who.id)).toEqual({ on: true, role: "SALES" });
    expect((await setSystemAdmin(ctx.db, "quocbao", false)).ok).toBe(true);
    expect((await flag(who.id))?.on).toBe(false);
    const rows = await ctx.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.userId, who.id));
    expect(rows.map((row) => row.summary).sort()).toEqual([
      "Gỡ cờ Admin hệ thống",
      "Đặt cờ Admin hệ thống",
    ]);
  });

  it("reports an unknown name", async () => {
    expect((await setSystemAdmin(ctx.db, "khongco", true)).ok).toBe(false);
  });
});

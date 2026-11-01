// Sign-ins in the activity log (activity-log tasks 5.8).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { session, user } from "@/db/schema";
import { activityRows } from "@/test/activity";
import {
  TEST_PASSWORD,
  createTestContext,
  createTestUser,
  resetAuthTables,
  type TestUser,
} from "@/test/auth";

const failLog = vi.hoisted(() => ({ on: false }));

vi.mock("@/lib/activity/log", async (original) => {
  const actual = await original<typeof import("@/lib/activity/log")>();
  return {
    ...actual,
    logActivity: async (...args: Parameters<typeof actual.logActivity>) => {
      if (failLog.on) throw new Error("activity log down");
      return actual.logActivity(...args);
    },
  };
});

const { signIn } = await import("./sign-in");
const { lockUser } = await import("@/lib/users/service");

const ctx = createTestContext();
afterAll(ctx.close);

const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

let ip = 0;
const attempt = (
  username: string,
  password: string,
  now: Date,
  fixedIp?: string,
) => {
  if (!fixedIp) {
    ip += 1;
  }
  const clientIp = fixedIp ?? `203.0.113.${ip % 250}`;
  return signIn(ctx, {
    username,
    password,
    remember: true,
    headers: new Headers({
      "user-agent": ANDROID,
      "x-forwarded-for": clientIp,
    }),
    now,
  });
};

const at = (time: string) => new Date(`2026-10-28T${time}+07:00`);
const signIns = async () =>
  (await activityRows(ctx.db)).filter((row) => row.action === "SIGN_IN");

let vantung: TestUser;

beforeEach(async () => {
  failLog.on = false;
  await resetAuthTables();
  vantung = await createTestUser(ctx, {
    role: "WAREHOUSE",
    username: "vantung",
  });
});

describe("sign-in in the activity log", () => {
  it("logs a success, not the wrong password before it", async () => {
    expect((await attempt("vantung", "sai-mat-khau", at("07:40:00"))).ok).toBe(
      false,
    );
    expect((await attempt("vantung", TEST_PASSWORD, at("07:41:00"))).ok).toBe(
      true,
    );
    const rows = await signIns();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: vantung.id,
      role: "WAREHOUSE",
      device: "MOBILE",
      browser: "CHROME",
      documentType: null,
      documentCode: null,
      summary: "Đăng nhập thành công",
      createdAt: at("07:41:00"),
      flags: [],
    });
  });

  it("logs nothing for a locked account or a throttled name", async () => {
    const director = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "minhanh",
    });
    await lockUser(ctx, director, vantung.id);
    expect((await attempt("vantung", TEST_PASSWORD, at("08:00:00"))).ok).toBe(
      false,
    );
    const fixedIp = "203.0.113.99";
    for (let i = 0; i < 5; i += 1) {
      await attempt("minhanh", "sai-mat-khau", at("08:01:00"), fixedIp);
    }
    expect(
      (await attempt("minhanh", TEST_PASSWORD, at("08:02:00"), fixedIp)).ok,
    ).toBe(false);
    expect(await signIns()).toEqual([]);
  });

  it("logs nothing for a sign-in over the address limit", async () => {
    const tooFast = await signIn(
      { ...ctx, ipLimitPerMinute: 0 },
      {
        username: "vantung",
        password: TEST_PASSWORD,
        remember: true,
        headers: new Headers({ "x-forwarded-for": "203.0.113.251" }),
        now: at("08:30:00"),
      },
    );
    expect(tooFast).toMatchObject({ ok: false, status: 429 });
    expect(await signIns()).toEqual([]);
  });

  it("refuses the sign-in and drops its session when logging fails", async () => {
    failLog.on = true;
    await expect(
      attempt("vantung", TEST_PASSWORD, at("09:00:00")),
    ).rejects.toThrow("activity log down");
    expect(
      await ctx.db.select().from(session).where(eq(session.userId, vantung.id)),
    ).toEqual([]);
    const [row] = await ctx.db
      .select({ lastLoginAt: user.lastLoginAt })
      .from(user)
      .where(eq(user.id, vantung.id));
    expect(row?.lastLoginAt).toBeNull();
    expect(await signIns()).toEqual([]);
  });
});

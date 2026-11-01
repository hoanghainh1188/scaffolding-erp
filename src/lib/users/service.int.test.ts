import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { loginThrottle, user } from "@/db/schema";
import { createAuth } from "@/lib/auth/auth";
import { resolveCurrentUser } from "@/lib/auth/session";
import {
  TEST_BASE_URL,
  TEST_SECRET,
  createTestContext,
  createTestUser,
  resetAuthTables,
  signInAs,
  type TestUser,
} from "@/test/auth";

import {
  USER_MESSAGES,
  changeRole,
  createUser,
  createUserSchema,
  listUsers,
  lockUser,
  resetPassword,
  unlockUser,
} from "./service";

const ctx = createTestContext();
// A second pool, so two transactions really run side by side.
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
const otherDeps = {
  db: other.db,
  auth: createAuth({
    db: other.db,
    secret: TEST_SECRET,
    baseURL: TEST_BASE_URL,
  }),
};

afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});
beforeEach(() => resetAuthTables());

async function canSignIn(username: string, password: string) {
  try {
    await signInAs(ctx, { username, password });
    return true;
  } catch {
    return false;
  }
}

const isSignedIn = async (cookie: string) =>
  (await resolveCurrentUser(ctx.auth, new Headers({ cookie }))) !== null;

async function statusOf(id: string) {
  const [row] = await ctx.db
    .select({
      status: user.status,
      role: user.role,
      mustChange: user.mustChangePassword,
    })
    .from(user)
    .where(eq(user.id, id));
  return row;
}

const parse = (input: unknown) => createUserSchema.safeParse(input);

describe("createUser", () => {
  let minhanh: TestUser;

  beforeEach(async () => {
    minhanh = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "minhanh",
    });
  });

  it("creates a warehouse account that must change its password", async () => {
    const input = parse({
      name: "Đức Lực",
      username: "ducluc",
      role: "WAREHOUSE",
    });
    expect(input.success).toBe(true);
    const result = await createUser(ctx, minhanh, input.data!);
    expect(result).toMatchObject({
      ok: true,
      data: {
        user: {
          name: "Đức Lực",
          username: "ducluc",
          role: "WAREHOUSE",
          status: "ACTIVE",
          lastLoginAt: null,
          lastLoginDevice: null,
        },
      },
    });
    const tempPassword = result.ok ? result.data.tempPassword : "";
    expect(tempPassword).toMatch(/^[a-z]{3,6}-\d{4}$/);

    // Only a hash is stored, never the password itself.
    const dump = await ctx.db.execute(
      sql`select row_to_json(u)::text || row_to_json(a)::text as text from "user" u join account a on a.user_id = u.id`,
    );
    expect(JSON.stringify(dump)).not.toContain(tempPassword);
    expect(
      (await statusOf(result.ok ? result.data.user.id : ""))?.mustChange,
    ).toBe(true);
    expect(result.ok && result.data.user.tempPasswordExpiresAt).toBeTruthy();
    const expiresMs = new Date(
      result.ok ? result.data.user.tempPasswordExpiresAt! : "",
    ).getTime();
    expect(expiresMs - Date.now()).toBeGreaterThan(47.9 * 60 * 60 * 1000);
    expect(await canSignIn("ducluc", tempPassword)).toBe(true);
  });

  it("refuses a name already used by a locked account", async () => {
    await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "ngoclam",
      status: "LOCKED",
    });
    const result = await createUser(ctx, minhanh, {
      name: "Ngọc Lâm",
      username: "ngoclam",
      role: "WAREHOUSE",
    });
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Tên đăng nhập đã có người dùng",
    });
  });

  it("lets the unique index settle a race on the same name", async () => {
    const input = {
      name: "Đức Lực",
      username: "ducluc",
      role: "WAREHOUSE" as const,
    };
    const results = await Promise.all([
      createUser(ctx, minhanh, input),
      createUser(otherDeps, minhanh, input),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ status: 409 });
  });

  it("validates the form fields with the D17 wording", () => {
    const issue = (input: unknown) => {
      const result = parse(input);
      return result.success ? null : result.error.issues[0]?.message;
    };
    expect(
      issue({ name: "Đức Lực", username: "đức lực", role: "WAREHOUSE" }),
    ).toBe("Chữ thường không dấu, không khoảng trắng");
    expect(issue({ name: " ", username: "ducluc", role: "WAREHOUSE" })).toBe(
      "Nhập họ tên",
    );
    expect(issue({ name: "Đức Lực", username: "ducluc", role: "ADMIN" })).toBe(
      "Chọn một vai trò",
    );
    expect(
      parse({ name: "Đức Lực", username: "DucLuc", role: "SALES" }).data
        ?.username,
    ).toBe("ducluc");
  });
});

describe("listUsers", () => {
  it("counts active and locked accounts and lists active first", async () => {
    await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "ngoclam",
      name: "Ngọc Lâm",
      status: "LOCKED",
    });
    await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "vantung",
      name: "Văn Tùng",
    });
    await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "minhanh",
      name: "Minh Anh",
    });

    const { users, counts } = await listUsers(ctx.db);
    expect(users.map((row) => row.username)).toEqual([
      "minhanh",
      "vantung",
      "ngoclam",
    ]);
    expect(counts).toMatchObject({ active: 2, locked: 1 });
    expect(counts.byRole.WAREHOUSE).toBe(2);

    const filtered = await listUsers(ctx.db, { role: "WAREHOUSE" });
    expect(filtered.users).toHaveLength(2);
    expect(filtered.counts.active).toBe(2);
    expect(Object.keys(users[0] ?? {})).not.toContain("password");
  });
});

describe("resetPassword", () => {
  let minhanh: TestUser;
  let vantung: TestUser;

  beforeEach(async () => {
    minhanh = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "minhanh",
    });
    vantung = await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "vantung",
    });
  });

  it("signs the person out, replaces the password and lifts the throttle across all IPs", async () => {
    const phone = await signInAs(ctx, vantung);
    await ctx.db.insert(loginThrottle).values([
      {
        usernameKey: "vantung",
        ip: "1.2.3.4",
        failedCount: 5,
        firstFailedAt: new Date(),
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      },
      {
        usernameKey: "vantung",
        ip: "5.6.7.8",
        failedCount: 3,
        firstFailedAt: new Date(),
        lockedUntil: null,
      },
    ]);

    const result = await resetPassword(ctx, minhanh, vantung.id);
    expect(result.ok).toBe(true);
    expect(await isSignedIn(phone)).toBe(false);
    expect(await canSignIn("vantung", vantung.password)).toBe(false);
    expect(await ctx.db.select().from(loginThrottle)).toHaveLength(0);
    expect((await statusOf(vantung.id))?.mustChange).toBe(true);
    expect(result.ok && result.data.user.tempPasswordExpiresAt).toBeTruthy();
    const expiresMs = new Date(
      result.ok ? result.data.user.tempPasswordExpiresAt! : "",
    ).getTime();
    expect(expiresMs - Date.now()).toBeGreaterThan(47.9 * 60 * 60 * 1000);
    expect(
      await canSignIn("vantung", result.ok ? result.data.tempPassword : ""),
    ).toBe(true);
  });

  it("refuses a locked account", async () => {
    const ngoclam = await createTestUser(ctx, {
      role: "WAREHOUSE",
      status: "LOCKED",
    });
    expect(await resetPassword(ctx, minhanh, ngoclam.id)).toEqual({
      ok: false,
      status: 409,
      error: "Mở khóa tài khoản trước khi đặt lại mật khẩu",
    });
  });

  it("refuses the director's own account and unknown ids", async () => {
    expect(await resetPassword(ctx, minhanh, minhanh.id)).toMatchObject({
      status: 409,
    });
    expect(await resetPassword(ctx, minhanh, "missing")).toMatchObject({
      status: 404,
      error: USER_MESSAGES.notFound,
    });
  });
});

describe("lockUser / unlockUser", () => {
  let minhanh: TestUser;

  beforeEach(async () => {
    minhanh = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "minhanh",
    });
  });

  it("locks and signs out at once", async () => {
    const hoangnam = await createTestUser(ctx, {
      role: "WORKSHOP",
      username: "hoangnam",
    });
    const phone = await signInAs(ctx, hoangnam);
    const result = await lockUser(ctx, minhanh, hoangnam.id);
    expect(result).toMatchObject({
      ok: true,
      data: { user: { status: "LOCKED" } },
    });
    expect(await isSignedIn(phone)).toBe(false);
    expect((await statusOf(hoangnam.id))?.status).toBe("LOCKED");
  });

  it("unlocks with a new temporary password", async () => {
    const ngoclam = await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "ngoclam",
      status: "LOCKED",
    });
    const result = await unlockUser(ctx, minhanh, ngoclam.id);
    expect(result).toMatchObject({
      ok: true,
      data: { user: { status: "ACTIVE" } },
    });
    expect(await canSignIn("ngoclam", ngoclam.password)).toBe(false);
    expect(result.ok && result.data.user.tempPasswordExpiresAt).toBeTruthy();
    const expiresMs = new Date(
      result.ok ? result.data.user.tempPasswordExpiresAt! : "",
    ).getTime();
    expect(expiresMs - Date.now()).toBeGreaterThan(47.9 * 60 * 60 * 1000);
    expect(
      await canSignIn("ngoclam", result.ok ? result.data.tempPassword : ""),
    ).toBe(true);
    expect((await statusOf(ngoclam.id))?.mustChange).toBe(true);
  });

  it("does not unlock an active account", async () => {
    const thuha = await createTestUser(ctx, { role: "ACCOUNTANT" });
    expect(await unlockUser(ctx, minhanh, thuha.id)).toMatchObject({
      status: 409,
      error: USER_MESSAGES.alreadyActive,
    });
  });
});

describe("the acting director is re-checked inside the transaction", () => {
  let minhanh: TestUser;
  let vantung: TestUser;

  beforeEach(async () => {
    minhanh = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "minhanh",
    });
    // A second director keeps one active after minhanh is locked.
    await createTestUser(ctx, { role: "DIRECTOR", username: "giamdoc2" });
    vantung = await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "vantung",
    });
  });

  // The request passed withAuth, then minhanh was locked (or demoted) from
  // another tab before the service ran.
  const lockMinhanh = () =>
    ctx.db
      .update(user)
      .set({ status: "LOCKED" })
      .where(eq(user.id, minhanh.id));
  const demoteMinhanh = () =>
    ctx.db.update(user).set({ role: "SALES" }).where(eq(user.id, minhanh.id));

  const forbidden = {
    ok: false,
    status: 403,
    error: "Bạn không có quyền thực hiện thao tác này",
  };

  it("refuses to create an account for a director locked meanwhile", async () => {
    await lockMinhanh();
    expect(
      await createUser(ctx, minhanh, {
        name: "Đức Lực",
        username: "ducluc",
        role: "WAREHOUSE",
      }),
    ).toEqual(forbidden);
    const [created] = await ctx.db
      .select()
      .from(user)
      .where(eq(user.username, "ducluc"));
    expect(created).toBeUndefined();
  });

  it("refuses to reset a password for a director locked meanwhile", async () => {
    const phone = await signInAs(ctx, vantung);
    await lockMinhanh();
    expect(await resetPassword(ctx, minhanh, vantung.id)).toEqual(forbidden);
    // Nothing changed: old password works, session alive, no pending change.
    expect(await isSignedIn(phone)).toBe(true);
    expect(await canSignIn("vantung", vantung.password)).toBe(true);
    expect((await statusOf(vantung.id))?.mustChange).toBe(false);
  });

  it("refuses both for a director demoted meanwhile", async () => {
    await demoteMinhanh();
    expect(await resetPassword(ctx, minhanh, vantung.id)).toEqual(forbidden);
    expect(
      await createUser(ctx, minhanh, {
        name: "Đức Lực",
        username: "ducluc",
        role: "WAREHOUSE",
      }),
    ).toEqual(forbidden);
  });
});

describe("protecting the last director", () => {
  let minhanh: TestUser;
  let giamdoc2: TestUser;

  beforeEach(async () => {
    minhanh = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "minhanh",
    });
    giamdoc2 = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "giamdoc2",
    });
  });

  it("refuses locking or demoting oneself", async () => {
    expect(await lockUser(ctx, minhanh, minhanh.id)).toEqual({
      ok: false,
      status: 409,
      error: "Không thể tự khóa tài khoản của mình",
    });
    expect(await changeRole(ctx, minhanh, minhanh.id, "ACCOUNTANT")).toEqual({
      ok: false,
      status: 409,
      error: "Không thể tự đổi vai trò của mình",
    });
    expect((await statusOf(minhanh.id))?.status).toBe("ACTIVE");
  });

  it("allows locking another director while one remains", async () => {
    expect((await lockUser(ctx, minhanh, giamdoc2.id)).ok).toBe(true);
  });

  it("answers 409 when the target is the only active director", async () => {
    // giamdoc2's request was accepted before giamdoc2 got locked.
    await ctx.db
      .update(user)
      .set({ status: "LOCKED" })
      .where(eq(user.id, giamdoc2.id));
    expect(await lockUser(ctx, giamdoc2, minhanh.id)).toEqual({
      ok: false,
      status: 409,
      error: "Phải còn ít nhất một Giám đốc đang dùng",
    });
    expect(await changeRole(ctx, giamdoc2, minhanh.id, "SALES")).toMatchObject({
      status: 409,
    });
  });

  it("lets exactly one of two crossed locks through", async () => {
    const results = await Promise.all([
      lockUser(ctx, minhanh, giamdoc2.id),
      lockUser(otherDeps, giamdoc2, minhanh.id),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const active = await ctx.db
      .select()
      .from(user)
      .where(eq(user.status, "ACTIVE"));
    expect(active.filter((row) => row.role === "DIRECTOR")).toHaveLength(1);
  });

  it("lets exactly one of a demotion and a lock through", async () => {
    const results = await Promise.all([
      changeRole(ctx, minhanh, giamdoc2.id, "ACCOUNTANT"),
      lockUser(otherDeps, giamdoc2, minhanh.id),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const directors = await ctx.db
      .select()
      .from(user)
      .where(eq(user.role, "DIRECTOR"));
    expect(directors.filter((row) => row.status === "ACTIVE")).toHaveLength(1);
  });

  it("changes another user's role", async () => {
    const lanphuong = await createTestUser(ctx, { role: "SALES" });
    expect(
      await changeRole(ctx, minhanh, lanphuong.id, "ACCOUNTANT"),
    ).toMatchObject({
      ok: true,
      data: { user: { role: "ACCOUNTANT" } },
    });
    expect((await statusOf(lanphuong.id))?.role).toBe("ACCOUNTANT");
  });
});

describe("demo account protection in service (K9)", () => {
  let director: TestUser;
  let demoSales: TestUser;
  let normalUser: TestUser;

  beforeEach(async () => {
    director = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "director_boss",
    });
    demoSales = await createTestUser(ctx, {
      role: "SALES",
      username: "kinhdoanh",
    });
    normalUser = await createTestUser(ctx, {
      role: "SALES",
      username: "regular_user",
    });
  });

  it("blocks resetPassword, lockUser, changeRole on demo accounts when DEMO_MODE=true", async () => {
    process.env.DEMO_MODE = "true";
    try {
      const resetRes = await resetPassword(ctx, director, demoSales.id);
      expect(resetRes).toEqual({
        ok: false,
        status: 409,
        error: USER_MESSAGES.demoResetBlocked,
      });

      const lockRes = await lockUser(ctx, director, demoSales.id);
      expect(lockRes).toEqual({
        ok: false,
        status: 409,
        error: USER_MESSAGES.demoLockBlocked,
      });

      const roleRes = await changeRole(
        ctx,
        director,
        demoSales.id,
        "ACCOUNTANT",
      );
      expect(roleRes).toEqual({
        ok: false,
        status: 409,
        error: USER_MESSAGES.demoRoleBlocked,
      });
    } finally {
      delete process.env.DEMO_MODE;
    }
  });

  it("allows operations on demo accounts when DEMO_MODE=false", async () => {
    process.env.DEMO_MODE = "false";
    try {
      const resetRes = await resetPassword(ctx, director, demoSales.id);
      expect(resetRes.ok).toBe(true);

      const roleRes = await changeRole(
        ctx,
        director,
        demoSales.id,
        "ACCOUNTANT",
      );
      expect(roleRes.ok).toBe(true);

      const lockRes = await lockUser(ctx, director, demoSales.id);
      expect(lockRes.ok).toBe(true);
    } finally {
      delete process.env.DEMO_MODE;
    }
  });

  it("allows operations on non-demo accounts even when DEMO_MODE=true", async () => {
    process.env.DEMO_MODE = "true";
    try {
      const resetRes = await resetPassword(ctx, director, normalUser.id);
      expect(resetRes.ok).toBe(true);

      const roleRes = await changeRole(
        ctx,
        director,
        normalUser.id,
        "ACCOUNTANT",
      );
      expect(roleRes.ok).toBe(true);

      const lockRes = await lockUser(ctx, director, normalUser.id);
      expect(lockRes.ok).toBe(true);
    } finally {
      delete process.env.DEMO_MODE;
    }
  });
});

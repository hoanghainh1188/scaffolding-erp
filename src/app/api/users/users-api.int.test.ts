import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { user } from "@/db/schema";
import type { Role } from "@/domain/role";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  resetAuthTables,
  signInAs,
  type TestUser,
} from "@/test/auth";

import { POST as CHANGE_PASSWORD } from "@/app/api/me/password/route";

import { PATCH } from "./[id]/route";
import { POST as LOCK } from "./[id]/lock/route";
import { POST as RESET } from "./[id]/reset-password/route";
import { POST as UNLOCK } from "./[id]/unlock/route";
import { GET, POST } from "./route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);

afterAll(async () => {
  uninstall();
  await ctx.close();
});

let minhanh: TestUser;
let thuha: TestUser;
let ngoclam: TestUser;

beforeEach(async () => {
  await resetAuthTables(ctx);
  minhanh = await createTestUser(ctx, {
    role: "DIRECTOR",
    username: "minhanh",
    name: "Minh Anh",
  });
  thuha = await createTestUser(ctx, {
    role: "ACCOUNTANT",
    username: "thuha",
    name: "Thu Hà",
  });
  ngoclam = await createTestUser(ctx, {
    role: "WAREHOUSE",
    username: "ngoclam",
    name: "Ngọc Lâm",
    status: "LOCKED",
  });
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** Every user-management call, as the given cookie. */
const calls = (cookie: string) => ({
  list: () => GET(appRequest("/api/users", { cookie })),
  create: () =>
    POST(
      appRequest("/api/users", {
        method: "POST",
        cookie,
        body: { name: "Đức Lực", username: "ducluc", role: "WAREHOUSE" },
      }),
    ),
  changeRole: () =>
    PATCH(
      appRequest(`/api/users/${thuha.id}`, {
        method: "PATCH",
        cookie,
        body: { role: "SALES" },
      }),
      params(thuha.id),
    ),
  lock: () =>
    LOCK(
      appRequest(`/api/users/${thuha.id}/lock`, { method: "POST", cookie }),
      params(thuha.id),
    ),
  unlock: () =>
    UNLOCK(
      appRequest(`/api/users/${ngoclam.id}/unlock`, { method: "POST", cookie }),
      params(ngoclam.id),
    ),
  reset: () =>
    RESET(
      appRequest(`/api/users/${thuha.id}/reset-password`, {
        method: "POST",
        cookie,
      }),
      params(thuha.id),
    ),
});

async function snapshot() {
  return ctx.db
    .select({
      id: user.id,
      role: user.role,
      status: user.status,
      must: user.mustChangePassword,
    })
    .from(user)
    .orderBy(user.id);
}

describe("user API refuses every role but Giám đốc", () => {
  const OTHER_ROLES: Role[] = ["ACCOUNTANT", "SALES", "WAREHOUSE", "WORKSHOP"];

  it.each(OTHER_ROLES)(
    "%s gets 403 on every route and changes nothing",
    async (role) => {
      const caller = await createTestUser(ctx, { role });
      const cookie = await signInAs(ctx, caller);
      const before = await snapshot();

      for (const [name, call] of Object.entries(calls(cookie))) {
        const response = await call();
        expect(response.status, name).toBe(403);
        expect(await response.json(), name).toEqual({
          success: false,
          data: null,
          error: "Bạn không có quyền thực hiện thao tác này",
        });
      }
      expect(await snapshot()).toEqual(before);
    },
  );

  it("answers 401 to every route when signed out", async () => {
    for (const [name, call] of Object.entries(calls(""))) {
      expect((await call()).status, name).toBe(401);
    }
  });
});

describe("user API for Giám đốc", () => {
  it("lists without any password field", async () => {
    const cookie = await signInAs(ctx, minhanh);
    const response = await calls(cookie).list();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.counts).toMatchObject({ active: 2, locked: 1 });
    expect(JSON.stringify(body)).not.toMatch(/password|hash/i);
  });

  it("filters by role and rejects an unknown role", async () => {
    const cookie = await signInAs(ctx, minhanh);
    const filtered = await GET(
      appRequest("/api/users?role=WAREHOUSE", { cookie }),
    );
    expect((await filtered.json()).data.users).toHaveLength(1);
    const wrong = await GET(appRequest("/api/users?role=ADMIN", { cookie }));
    expect(wrong.status).toBe(400);
  });

  it("creates with 201 and a temporary password that is never cached", async () => {
    const cookie = await signInAs(ctx, minhanh);
    const response = await calls(cookie).create();
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).data.tempPassword).toMatch(
      /^[a-z]{3,6}-\d{4}$/,
    );
  });

  it("reports form errors with the D17 wording", async () => {
    const cookie = await signInAs(ctx, minhanh);
    const response = await POST(
      appRequest("/api/users", {
        method: "POST",
        cookie,
        body: { name: "Đức Lực", username: "đức lực", role: "WAREHOUSE" },
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Chữ thường không dấu, không khoảng trắng",
    );
  });

  it("succeeds on the other routes", async () => {
    const cookie = await signInAs(ctx, minhanh);
    const api = calls(cookie);
    expect((await api.changeRole()).status).toBe(200);
    expect((await api.reset()).headers.get("cache-control")).toBe("no-store");
    expect((await api.lock()).status).toBe(200);
    expect((await api.unlock()).status).toBe(200);
  });

  it("answers 404 for an unknown id", async () => {
    const cookie = await signInAs(ctx, minhanh);
    const response = await LOCK(
      appRequest("/api/users/missing/lock", { method: "POST", cookie }),
      params("missing"),
    );
    expect(response.status).toBe(404);
  });

  it("answers 409 to locking oneself", async () => {
    const cookie = await signInAs(ctx, minhanh);
    const response = await LOCK(
      appRequest(`/api/users/${minhanh.id}/lock`, { method: "POST", cookie }),
      params(minhanh.id),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "Không thể tự khóa tài khoản của mình",
    );
  });
});

describe("pending temporary password", () => {
  it("blocks GET /api/users until the password is changed", async () => {
    const giamdoc = await createTestUser(ctx, {
      role: "DIRECTOR",
      mustChangePassword: true,
    });
    const cookie = await signInAs(ctx, giamdoc);
    const response = await calls(cookie).list();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(
      "Cần đổi mật khẩu trước khi tiếp tục",
    );

    const changed = await CHANGE_PASSWORD(
      appRequest("/api/me/password", {
        method: "POST",
        cookie,
        body: {
          currentPassword: giamdoc.password,
          newPassword: "bai sau kho",
          confirmPassword: "bai sau kho",
        },
      }),
    );
    expect(changed.status).toBe(200);
    expect((await calls(cookie).list()).status).toBe(200);
  });
});

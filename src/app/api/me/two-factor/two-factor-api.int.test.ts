import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { twoFactor, user } from "@/db/schema";
import { POST as resetPost } from "@/app/api/users/[id]/two-factor/reset/route";
import { POST as lockPost } from "@/app/api/users/[id]/lock/route";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  resetAuthTables,
  signInAs,
} from "@/test/auth";
import { enroll, plainSession, secretOf, totpCode } from "@/test/two-factor";

import { POST as backupPost } from "./backup-codes/route";
import { POST as confirmPost } from "./confirm/route";
import { POST as forgetPost } from "./forget-devices/route";
import { POST as replacePost } from "./replace/route";
import { POST as setupPost } from "./setup/route";

const ctx = createTestContext();
let restore: () => void;

beforeAll(() => {
  restore = installTestContext(ctx);
});
afterAll(async () => {
  restore();
  await ctx.close();
});
beforeEach(() => resetAuthTables());

const post = (path: string, cookie: string, body?: unknown) =>
  appRequest(path, { method: "POST", cookie, body });

const setup = (cookie: string, password: string) =>
  setupPost(post("/api/me/two-factor/setup", cookie, { password }));

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/me/two-factor", () => {
  it("refuses a role that does not use it", async () => {
    const sales = await createTestUser(ctx, {
      role: "SALES",
      username: "quocbao",
    });
    const response = await setup(await signInAs(ctx, sales), sales.password);
    expect(response.status).toBe(403);
    expect(await ctx.db.select().from(twoFactor)).toHaveLength(0);
  });

  it("needs a session", async () => {
    expect((await setup("", "x")).status).toBe(401);
  });

  it("turns on through setup and confirm, without caching secrets", async () => {
    const who = await createTestUser(ctx, {
      role: "ACCOUNTANT",
      username: "thuha",
    });
    const cookie = await plainSession(ctx, who);
    const started = await setup(cookie, who.password);
    expect(started.status).toBe(200);
    expect(started.headers.get("cache-control")).toBe("no-store");
    const { data } = (await started.json()) as {
      data: { totpUri: string; backupCodes: string[] };
    };
    expect(data.backupCodes).toHaveLength(10);

    const confirmed = await confirmPost(
      post("/api/me/two-factor/confirm", cookie, {
        code: totpCode(secretOf(data.totpUri)),
      }),
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.headers.getSetCookie().length).toBeGreaterThan(0);
    const [row] = await ctx.db
      .select({ on: user.twoFactorEnabled })
      .from(user)
      .where(eq(user.id, who.id));
    expect(row?.on).toBe(true);
  });

  it("is blocked until it is on, except for its own routes", async () => {
    const who = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "minhanh",
    });
    const cookie = await plainSession(ctx, who);
    const other = await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "vantung",
    });
    const response = await lockPost(
      post(`/api/users/${other.id}/lock`, cookie),
      params(other.id),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Cần bật xác thực 2 lớp trước khi tiếp tục",
    });
    expect((await setup(cookie, who.password)).status).toBe(200);
  });

  it("guards the management routes by role", async () => {
    const sales = await createTestUser(ctx, {
      role: "SALES",
      username: "quocbao",
    });
    const cookie = await signInAs(ctx, sales);
    for (const handler of [
      () => backupPost(post("/x", cookie, { password: "x" })),
      () => replacePost(post("/x", cookie, { password: "x", code: "1" })),
      () => forgetPost(post("/x", cookie)),
      () => confirmPost(post("/x", cookie, { code: "1" })),
    ]) {
      expect((await handler()).status).toBe(403);
    }
  });
});

describe("POST /api/users/[id]/two-factor/reset", () => {
  it("is for flagged accounts only, even against a director", async () => {
    const director = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "minhanh",
    });
    const target = await createTestUser(ctx, {
      role: "ACCOUNTANT",
      username: "thuha",
    });
    await enroll(ctx, target);
    const response = await resetPost(
      post(
        `/api/users/${target.id}/two-factor/reset`,
        await signInAs(ctx, director),
        { password: director.password, code: "000000" },
      ),
      params(target.id),
    );
    expect(response.status).toBe(403);
  });

  it("clears it for a flagged account, which still cannot lock users", async () => {
    const admin = await createTestUser(ctx, {
      role: "SALES",
      username: "quocbao",
    });
    const target = await createTestUser(ctx, {
      role: "ACCOUNTANT",
      username: "thuha",
    });
    await enroll(ctx, target);
    await ctx.db
      .update(user)
      .set({ systemAdmin: true })
      .where(eq(user.id, admin.id));
    const factor = await enroll(ctx, admin);

    const reset = await resetPost(
      post(`/api/users/${target.id}/two-factor/reset`, factor.cookie, {
        password: admin.password,
        code: totpCode(factor.secret),
      }),
      params(target.id),
    );
    expect(reset.status).toBe(200);
    expect(reset.headers.get("cache-control")).toBe("no-store");

    const lock = await lockPost(
      post(`/api/users/${target.id}/lock`, factor.cookie),
      params(target.id),
    );
    expect(lock.status).toBe(403);
  });
});

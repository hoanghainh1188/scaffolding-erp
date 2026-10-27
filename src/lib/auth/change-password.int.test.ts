import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { POST as changePasswordRoute } from "@/app/api/me/password/route";
import { session, user } from "@/db/schema";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  resetAuthTables,
  signInAs,
  type TestUser,
} from "@/test/auth";

import { resolveCurrentUser } from "./session";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);

afterAll(async () => {
  uninstall();
  await ctx.close();
});
beforeEach(() => resetAuthTables(ctx));

const change = (cookie: string, body: Record<string, string>) =>
  changePasswordRoute(
    appRequest("/api/me/password", { method: "POST", cookie, body }),
  );

const body = (current: string, next: string, confirm = next) => ({
  currentPassword: current,
  newPassword: next,
  confirmPassword: confirm,
});

async function canSignIn(username: string, password: string) {
  try {
    await signInAs(ctx, { username, password });
    return true;
  } catch {
    return false;
  }
}

describe("POST /api/me/password", () => {
  let quocbao: TestUser;

  beforeEach(async () => {
    quocbao = await createTestUser(ctx, {
      role: "SALES",
      username: "quocbao",
      password: "cu-mat-khau-1",
    });
  });

  it("refuses a wrong current password and keeps the old one", async () => {
    const cookie = await signInAs(ctx, quocbao);
    const response = await change(cookie, body("sai-roi-123", "bai sau kho"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Mật khẩu hiện tại không đúng",
    });
    expect(await canSignIn("quocbao", "cu-mat-khau-1")).toBe(true);
  });

  it("applies the password rules", async () => {
    const cookie = await signInAs(ctx, quocbao);
    const response = await change(cookie, body("cu-mat-khau-1", "kho123"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Mật khẩu mới phải có ít nhất 8 ký tự",
    });
  });

  it("switches passwords and ends the other sessions only", async () => {
    const desktop = await signInAs(ctx, quocbao);
    const phone = await signInAs(ctx, quocbao);

    const response = await change(
      desktop,
      body("cu-mat-khau-1", "bai sau kho"),
    );
    expect(response.status).toBe(200);

    expect(await canSignIn("quocbao", "cu-mat-khau-1")).toBe(false);
    expect(await canSignIn("quocbao", "bai sau kho")).toBe(true);
    const read = (cookie: string) =>
      resolveCurrentUser(ctx.auth, new Headers({ cookie }));
    expect(await read(desktop)).not.toBeNull();
    expect(await read(phone)).toBeNull();
  });

  it("answers 401 without a session", async () => {
    const response = await change("", body("a", "b"));
    expect(response.status).toBe(401);
  });

  it("rejects a cross-site request", async () => {
    const cookie = await signInAs(ctx, quocbao);
    const request = new Request("http://localhost:3000/api/me/password", {
      method: "POST",
      headers: {
        cookie,
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: JSON.stringify(body("cu-mat-khau-1", "bai sau kho")),
    });
    expect((await changePasswordRoute(request)).status).toBe(403);
    expect(await canSignIn("quocbao", "cu-mat-khau-1")).toBe(true);
  });
});

describe("first sign-in with a temporary password", () => {
  it("must change it, then works normally", async () => {
    const ducluc = await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "ducluc",
      password: "giao-7342",
      mustChangePassword: true,
    });
    const cookie = await signInAs(ctx, ducluc);
    const before = await resolveCurrentUser(ctx.auth, new Headers({ cookie }));
    expect(before?.mustChangePassword).toBe(true);

    // The temporary password itself is not accepted as the new one.
    const same = await change(cookie, body("giao-7342", "giao-7342"));
    expect(await same.json()).toMatchObject({
      error: "Mật khẩu mới phải khác mật khẩu hiện tại",
    });

    const response = await change(cookie, body("giao-7342", "bai-sau-kho-9"));
    expect(response.status).toBe(200);
    const [stored] = await ctx.db
      .select({ mustChange: user.mustChangePassword })
      .from(user)
      .where(eq(user.id, ducluc.id));
    expect(stored?.mustChange).toBe(false);
    expect(await ctx.db.select().from(session)).toHaveLength(1);
    expect(await canSignIn("ducluc", "bai-sau-kho-9")).toBe(true);
  });
});

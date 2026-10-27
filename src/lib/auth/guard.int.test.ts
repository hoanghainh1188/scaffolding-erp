import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/lib/api-response";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  resetAuthTables,
  signInAs,
} from "@/test/auth";

// Pages read the request through next/headers; feed it the test cookie.
const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

// next.config.ts turns on experimental.authInterrupts; the build inlines
// this flag, so tests set it by hand.
process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "true";

const { GUARD_MESSAGES, requirePermission, requireUser, withAuth } =
  await import("./guard");

const ctx = createTestContext();
const uninstall = installTestContext(ctx);

afterAll(async () => {
  uninstall();
  await ctx.close();
});
beforeEach(() => resetAuthTables(ctx));

/** The digest Next.js puts on redirect()/forbidden() errors. */
async function interruption(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return String((error as { digest?: unknown }).digest ?? error);
  }
  return "none";
}

const asPage = (cookie: string, path = "/inventory") => {
  requestHeaders.current = new Headers({ cookie, "x-erp-path": path });
};

const echo = withAuth(async (_request, { user }) => ok({ role: user.role }), {
  permission: "users.manage",
});
const anyone = withAuth(async () => ok(null));

describe("withAuth", () => {
  it("answers 401 with the envelope when signed out", async () => {
    const response = await anyone(appRequest("/api/x"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: "Bạn cần đăng nhập",
    });
  });

  it("answers 403 for a role without the permission", async () => {
    const quocbao = await createTestUser(ctx, { role: "SALES" });
    const cookie = await signInAs(ctx, quocbao);
    const response = await echo(appRequest("/api/x", { cookie }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Bạn không có quyền thực hiện thao tác này",
    });
  });

  it("lets the right role through", async () => {
    const minhanh = await createTestUser(ctx, { role: "DIRECTOR" });
    const cookie = await signInAs(ctx, minhanh);
    const response = await echo(appRequest("/api/x", { cookie }));
    expect(await response.json()).toMatchObject({ data: { role: "DIRECTOR" } });
  });

  it("refuses writes from another origin or without one", async () => {
    const minhanh = await createTestUser(ctx, { role: "DIRECTOR" });
    const cookie = await signInAs(ctx, minhanh);
    const foreign = new Request("http://localhost:3000/api/x", {
      method: "POST",
      headers: { cookie, origin: "https://evil.example" },
    });
    const bare = new Request("http://localhost:3000/api/x", {
      method: "POST",
      headers: { cookie },
    });
    expect((await echo(foreign)).status).toBe(403);
    expect((await echo(bare)).status).toBe(403);
  });

  it("blocks APIs until a temporary password is changed", async () => {
    const ducluc = await createTestUser(ctx, {
      role: "DIRECTOR",
      mustChangePassword: true,
    });
    const cookie = await signInAs(ctx, ducluc);
    const response = await echo(appRequest("/api/x", { cookie }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: GUARD_MESSAGES.mustChangePassword,
    });
  });
});

describe("requireUser / requirePermission", () => {
  it("sends a signed-out visitor to /login with the page to return to", async () => {
    asPage("", "/m/history");
    expect(await interruption(() => requireUser())).toContain(
      "/login?next=%2Fm%2Fhistory",
    );
  });

  it("sends a pending password change to /change-password", async () => {
    const ducluc = await createTestUser(ctx, {
      role: "WAREHOUSE",
      mustChangePassword: true,
    });
    asPage(await signInAs(ctx, ducluc));
    expect(await interruption(() => requireUser())).toContain(
      ";/change-password;",
    );
    // The change-password page itself may render.
    await expect(
      requireUser({ allowPendingPasswordChange: true }),
    ).resolves.toMatchObject({ id: ducluc.id });
  });

  it("renders 403 for a role without the page permission", async () => {
    const thuha = await createTestUser(ctx, { role: "ACCOUNTANT" });
    asPage(await signInAs(ctx, thuha), "/settings/users");
    expect(await interruption(() => requirePermission("users.manage"))).toBe(
      "NEXT_HTTP_ERROR_FALLBACK;403",
    );
    await expect(requirePermission("receivables.view")).resolves.toMatchObject({
      role: "ACCOUNTANT",
    });
  });
});

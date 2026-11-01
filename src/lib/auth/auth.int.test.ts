import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  TEST_BASE_URL,
  createTestContext,
  createTestUser,
  resetAuthTables,
  signInAs,
} from "@/test/auth";

const ctx = createTestContext();

afterAll(ctx.close);
beforeEach(() => resetAuthTables());

async function post(path: string, body: unknown): Promise<Response> {
  return ctx.auth.handler(
    new Request(`${TEST_BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: TEST_BASE_URL },
      body: JSON.stringify(body),
    }),
  );
}

describe("Better Auth setup", () => {
  it("signs in from the server and reads the session back", async () => {
    const thuha = await createTestUser(ctx, {
      role: "ACCOUNTANT",
      username: "thuha",
      name: "Thu Hà",
    });
    const cookie = await signInAs(ctx, thuha);

    const session = await ctx.auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session?.user).toMatchObject({
      id: thuha.id,
      name: "Thu Hà",
      username: "thuha",
      role: "ACCOUNTANT",
      status: "ACTIVE",
    });
    expect(session?.session.persistent).toBe(true);
  });

  it("matches the login name in any case", async () => {
    const thuha = await createTestUser(ctx, {
      role: "ACCOUNTANT",
      username: "thuha",
    });
    await expect(
      signInAs(ctx, { ...thuha, username: "ThuHa" }),
    ).resolves.toContain("session_token");
  });

  it.each(["/sign-in/username", "/sign-in/email", "/sign-up/email"])(
    "answers 404 for %s over HTTP",
    async (path) => {
      await createTestUser(ctx, { role: "DIRECTOR", username: "minhanh" });
      const response = await post(path, {
        username: "minhanh",
        email: "x@users.invalid",
        name: "X",
        password: "test-pass-1234",
      });
      expect(response.status).toBe(404);
    },
  );
});

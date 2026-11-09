import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as signOutAllPost } from "@/app/api/users/[id]/sign-out-all/route";
import { user } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/auth/session";
import {
  TEST_BASE_URL,
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  resetAuthTables,
  signInAs,
} from "@/test/auth";

import { POST as signOutPost } from "./[id]/sign-out/route";
import { POST as othersPost } from "./sign-out-others/route";

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

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (path: string, cookie: string) =>
  appRequest(path, { method: "POST", cookie });
const current = (cookie: string) =>
  resolveCurrentUser(ctx.auth, new Headers({ cookie }));
async function idOf(cookie: string) {
  const found = await current(cookie);
  if (!found) throw new Error("expected a live session");
  return found.sessionId;
}

const callSignOut = (id: string, cookie: string) =>
  signOutPost(post(`/api/me/sessions/${id}/sign-out`, cookie), params(id));
const callOthers = (cookie: string) =>
  othersPost(post("/api/me/sessions/sign-out-others", cookie));
const callAll = (id: string, cookie: string) =>
  signOutAllPost(post(`/api/users/${id}/sign-out-all`, cookie), params(id));

const sales = (username = "quocbao") =>
  createTestUser(ctx, { role: "SALES", username });

describe("/api/me/sessions", () => {
  it("needs a session", async () => {
    expect((await callSignOut("x", "")).status).toBe(401);
    expect((await callOthers("")).status).toBe(401);
  });

  it("refuses another site", async () => {
    const who = await sales();
    const here = await signInAs(ctx, who);
    const there = await signInAs(ctx, who);
    const response = await othersPost(
      new Request(`${TEST_BASE_URL}/api/me/sessions/sign-out-others`, {
        method: "POST",
        headers: { origin: "https://evil.example", cookie: here },
      }),
    );
    expect(response.status).toBe(403);
    expect(await current(there)).not.toBeNull();
  });

  it("signs out another device, not this one", async () => {
    const who = await sales();
    const here = await signInAs(ctx, who);
    const there = await signInAs(ctx, who);

    expect((await callSignOut(await idOf(here), here)).status).toBe(400);
    expect((await callSignOut(await idOf(there), here)).status).toBe(200);
    expect(await current(there)).toBeNull();
    expect(await current(here)).not.toBeNull();
  });

  it("hides whether another person's session exists", async () => {
    const who = await sales();
    const here = await signInAs(ctx, who);
    const theirs = await signInAs(ctx, await sales("thuha"));

    expect((await callSignOut(await idOf(theirs), here)).status).toBe(404);
    expect((await callSignOut("no-such-session", here)).status).toBe(404);
    expect(await current(theirs)).not.toBeNull();
  });

  it("returns both counts for the other devices", async () => {
    const who = await sales();
    const here = await signInAs(ctx, who);
    await signInAs(ctx, who);

    const response = await callOthers(here);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { count: 1, forgotten: 0 },
    });
  });
});

describe("/api/users/[id]/sign-out-all", () => {
  it("lets a director sign an employee out", async () => {
    const boss = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "minhanh",
    });
    const who = await sales("vantung");
    const cookie = await signInAs(ctx, who);

    const response = await callAll(who.id, await signInAs(ctx, boss));

    expect(response.status).toBe(200);
    expect(await current(cookie)).toBeNull();
  });

  it("refuses an accountant", async () => {
    const accountant = await createTestUser(ctx, {
      role: "ACCOUNTANT",
      username: "thuha",
    });
    const who = await sales("vantung");
    const cookie = await signInAs(ctx, who);

    expect(
      (await callAll(who.id, await signInAs(ctx, accountant))).status,
    ).toBe(403);
    expect(await current(cookie)).not.toBeNull();
  });

  it("refuses a system admin who is not a director", async () => {
    const admin = await sales("quocbao");
    await ctx.db
      .update(user)
      .set({ systemAdmin: true })
      .where(eq(user.id, admin.id));
    const who = await sales("vantung");
    const cookie = await signInAs(ctx, who);

    expect((await callAll(who.id, await signInAs(ctx, admin))).status).toBe(
      403,
    );
    expect(await current(cookie)).not.toBeNull();
  });
});

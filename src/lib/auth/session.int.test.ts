import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { session, user } from "@/db/schema";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
  signInAs,
} from "@/test/auth";

import { resolveCurrentUser } from "./session";
import { SHORT_SESSION_MS } from "@/domain/device-session";

const ctx = createTestContext();

afterAll(ctx.close);
beforeEach(() => resetAuthTables());

const DAY_MS = 24 * 60 * 60 * 1000;

const read = (cookie: string, now?: Date) =>
  resolveCurrentUser(ctx.auth, new Headers({ cookie }), now);

describe("resolveCurrentUser", () => {
  it("returns the signed-in user with role and name", async () => {
    const thuha = await createTestUser(ctx, {
      role: "ACCOUNTANT",
      username: "thuha",
      name: "Thu Hà",
    });
    expect(await read(await signInAs(ctx, thuha))).toMatchObject({
      id: thuha.id,
      name: "Thu Hà",
      username: "thuha",
      role: "ACCOUNTANT",
      mustChangePassword: false,
    });
  });

  it("returns null without a cookie or with an unknown one", async () => {
    expect(await read("")).toBeNull();
    expect(await read("better-auth.session_token=forged.value")).toBeNull();
  });

  it("keeps a ticked session on day 29", async () => {
    const vantung = await createTestUser(ctx, { role: "WAREHOUSE" });
    const cookie = await signInAs(ctx, vantung, true);
    expect(
      await read(cookie, new Date(Date.now() + 29 * DAY_MS)),
    ).not.toBeNull();
  });

  it("ends an unticked session 12 hours and 1 minute after sign-in", async () => {
    const thuha = await createTestUser(ctx, { role: "ACCOUNTANT" });
    const cookie = await signInAs(ctx, thuha, false);
    await ctx.db
      .update(session)
      .set({ persistent: false })
      .where(eq(session.userId, thuha.id));
    const [stored] = await ctx.db.select().from(session);
    const createdAt = stored?.createdAt.getTime() ?? 0;

    expect(
      await read(cookie, new Date(createdAt + SHORT_SESSION_MS)),
    ).not.toBeNull();
    expect(
      await read(cookie, new Date(createdAt + SHORT_SESSION_MS + 60_000)),
    ).toBeNull();
  });

  it("drops the session of an account locked meanwhile", async () => {
    const hoangnam = await createTestUser(ctx, { role: "WORKSHOP" });
    const cookie = await signInAs(ctx, hoangnam);
    await ctx.db
      .update(user)
      .set({ status: "LOCKED" })
      .where(eq(user.id, hoangnam.id));
    expect(await read(cookie)).toBeNull();
  });

  it("sees a role change on the next request", async () => {
    const lanphuong = await createTestUser(ctx, { role: "SALES" });
    const cookie = await signInAs(ctx, lanphuong);
    await ctx.db
      .update(user)
      .set({ role: "ACCOUNTANT" })
      .where(eq(user.id, lanphuong.id));
    expect((await read(cookie))?.role).toBe("ACCOUNTANT");
  });
});

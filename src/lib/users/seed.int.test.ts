import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { user } from "@/db/schema";
import { createTestContext, resetAuthTables, signInAs } from "@/test/auth";

import { DEV_ACCOUNTS, seedAccounts } from "./seed";

const ctx = createTestContext();

afterAll(ctx.close);
beforeEach(() => resetAuthTables(ctx));

describe("seedAccounts", () => {
  it("creates the 5 sample accounts once", async () => {
    const first = await seedAccounts(ctx, DEV_ACCOUNTS, {
      password: "dev-pass-1234",
    });
    const second = await seedAccounts(ctx, DEV_ACCOUNTS, {
      password: "other-pass-1",
    });
    expect(first).toHaveLength(5);
    expect(second).toEqual([]);
    expect(await ctx.db.select().from(user)).toHaveLength(5);
    // The second run left the first password in place.
    await expect(
      signInAs(ctx, { username: "thukho", password: "dev-pass-1234" }),
    ).resolves.toBeTruthy();
  });

  it("puts accounts back to a known state when asked", async () => {
    await seedAccounts(ctx, DEV_ACCOUNTS, { password: "dev-pass-1234" });
    await ctx.db
      .update(user)
      .set({ status: "LOCKED" })
      .where(eq(user.username, "thukho"));
    await seedAccounts(ctx, DEV_ACCOUNTS, {
      password: "e2e-pass-1234",
      reset: true,
    });

    const [row] = await ctx.db
      .select()
      .from(user)
      .where(eq(user.username, "thukho"));
    expect(row).toMatchObject({ status: "ACTIVE", mustChangePassword: false });
    await expect(
      signInAs(ctx, { username: "thukho", password: "e2e-pass-1234" }),
    ).resolves.toBeTruthy();
  });
});

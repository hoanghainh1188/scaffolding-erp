import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { truncateWithLedger } from "@/test/inventory";

import { user } from "./auth";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const { db, close } = createDatabase(url);

afterAll(close);

beforeEach(async () => {
  await truncateWithLedger(db, sql`truncate table "user" cascade`);
});

const row = (overrides: Partial<typeof user.$inferInsert> = {}) => ({
  id: "u1",
  name: "Thu Hà",
  email: "thuha@users.invalid",
  username: "thuha",
  role: "ACCOUNTANT",
  ...overrides,
});

/** Postgres error code and constraint name, read from the driver error. */
async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  const cause = (error as { cause?: Record<string, unknown> } | undefined)
    ?.cause;
  return { code: cause?.code, constraint: cause?.constraint_name };
}

describe("auth tables", () => {
  it("stores a user with ACTIVE status and a pending password change", async () => {
    await db.insert(user).values(row());
    const [stored] = await db.select().from(user);
    expect(stored).toMatchObject({
      status: "ACTIVE",
      mustChangePassword: true,
      lastLoginAt: null,
    });
  });

  it("rejects a role outside the five roles", async () => {
    expect(
      await rejection(db.insert(user).values(row({ role: "ADMIN" }))),
    ).toEqual({ code: "23514", constraint: "user_role_check" });
  });

  it("rejects an unknown status and device", async () => {
    expect(
      await rejection(db.insert(user).values(row({ status: "DELETED" }))),
    ).toMatchObject({ constraint: "user_status_check" });
    expect(
      await rejection(
        db.insert(user).values(row({ lastLoginDevice: "TABLET" })),
      ),
    ).toMatchObject({ constraint: "user_last_login_device_check" });
  });

  it("rejects upper-case and duplicate usernames", async () => {
    expect(
      await rejection(db.insert(user).values(row({ username: "ThuHa" }))),
    ).toMatchObject({ constraint: "user_username_lower_check" });

    await db.insert(user).values(row());
    expect(
      await rejection(
        db.insert(user).values(row({ id: "u2", email: "other@users.invalid" })),
      ),
    ).toEqual({ code: "23505", constraint: "user_username_unique" });
  });
});

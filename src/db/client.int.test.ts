import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createDatabase } from "./client";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}
const { db, close } = createDatabase(url);

afterAll(async () => {
  await close();
});

describe("database client", () => {
  it("runs a query against the test database", async () => {
    const rows = await db.execute<{ one: number }>(sql`select 1 as one`);
    expect(rows[0]?.one).toBe(1);
  });

  it("uses UTC as the session time zone", async () => {
    const rows = await db.execute<{ TimeZone: string }>(sql`show timezone`);
    expect(rows[0]?.TimeZone).toBe("UTC");
  });
});

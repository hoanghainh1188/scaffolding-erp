import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createDatabase } from "@/db/client";

import { checkHealth, healthResponse } from "./health";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const live = createDatabase(url);
// Nothing listens on port 1: the connection is refused immediately.
const deadUrl = "postgres://erp:s3cret-pass@127.0.0.1:1/scaffolding_erp";
const dead = createDatabase(deadUrl);

afterAll(async () => {
  await Promise.all([live.close(), dead.close()]);
});

describe("health check against Postgres", () => {
  it("answers 200 when the database is up", async () => {
    const report = await checkHealth(() => live.db.execute(sql`select 1`));
    const response = healthResponse(report);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { status: "ok", database: "ok" },
      error: null,
    });
  });

  it("answers 503 without leaking the URL or driver error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const report = await checkHealth(() => dead.db.execute(sql`select 1`));
    const response = healthResponse(report);
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toEqual({
      success: false,
      data: { status: "degraded", database: "unreachable" },
      error: "Không kết nối được cơ sở dữ liệu",
    });
    expect(text).not.toContain("s3cret-pass");
    expect(text).not.toContain("127.0.0.1");
    expect(text).not.toContain("ECONNREFUSED");
  });
});

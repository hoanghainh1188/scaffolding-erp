import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { loginThrottle } from "@/db/schema";
import { resetAuthTables } from "@/test/auth";

const execFileAsync = promisify(execFile);

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const { db, close } = createDatabase(url);

afterAll(close);
beforeEach(async () => {
  await resetAuthTables({ db } as never);
});

describe("scripts/unlock-user.mts", () => {
  it("clears throttle records for a specific username via CLI", async () => {
    await db.insert(loginThrottle).values([
      {
        usernameKey: "giamdoc",
        ip: "1.1.1.1",
        failedCount: 5,
        firstFailedAt: new Date(),
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      },
      {
        usernameKey: "giamdoc",
        ip: "2.2.2.2",
        failedCount: 5,
        firstFailedAt: new Date(),
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      },
      {
        usernameKey: "ketoan",
        ip: "3.3.3.3",
        failedCount: 5,
        firstFailedAt: new Date(),
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      },
    ]);

    const { stdout } = await execFileAsync(
      "node",
      [
        "--import",
        "./scripts/register-aliases.mjs",
        "scripts/unlock-user.mts",
        "--username",
        "giamdoc",
      ],
      {
        env: { ...process.env, DATABASE_URL: url },
      },
    );

    expect(stdout).toContain(
      'Đã gỡ tạm khóa cho tài khoản "giamdoc" (2 bản ghi IP)',
    );

    const remaining = await db.select().from(loginThrottle);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.usernameKey).toBe("ketoan");
  });

  it("clears all throttle records with --all", async () => {
    await db.insert(loginThrottle).values([
      {
        usernameKey: "giamdoc",
        ip: "1.1.1.1",
        failedCount: 5,
        firstFailedAt: new Date(),
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      },
      {
        usernameKey: "ketoan",
        ip: "3.3.3.3",
        failedCount: 5,
        firstFailedAt: new Date(),
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      },
    ]);

    const { stdout } = await execFileAsync(
      "node",
      [
        "--import",
        "./scripts/register-aliases.mjs",
        "scripts/unlock-user.mts",
        "--all",
      ],
      {
        env: { ...process.env, DATABASE_URL: url },
      },
    );

    expect(stdout).toContain("Đã gỡ tạm khóa toàn bộ hệ thống (2 bản ghi)");

    const remaining = await db.select().from(loginThrottle);
    expect(remaining).toHaveLength(0);
  });
});

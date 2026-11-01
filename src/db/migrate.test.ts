import { describe, expect, it } from "vitest";

import { resolveMigrationUrl } from "./migrate.mts";

describe("resolveMigrationUrl", () => {
  it("uses DATABASE_URL_MIGRATE", () => {
    const owner = "postgres://owner:pass@direct:5432/db";
    expect(
      resolveMigrationUrl({
        DATABASE_URL_MIGRATE: owner,
        DATABASE_URL: "postgres://app:pass@pooler:5432/db",
      }),
    ).toBe(owner);
  });

  it("does not fall back to DATABASE_URL (the app role)", () => {
    expect(() =>
      resolveMigrationUrl({ DATABASE_URL: "postgres://app:pass@pooler/db" }),
    ).toThrow(/DATABASE_URL_MIGRATE is not set/);
  });

  it("ignores the retired DATABASE_URL_UNPOOLED", () => {
    expect(() =>
      resolveMigrationUrl({
        DATABASE_URL_UNPOOLED: "postgres://owner:pass@direct/db",
      }),
    ).toThrow(/DATABASE_URL_MIGRATE/);
  });

  it("treats an empty value as missing and never prints a URL", () => {
    let message = "";
    try {
      resolveMigrationUrl({
        DATABASE_URL_MIGRATE: "  ",
        DATABASE_URL: "postgres://app:secret@pooler/db",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL_MIGRATE");
    expect(message).not.toContain("secret");
  });
});

import { describe, expect, it } from "vitest";

import { resolveMigrationUrl } from "./migrate.mts";

describe("resolveMigrationUrl", () => {
  it("prefers DATABASE_URL_UNPOOLED when both are present", () => {
    const unpooled = "postgres://user:pass@direct:5432/db";
    const pooled = "postgres://user:pass@pooler:5432/db";
    const resolved = resolveMigrationUrl({
      DATABASE_URL_UNPOOLED: unpooled,
      DATABASE_URL: pooled,
    });
    expect(resolved).toBe(unpooled);
  });

  it("falls back to DATABASE_URL when DATABASE_URL_UNPOOLED is missing", () => {
    const pooled = "postgres://user:pass@pooler:5432/db";
    const resolved = resolveMigrationUrl({
      DATABASE_URL: pooled,
    });
    expect(resolved).toBe(pooled);
  });

  it("falls back to DATABASE_URL when DATABASE_URL_UNPOOLED is empty", () => {
    const pooled = "postgres://user:pass@pooler:5432/db";
    const resolved = resolveMigrationUrl({
      DATABASE_URL_UNPOOLED: "",
      DATABASE_URL: pooled,
    });
    expect(resolved).toBe(pooled);
  });

  it("throws an error when neither URL is set", () => {
    expect(() => resolveMigrationUrl({})).toThrow(
      /Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set/,
    );
  });
});

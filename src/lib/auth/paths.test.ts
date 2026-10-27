import { describe, expect, it } from "vitest";

import {
  afterSignInPath,
  homePathFor,
  isPublicPath,
  loginPathFor,
  safeNextPath,
} from "./paths";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/api/health",
    "/api/auth/sign-out",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/favicon.ico",
    "/_next/static/chunk.js",
  ])("%s is public", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each([
    "/",
    "/dashboard",
    "/m",
    "/m/history",
    "/api/users",
    "/login2",
    "/change-password",
  ])("%s needs a session", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps a path on this site, with its query", () => {
    expect(safeNextPath("/inventory")).toBe("/inventory");
    expect(safeNextPath("/settings/users?role=WAREHOUSE")).toBe(
      "/settings/users?role=WAREHOUSE",
    );
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "inventory",
    "/login",
    "/login?next=/x",
    // The URL parser folds these into "//evil.com" (security review).
    "/.//evil.com",
    "/a/..//evil.com",
    "/%2e//evil.com",
    "/.\\evil.com",
    "",
    null,
  ])("drops %s", (next) => {
    expect(safeNextPath(next)).toBeNull();
  });
});

describe("loginPathFor", () => {
  it("carries the page to come back to", () => {
    expect(loginPathFor("/m/history")).toBe("/login?next=%2Fm%2Fhistory");
  });

  it("drops an outside or empty target", () => {
    expect(loginPathFor("//evil.example")).toBe("/login");
    expect(loginPathFor("/")).toBe("/login");
    expect(loginPathFor(null)).toBe("/login");
  });
});

describe("after sign-in", () => {
  it("sends office roles to the dashboard and phone roles to /m", () => {
    expect(homePathFor("ACCOUNTANT")).toBe("/dashboard");
    expect(homePathFor("WAREHOUSE")).toBe("/m");
    expect(homePathFor("WORKSHOP")).toBe("/m");
  });

  it("prefers a safe next", () => {
    expect(afterSignInPath("SALES", "/inventory")).toBe("/inventory");
    expect(afterSignInPath("SALES", "https://evil.example")).toBe("/dashboard");
  });
});

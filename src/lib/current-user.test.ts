import { describe, expect, it } from "vitest";

import { getCurrentUser } from "./current-user";
import { ConfigError, type Env } from "./env";

const env = (overrides: Partial<Env>): Env => ({
  NODE_ENV: "development",
  DATABASE_URL: "postgres://localhost/x",
  DEV_ROLE: "DIRECTOR",
  ...overrides,
});

describe("getCurrentUser", () => {
  it("returns the fake user with the configured role in development", () => {
    expect(getCurrentUser(env({ DEV_ROLE: "SALES" }))).toEqual({
      id: "dev",
      name: "Người dùng thử",
      role: "SALES",
    });
  });

  it("defaults to Giám đốc", () => {
    expect(getCurrentUser(env({})).role).toBe("DIRECTOR");
  });

  it("refuses the fake user in production", () => {
    expect(() => getCurrentUser(env({ NODE_ENV: "production" }))).toThrow(
      ConfigError,
    );
    expect(() => getCurrentUser(env({ NODE_ENV: "production" }))).toThrow(
      "Chưa cấu hình đăng nhập",
    );
  });
});

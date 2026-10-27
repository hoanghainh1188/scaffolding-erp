import { describe, expect, it } from "vitest";

import { ConfigError, parseEnv } from "./env";

const SECRET = "x".repeat(32);

const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://erp:secret@localhost:5432/scaffolding_erp",
  BETTER_AUTH_SECRET: SECRET,
};

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

describe("parseEnv", () => {
  it("accepts a valid configuration with local defaults", () => {
    expect(parseEnv(valid)).toEqual({
      NODE_ENV: "development",
      DATABASE_URL: valid.DATABASE_URL,
      BETTER_AUTH_SECRET: SECRET,
      BETTER_AUTH_URL: "http://localhost:3000",
      DEV_SEED_PASSWORD: undefined,
      E2E_PASSWORD: undefined,
      AUTH_SIGN_IN_LIMIT_PER_MINUTE: 20,
    });
  });

  it("accepts postgresql:// URLs and an auth URL", () => {
    const env = parseEnv({
      ...valid,
      DATABASE_URL: "postgresql://erp@db/erp",
      BETTER_AUTH_URL: "https://erp.example.vn",
    });
    expect(env.BETTER_AUTH_URL).toBe("https://erp.example.vn");
  });

  it("names a missing DATABASE_URL", () => {
    const rest = { ...valid, DATABASE_URL: undefined };
    expect(() => parseEnv(rest)).toThrow(ConfigError);
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL: thiếu biến này/);
  });

  it("rejects a non-URL DATABASE_URL without echoing its value", () => {
    const message = messageOf(() =>
      parseEnv({ ...valid, DATABASE_URL: "localhost:5432" }),
    );
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("postgres://");
    expect(message).not.toContain("localhost:5432");
  });

  it("never prints the database password", () => {
    expect(() =>
      parseEnv({ ...valid, DATABASE_URL: "mysql://u:hunter2@db/x" }),
    ).toThrow(/^(?!.*hunter2)/s);
  });

  it("requires BETTER_AUTH_SECRET", () => {
    const rest = { ...valid, BETTER_AUTH_SECRET: undefined };
    expect(() => parseEnv(rest)).toThrow(/BETTER_AUTH_SECRET: thiếu biến này/);
  });

  it("rejects a 31-character secret without echoing it", () => {
    const short = "s".repeat(31);
    const message = messageOf(() =>
      parseEnv({ ...valid, BETTER_AUTH_SECRET: short }),
    );
    expect(message).toMatch(/BETTER_AUTH_SECRET: phải dài ít nhất 32 ký tự/);
    expect(message).not.toContain(short);
  });

  it("rejects a malformed BETTER_AUTH_URL", () => {
    expect(() =>
      parseEnv({ ...valid, BETTER_AUTH_URL: "erp.example.vn" }),
    ).toThrow(/BETTER_AUTH_URL: phải là URL/);
  });

  it("requires BETTER_AUTH_URL in production", () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: "production" })).toThrow(
      /BETTER_AUTH_URL: thiếu biến này/,
    );
  });

  it("rejects a short seed password", () => {
    expect(() => parseEnv({ ...valid, DEV_SEED_PASSWORD: "1234" })).toThrow(
      /DEV_SEED_PASSWORD/,
    );
  });

  it("reports every problem at once", () => {
    expect(() => parseEnv({ NODE_ENV: "development" })).toThrow(
      /DATABASE_URL[\s\S]*BETTER_AUTH_SECRET/,
    );
  });
});

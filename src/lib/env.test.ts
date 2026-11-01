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
      DATABASE_URL_UNPOOLED: undefined,
      BETTER_AUTH_SECRET: SECRET,
      BETTER_AUTH_URL: "http://localhost:3000",
      DEV_SEED_PASSWORD: undefined,
      E2E_PASSWORD: undefined,
      AUTH_SIGN_IN_LIMIT_PER_MINUTE: 20,
      DB_POOL_MAX: 10,
      DB_IDLE_TIMEOUT_SECONDS: undefined,
      DB_CONNECT_TIMEOUT_SECONDS: 3,
      DB_PREPARE: true,
      DEMO_MODE: false,
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

  describe("serverless db connection env", () => {
    it("accepts valid custom pool settings and unpooled url", () => {
      const env = parseEnv({
        ...valid,
        DB_POOL_MAX: "5",
        DB_IDLE_TIMEOUT_SECONDS: "15",
        DB_CONNECT_TIMEOUT_SECONDS: "10",
        DB_PREPARE: "false",
        DATABASE_URL_UNPOOLED: "postgres://erp:secret@direct-host:5432/erp",
      });
      expect(env.DB_POOL_MAX).toBe(5);
      expect(env.DB_IDLE_TIMEOUT_SECONDS).toBe(15);
      expect(env.DB_CONNECT_TIMEOUT_SECONDS).toBe(10);
      expect(env.DB_PREPARE).toBe(false);
      expect(env.DATABASE_URL_UNPOOLED).toBe(
        "postgres://erp:secret@direct-host:5432/erp",
      );
    });

    it("parses DB_PREPARE flexibly (1, 0, true, false)", () => {
      expect(parseEnv({ ...valid, DB_PREPARE: "0" }).DB_PREPARE).toBe(false);
      expect(parseEnv({ ...valid, DB_PREPARE: "1" }).DB_PREPARE).toBe(true);
      expect(parseEnv({ ...valid, DB_PREPARE: "true" }).DB_PREPARE).toBe(true);
      expect(parseEnv({ ...valid, DB_PREPARE: "false" }).DB_PREPARE).toBe(
        false,
      );
    });

    it("allows DB_IDLE_TIMEOUT_SECONDS to be 0", () => {
      expect(
        parseEnv({ ...valid, DB_IDLE_TIMEOUT_SECONDS: "0" })
          .DB_IDLE_TIMEOUT_SECONDS,
      ).toBe(0);
    });

    it("rejects invalid DB_POOL_MAX", () => {
      expect(() => parseEnv({ ...valid, DB_POOL_MAX: "0" })).toThrow(
        /DB_POOL_MAX: phải là số nguyên dương/,
      );
      expect(() => parseEnv({ ...valid, DB_POOL_MAX: "-1" })).toThrow(
        /DB_POOL_MAX: phải là số nguyên dương/,
      );
      expect(() => parseEnv({ ...valid, DB_POOL_MAX: "abc" })).toThrow(
        /DB_POOL_MAX: phải là số nguyên dương/,
      );
    });

    it("rejects negative DB_IDLE_TIMEOUT_SECONDS", () => {
      expect(() =>
        parseEnv({ ...valid, DB_IDLE_TIMEOUT_SECONDS: "-1" }),
      ).toThrow(/DB_IDLE_TIMEOUT_SECONDS: phải là số nguyên không âm/);
    });

    it("rejects non-positive DB_CONNECT_TIMEOUT_SECONDS", () => {
      expect(() =>
        parseEnv({ ...valid, DB_CONNECT_TIMEOUT_SECONDS: "0" }),
      ).toThrow(/DB_CONNECT_TIMEOUT_SECONDS: phải là số nguyên dương/);
    });

    it("rejects invalid DB_PREPARE", () => {
      expect(() =>
        parseEnv({ ...valid, DB_PREPARE: "invalid-boolean" }),
      ).toThrow(/DB_PREPARE: phải là boolean/);
    });

    it("rejects malformed DATABASE_URL_UNPOOLED without printing value", () => {
      const message = messageOf(() =>
        parseEnv({ ...valid, DATABASE_URL_UNPOOLED: "localhost:5432" }),
      );
      expect(message).toContain("DATABASE_URL_UNPOOLED");
      expect(message).toContain("postgres://");
      expect(message).not.toContain("localhost:5432");
    });
  });

  describe("demo environment env (K9)", () => {
    it("parses DEMO_MODE correctly (true, 1, false, 0)", () => {
      expect(parseEnv({ ...valid, DEMO_MODE: "true" }).DEMO_MODE).toBe(true);
      expect(parseEnv({ ...valid, DEMO_MODE: "1" }).DEMO_MODE).toBe(true);
      expect(parseEnv({ ...valid, DEMO_MODE: "false" }).DEMO_MODE).toBe(false);
      expect(parseEnv({ ...valid, DEMO_MODE: "0" }).DEMO_MODE).toBe(false);
      expect(parseEnv({ ...valid, DEMO_MODE: undefined }).DEMO_MODE).toBe(
        false,
      );
    });

    it("rejects invalid DEMO_MODE", () => {
      expect(() => parseEnv({ ...valid, DEMO_MODE: "maybe" })).toThrow(
        /DEMO_MODE: phải là boolean/,
      );
    });

    it("derives BETTER_AUTH_URL from VERCEL_URL on preview deployments", () => {
      const env = parseEnv({
        ...valid,
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        VERCEL_URL: "scaffolding-erp-pr-42.vercel.app",
        BETTER_AUTH_URL: undefined,
      });
      expect(env.BETTER_AUTH_URL).toBe(
        "https://scaffolding-erp-pr-42.vercel.app",
      );
    });
  });

  describe("error monitoring env (K11)", () => {
    it("parses valid SENTRY_DSN and ERROR_MONITORING_ENABLED", () => {
      const env = parseEnv({
        ...valid,
        SENTRY_DSN: "https://key@o123.ingest.sentry.io/456",
        ERROR_MONITORING_ENABLED: "true",
      });
      expect(env.SENTRY_DSN).toBe("https://key@o123.ingest.sentry.io/456");
      expect(env.ERROR_MONITORING_ENABLED).toBe(true);
    });

    it("rejects invalid SENTRY_DSN", () => {
      expect(() =>
        parseEnv({
          ...valid,
          SENTRY_DSN: "not-a-url",
        }),
      ).toThrow(/SENTRY_DSN: phải là URL/);
    });
  });
});

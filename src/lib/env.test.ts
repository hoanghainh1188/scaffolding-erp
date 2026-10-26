import { describe, expect, it } from "vitest";

import { ConfigError, parseEnv } from "./env";

const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://erp:secret@localhost:5432/scaffolding_erp",
};

describe("parseEnv", () => {
  it("accepts a valid configuration and defaults DEV_ROLE to DIRECTOR", () => {
    expect(parseEnv(valid)).toEqual({
      NODE_ENV: "development",
      DATABASE_URL: valid.DATABASE_URL,
      DEV_ROLE: "DIRECTOR",
    });
  });

  it("accepts postgresql:// URLs and a chosen role", () => {
    const env = parseEnv({
      ...valid,
      DATABASE_URL: "postgresql://erp@db/erp",
      DEV_ROLE: "SALES",
    });
    expect(env.DEV_ROLE).toBe("SALES");
  });

  it("names a missing DATABASE_URL", () => {
    expect(() => parseEnv({ NODE_ENV: "development" })).toThrow(ConfigError);
    expect(() => parseEnv({ NODE_ENV: "development" })).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-URL DATABASE_URL without echoing its value", () => {
    let message = "";
    try {
      parseEnv({ ...valid, DATABASE_URL: "localhost:5432" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("postgres://");
    expect(message).not.toContain("localhost:5432");
  });

  it("never prints the database password", () => {
    expect(() =>
      parseEnv({ ...valid, DATABASE_URL: "mysql://u:hunter2@db/x" }),
    ).toThrow(/^(?!.*hunter2)/s);
  });

  it("lists the allowed roles for a wrong DEV_ROLE", () => {
    expect(() => parseEnv({ ...valid, DEV_ROLE: "ADMIN" })).toThrow(
      /DEV_ROLE.*DIRECTOR, ACCOUNTANT, SALES, WAREHOUSE, WORKSHOP/s,
    );
  });

  it("reports every problem at once", () => {
    expect(() => parseEnv({ DEV_ROLE: "ADMIN" })).toThrow(
      /DATABASE_URL[\s\S]*DEV_ROLE/,
    );
  });
});

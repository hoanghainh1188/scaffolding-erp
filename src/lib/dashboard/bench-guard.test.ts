// The bench refuses any database but its own (dashboard-basic task 7.1).
import { describe, expect, it } from "vitest";

import { BENCH_MESSAGES, benchTarget, databaseName } from "./bench-guard";

const url = (name: string, user = "erp") =>
  `postgres://${user}:x@localhost:5432/${name}`;

const env = (extra: Record<string, string> = {}) => ({
  BENCH_DATABASE_URL: url("scaffolding_erp_bench"),
  BENCH_APP_DATABASE_URL: url("scaffolding_erp_bench", "erp_app"),
  DATABASE_URL: url("scaffolding_erp", "erp_app"),
  TEST_DATABASE_URL: url("scaffolding_erp_test", "erp_app"),
  ...extra,
});

describe("benchTarget", () => {
  it("accepts a database of its own", () => {
    expect(benchTarget(env())).toEqual({
      owner: url("scaffolding_erp_bench"),
      app: url("scaffolding_erp_bench", "erp_app"),
    });
  });

  it("refuses without both variables", () => {
    expect(() => benchTarget({ BENCH_DATABASE_URL: url("x_bench") })).toThrow(
      BENCH_MESSAGES.missing,
    );
  });

  it("refuses a name that does not end with _bench", () => {
    expect(() =>
      benchTarget(
        env({
          BENCH_DATABASE_URL: url("scaffolding_erp"),
          BENCH_APP_DATABASE_URL: url("scaffolding_erp", "erp_app"),
        }),
      ),
    ).toThrow(BENCH_MESSAGES.badName("scaffolding_erp"));
  });

  it("refuses the dev or test database even when named _bench", () => {
    expect(() =>
      benchTarget(env({ DATABASE_URL: url("scaffolding_erp_bench") })),
    ).toThrow(BENCH_MESSAGES.sameAs("scaffolding_erp_bench", "DATABASE_URL"));
    expect(() =>
      benchTarget(env({ TEST_DATABASE_URL: url("scaffolding_erp_bench") })),
    ).toThrow(
      BENCH_MESSAGES.sameAs("scaffolding_erp_bench", "TEST_DATABASE_URL"),
    );
  });

  it("refuses two different databases", () => {
    expect(() =>
      benchTarget(env({ BENCH_APP_DATABASE_URL: url("other_bench") })),
    ).toThrow(BENCH_MESSAGES.twoDatabases);
  });

  it("reads the database name", () => {
    expect(databaseName(url("a_bench"))).toBe("a_bench");
    expect(databaseName("not a url")).toBe("");
  });
});

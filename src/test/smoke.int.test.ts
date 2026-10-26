import { describe, expect, it } from "vitest";

describe("integration project", () => {
  it("receives a Postgres TEST_DATABASE_URL", () => {
    expect(process.env.TEST_DATABASE_URL).toMatch(/^postgres(ql)?:\/\//);
  });
});

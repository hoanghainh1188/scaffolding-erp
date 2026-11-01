import { describe, expect, it } from "vitest";

import { isLocalDatabase } from "./db-roles.mts";

describe("isLocalDatabase", () => {
  it("accepts local Docker and the CI service container", () => {
    expect(isLocalDatabase("postgres://erp:erp@localhost:5432/db")).toBe(true);
    expect(isLocalDatabase("postgres://erp:erp@127.0.0.1:5432/db")).toBe(true);
    expect(isLocalDatabase("postgres://erp:erp@postgres:5432/db")).toBe(true);
  });

  it("refuses hosted databases such as Neon", () => {
    expect(
      isLocalDatabase(
        "postgres://neondb_owner:x@ep-seed.ap-southeast-1.aws.neon.tech/neondb",
      ),
    ).toBe(false);
  });

  it("refuses values that are not URLs", () => {
    expect(isLocalDatabase("localhost:5432")).toBe(false);
  });
});

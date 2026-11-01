import { describe, expect, it } from "vitest";

import { DEFAULT_APP_ROLE, GrantError, resolveAppRole } from "./grants";

describe("resolveAppRole", () => {
  it("defaults to erp_app", () => {
    expect(resolveAppRole({})).toBe(DEFAULT_APP_ROLE);
    expect(resolveAppRole({ DB_APP_ROLE: "" })).toBe("erp_app");
  });

  it("takes one role per company database (0.2 #33)", () => {
    expect(resolveAppRole({ DB_APP_ROLE: "cty_a_app" })).toBe("cty_a_app");
  });

  it("rejects names that are not plain lower-case identifiers", () => {
    for (const name of ['erp"; drop table x; --', "Erp_App", "1app", "a-b"]) {
      expect(() => resolveAppRole({ DB_APP_ROLE: name })).toThrow(GrantError);
    }
  });
});

import { describe, expect, it } from "vitest";

import { parseSidebarPreference } from "./sidebar-preference";

describe("parseSidebarPreference", () => {
  it("reads a saved choice", () => {
    expect(parseSidebarPreference("expanded")).toBe("expanded");
    expect(parseSidebarPreference("collapsed")).toBe("collapsed");
  });

  it("treats anything else as no choice", () => {
    expect(parseSidebarPreference(undefined)).toBeNull();
    expect(parseSidebarPreference("true")).toBeNull();
    expect(parseSidebarPreference("")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  isValidUsername,
  normalizeUsername,
  placeholderEmail,
} from "./username";

describe("normalizeUsername", () => {
  it("ignores case and outer spaces", () => {
    expect(normalizeUsername("  ThuHa ")).toBe("thuha");
  });
});

describe("isValidUsername", () => {
  it.each(["thuha", "thu.ha", "kho_2", "abc", "a".repeat(32)])(
    "accepts %s",
    (name) => {
      expect(isValidUsername(name)).toBe(true);
    },
  );

  it.each([
    "ab",
    "a".repeat(33),
    "đức lực",
    "duc luc",
    "ThuHa",
    ".thuha",
    "thuha_",
    "thu..ha",
    "thu-ha",
  ])("rejects %s", (name) => {
    expect(isValidUsername(name)).toBe(false);
  });
});

describe("placeholderEmail", () => {
  it("uses the reserved .invalid domain", () => {
    expect(placeholderEmail("thuha")).toBe("thuha@users.invalid");
  });
});

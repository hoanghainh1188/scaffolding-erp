import { describe, expect, it } from "vitest";

import { TEMP_PASSWORD_WORDS, generateTempPassword } from "./temp-password";

describe("TEMP_PASSWORD_WORDS", () => {
  it("has 256 distinct words of 3 to 6 plain letters", () => {
    expect(TEMP_PASSWORD_WORDS).toHaveLength(256);
    expect(new Set(TEMP_PASSWORD_WORDS).size).toBe(256);
    for (const word of TEMP_PASSWORD_WORDS) {
      expect(word).toMatch(/^[a-z]{3,6}$/);
    }
  });
});

describe("generateTempPassword", () => {
  it("looks like giao-7342", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateTempPassword()).toMatch(/^[a-z]{3,6}-\d{4}$/);
    }
  });

  it("keeps leading zeros in the 4 digits", () => {
    const answers = [0, 7];
    const fake = () => answers.shift() ?? 0;
    expect(generateTempPassword(fake)).toBe(`${TEMP_PASSWORD_WORDS[0]}-0007`);
  });

  it("refuses an index outside the list", () => {
    expect(() => generateTempPassword(() => 256)).toThrow(RangeError);
  });

  it("varies between calls", () => {
    const seen = new Set(
      Array.from({ length: 20 }, () => generateTempPassword()),
    );
    expect(seen.size).toBeGreaterThan(15);
  });
});

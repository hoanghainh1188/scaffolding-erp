import { describe, expect, it } from "vitest";

import { formatSequenceCode } from "./catalog-code-sequence";

describe("formatSequenceCode", () => {
  it("pads to 4 digits and grows after 9999", () => {
    expect(formatSequenceCode("NT", 1)).toBe("NT-0001");
    expect(formatSequenceCode("NCC", 12)).toBe("NCC-0012");
    expect(formatSequenceCode("NT", 10000)).toBe("NT-10000");
  });
});

import { describe, expect, it } from "vitest";

import { toleranceLimit, withinTolerance } from "./tolerance";

describe("withinTolerance", () => {
  it("passes exactly 10 % over", () => {
    expect(withinTolerance(1_100_000, 1_000_000)).toBe(true);
  });

  it("refuses a hair more than 10 % over", () => {
    expect(withinTolerance(1_100_001, 1_000_000)).toBe(false);
  });

  it("passes 1.258 kg against 1.250,5 kg", () => {
    expect(withinTolerance(1_258_000, 1_250_500)).toBe(true);
  });

  it("refuses 1.400 kg against 1.250,5 kg", () => {
    expect(withinTolerance(1_400_000, 1_250_500)).toBe(false);
  });

  it("gives the largest passing amount", () => {
    expect(toleranceLimit(1_250_500)).toBe(1_375_550);
  });
});

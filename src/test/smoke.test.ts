import { describe, expect, it } from "vitest";

describe("unit project", () => {
  it("runs in a Node environment", () => {
    expect(typeof window).toBe("undefined");
  });
});

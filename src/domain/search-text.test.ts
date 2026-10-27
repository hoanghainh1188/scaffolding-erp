import { describe, expect, it } from "vitest";

import { toSearchText } from "./search-text";

describe("toSearchText", () => {
  it("drops accents, đ and case", () => {
    expect(toSearchText("Khung giàn giáo Đ")).toBe("khung gian giao d");
  });

  it("joins parts and skips empty ones", () => {
    expect(toSearchText("Cùm xoay", null, "PK-CX", undefined, "")).toBe(
      "cum xoay pk-cx",
    );
  });

  it("collapses spaces", () => {
    expect(toSearchText("  Tuýp   thép  ")).toBe("tuyp thep");
  });
});

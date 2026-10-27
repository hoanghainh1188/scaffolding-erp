import { describe, expect, it } from "vitest";

import { initials } from "./initials";

describe("initials", () => {
  it.each([
    ["Minh Anh", "MA"],
    ["Đức Thắng", "ĐT"],
    ["Nguyễn Thị Thu Hà", "TH"],
    ["Lan", "L"],
    ["  ", ""],
  ])("%s → %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

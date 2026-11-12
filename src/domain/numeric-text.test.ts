import { describe, expect, it } from "vitest";

import { keepNumericText } from "./numeric-text";

describe("keepNumericText", () => {
  it("keeps only digits for integer fields", () => {
    expect(keepNumericText("12a3", "integer")).toBe("123");
    expect(keepNumericText("abc", "integer")).toBe("");
    expect(keepNumericText("1.5", "integer")).toBe("15");
    expect(keepNumericText("-3", "integer")).toBe("3");
    expect(keepNumericText(" 45 ", "integer")).toBe("45");
  });

  it("keeps separators for counts so the parser can explain them", () => {
    expect(keepNumericText("1,5 cái", "count")).toBe("1,5");
    expect(keepNumericText("12b", "count")).toBe("12");
  });

  it("keeps decimal marks for decimal fields", () => {
    expect(keepNumericText("12,5kg", "decimal")).toBe("12,5");
    expect(keepNumericText("8.25 %", "decimal")).toBe("8.25");
    expect(keepNumericText("x", "decimal")).toBe("");
  });

  it("keeps thousands dots for money and drops the currency", () => {
    expect(keepNumericText("1.250.000 ₫", "money")).toBe("1.250.000");
    expect(keepNumericText("12đ", "money")).toBe("12");
    expect(keepNumericText("-50.000", "money")).toBe("50.000");
    expect(keepNumericText("7.500,5", "money")).toBe("7.500,5");
  });

  it("allows one leading minus for signed money", () => {
    expect(keepNumericText("-50.000", "signed-money")).toBe("-50.000");
    expect(keepNumericText("−50.000", "signed-money")).toBe("-50.000");
    expect(keepNumericText("5-0", "signed-money")).toBe("50");
    expect(keepNumericText("--5", "signed-money")).toBe("-5");
    expect(keepNumericText("a-5", "signed-money")).toBe("-5");
  });
});

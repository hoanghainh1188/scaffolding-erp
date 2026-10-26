import { describe, expect, it } from "vitest";

import { computeConditionSplit } from "./condition-split";
import { quantityFromNumber } from "./quantity";

const pcs = (value: number) => quantityFromNumber(value, "PIECE");
const kg = (value: number) => quantityFromNumber(value, "KG");

describe("computeConditionSplit", () => {
  it("balances a return with a lost part", () => {
    const result = computeConditionSplit(pcs(100), [
      pcs(80),
      pcs(15),
      pcs(3),
      pcs(2),
    ]);
    expect(result).toEqual({
      allocated: pcs(100),
      remaining: pcs(0),
      status: "balanced",
    });
  });

  it("reports parts still to classify", () => {
    const result = computeConditionSplit(pcs(100), [pcs(80), pcs(15), pcs(0)]);
    expect(result.status).toBe("under");
    expect(result.remaining).toEqual(pcs(5));
  });

  it("reports parts over the total", () => {
    const result = computeConditionSplit(pcs(100), [pcs(90), pcs(15), pcs(0)]);
    expect(result.status).toBe("over");
    expect(result.remaining).toEqual(pcs(-5));
  });

  it("is balanced when everything is zero", () => {
    expect(computeConditionSplit(pcs(0), [pcs(0), pcs(0), pcs(0)]).status).toBe(
      "balanced",
    );
  });

  it("balances kilograms with decimals", () => {
    const result = computeConditionSplit(kg(250.5), [kg(200), kg(50), kg(0.5)]);
    expect(result.status).toBe("balanced");
  });

  it("requires every part in the total's unit", () => {
    expect(() => computeConditionSplit(pcs(100), [pcs(99), kg(1)])).toThrow(
      "Không tính được hai số lượng khác đơn vị",
    );
  });
});

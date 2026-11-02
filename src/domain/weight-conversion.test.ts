import { describe, expect, it } from "vitest";

import { quantityFromNumber as q } from "./quantity";
import {
  WEIGHT_MESSAGES,
  kgToPieces,
  kgToUnits,
  unitsToKg,
  pieceWeight,
  piecesToKg,
} from "./weight-conversion";

const frame = q(13.5, "KG"); // GG-K17

describe("piecesToKg", () => {
  it("100 pieces of 13,5 kg weigh 1.350 kg", () => {
    expect(piecesToKg(q(100, "PIECE"), frame)).toEqual(q(1350, "KG"));
  });

  it("shows 162 kg for 12 scrap frames counted in pieces", () => {
    expect(piecesToKg(q(12, "PIECE"), frame)).toEqual(q(162, "KG"));
  });

  it("keeps 0,001 kg precision", () => {
    expect(piecesToKg(q(1, "PIECE"), q(0.001, "KG"))).toEqual(q(0.001, "KG"));
  });

  it("does not overflow for 99.999 pieces of 25 kg", () => {
    expect(piecesToKg(q(99_999, "PIECE"), q(25, "KG"))).toEqual(
      q(2_499_975, "KG"),
    );
  });

  it("gives 0 for 0 pieces", () => {
    expect(piecesToKg(q(0, "PIECE"), frame).milli).toBe(0);
  });
});

describe("kgToPieces", () => {
  it("rounds 1.357 kg to 101 pieces (100,52)", () => {
    expect(kgToPieces(q(1357, "KG"), frame)).toEqual(q(101, "PIECE"));
  });

  it("rounds exactly half up: 20,25 kg is 2 pieces", () => {
    expect(kgToPieces(q(20.25, "KG"), frame)).toEqual(q(2, "PIECE"));
  });

  it("rounds 20,24 kg down to 1 piece", () => {
    expect(kgToPieces(q(20.24, "KG"), frame)).toEqual(q(1, "PIECE"));
  });

  it("gives 0 for 0 kg", () => {
    expect(kgToPieces(q(0, "KG"), frame).milli).toBe(0);
  });
});

describe("errors", () => {
  it("refuses a zero weight", () => {
    expect(() => piecesToKg(q(1, "PIECE"), q(0, "KG"))).toThrow(
      WEIGHT_MESSAGES.noWeight,
    );
  });

  it("refuses swapped units", () => {
    expect(() => piecesToKg(q(1, "KG"), frame)).toThrow(
      WEIGHT_MESSAGES.wrongUnit,
    );
    expect(() => kgToPieces(q(1, "PIECE"), frame)).toThrow(
      WEIGHT_MESSAGES.wrongUnit,
    );
  });

  it("has no conversion for items counted in kg", () => {
    expect(() => pieceWeight("KG", null)).toThrow(
      "Vật tư tính theo kg, không quy đổi",
    );
    expect(() => pieceWeight("PIECE", null)).toThrow(WEIGHT_MESSAGES.noWeight);
    expect(pieceWeight("PIECE", frame)).toBe(frame);
  });
});

describe("other units (catalog-extensions D2)", () => {
  const pipe = q(3.56, "KG");

  it("turns 120,5 m into 428,98 kg and 100 kg into 28,090 m", () => {
    expect(unitsToKg(q(120.5, "METER"), pipe)).toEqual(q(428.98, "KG"));
    expect(kgToUnits(q(100, "KG"), pipe, "METER")).toEqual(q(28.09, "METER"));
  });

  it("rounds bundles to whole bundles", () => {
    expect(kgToUnits(q(60, "KG"), q(25, "KG"), "BUNDLE")).toEqual(
      q(2, "BUNDLE"),
    );
    expect(unitsToKg(q(3, "BUNDLE"), q(25, "KG"))).toEqual(q(75, "KG"));
  });

  it("gives 0 for 0", () => {
    expect(kgToUnits(q(0, "KG"), pipe, "METER").milli).toBe(0);
    expect(unitsToKg(q(0, "METER"), pipe).milli).toBe(0);
  });

  it("refuses items counted in kg", () => {
    expect(() => kgToUnits(q(1, "KG"), pipe, "KG")).toThrow(
      WEIGHT_MESSAGES.kgItem,
    );
    expect(WEIGHT_MESSAGES.kgItem).toBe("Vật tư tính theo kg, không quy đổi");
  });
});

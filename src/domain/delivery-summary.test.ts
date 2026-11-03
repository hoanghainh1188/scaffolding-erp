import { describe, expect, it } from "vitest";

import {
  amountsText,
  batchText,
  createdSummary,
  postedSummary,
  shortItemName,
  type NamedAmount,
} from "./delivery-summary";

const khung = (milli: number): NamedAmount => ({
  itemCode: "GG-K17",
  itemName: "Khung giàn giáo 1,7m",
  unit: "PIECE",
  milli,
});
const cheo = (milli: number): NamedAmount => ({
  itemCode: "GG-CH",
  itemName: "Chéo giàn giáo",
  unit: "PIECE",
  milli,
});
const mam = (milli: number): NamedAmount => ({
  itemCode: "GG-M16",
  itemName: "Mâm giàn giáo 1,6m",
  unit: "PIECE",
  milli,
});
const kit = { kitName: "Bộ giàn giáo 1,7m", quantity: 60 };

describe("delivery texts", () => {
  it("shortens an item name to its first word", () => {
    expect(shortItemName("Khung giàn giáo 1,7m")).toBe("khung");
  });

  it("falls back to the code when two short names clash", () => {
    expect(
      amountsText([
        khung(10_000),
        {
          itemCode: "GG-K15",
          itemName: "Khung giàn giáo 1,5m",
          unit: "PIECE",
          milli: 5_000,
        },
      ]),
    ).toBe("10 GG-K17, 5 GG-K15");
  });

  it("spells out units other than cái", () => {
    expect(
      amountsText([
        {
          itemCode: "TY-REN",
          itemName: "Ty ren",
          unit: "BUNDLE",
          milli: 9_000,
        },
      ]),
    ).toBe("9 bó ty");
  });

  it("shows a kit with its parts", () => {
    expect(batchText([kit], [khung(120_000), cheo(120_000), mam(60_000)])).toBe(
      "60 bộ giàn giáo 1,7m = 120 khung, 120 chéo, 60 mâm",
    );
  });

  it("writes the create row", () => {
    expect(
      createdSummary({
        batchNo: 3,
        kits: [kit],
        lineCount: 3,
        freight: 1_800_000,
        over: [],
      }),
    ).toBe("Đợt 3 · 60 bộ giàn giáo 1,7m = 3 mã · cước 1.800.000 ₫");
  });

  it("names what went over the contract", () => {
    expect(
      createdSummary({
        batchNo: 4,
        kits: [],
        lineCount: 1,
        freight: null,
        over: [{ itemCode: "CHEO1,7", unit: "PIECE", milli: 20_000 }],
      }),
    ).toBe("Đợt 4 · 1 mã · vượt hợp đồng 20 CHEO1,7");
  });

  it("writes the posting row with the shortage and the contract start", () => {
    expect(
      postedSummary({
        delivered: [khung(120_000), cheo(80_000), mam(60_000)],
        short: [cheo(40_000)],
        over: [],
        contractStarted: true,
      }),
    ).toBe(
      "Xuất 120 khung, 80 chéo, 60 mâm · thiếu 40 chéo · hợp đồng sang Đang thực hiện",
    );
  });
});

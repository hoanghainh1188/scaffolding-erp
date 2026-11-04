import { describe, expect, it } from "vitest";

import {
  buyBackSummary,
  exchangeSummary,
  postedTransferSummary,
  transferTotalText,
} from "./site-operations-summary";

const K = 1000;
const row = (itemCode: string, itemName: string, count: number) => ({
  itemCode,
  itemName,
  unit: "PIECE" as const,
  milli: count * K,
});

describe("postedTransferSummary", () => {
  it("says what was carried and what was left", () => {
    expect(
      postedTransferSummary("An Phú – Block B", "Dương Nội", [
        { ...row("H1,7", "Khung giàn giáo 1,7m", 50), plannedMilli: 50 * K },
        { ...row("CHEO1,7", "Chéo giàn giáo 1,7m", 36), plannedMilli: 40 * K },
      ]),
    ).toBe(
      "An Phú – Block B → Dương Nội · 50 khung, 36 chéo · chở ít hơn 4 cái",
    );
  });

  it("leaves out the short part when everything was carried", () => {
    expect(
      postedTransferSummary("A", "B", [
        { ...row("H1,7", "Khung giàn giáo 1,7m", 50), plannedMilli: 50 * K },
      ]),
    ).toBe("A → B · 50 khung");
  });
});

describe("buyBackSummary", () => {
  it("names the goods and the total", () => {
    expect(
      buyBackSummary(
        [row("TR16", "Ty ren D16 dài 0,5m", 20), row("BCH", "Bát chuồn", 50)],
        1_300_000,
      ),
    ).toBe("Mua lại 20 ty, 50 bát · 1.300.000 ₫");
  });
});

describe("exchangeSummary", () => {
  it("falls back to codes when both sides share a name", () => {
    expect(
      exchangeSummary(
        4,
        [row("CHEO1,2", "Chéo giàn giáo 1,2m", 100)],
        [row("CHEO1,7", "Chéo giàn giáo 1,7m", 100)],
      ),
    ).toBe("Đổi hàng · Đợt 4 · giao 100 CHEO1,2 · nhận về dự kiến 100 CHEO1,7");
  });
});

describe("transferTotalText", () => {
  it("adds pieces", () => {
    expect(
      transferTotalText([
        { unit: "PIECE", milli: 50 * K },
        { unit: "PIECE", milli: 36 * K },
      ]),
    ).toBe("86 cái");
  });
});

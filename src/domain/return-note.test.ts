import { describe, expect, it } from "vitest";

import { toMoney } from "./money";
import {
  allocateReturn,
  assertReturnLines,
  drawFromSite,
  firstScrapUnitCost,
  returnValueSummary,
  type ReturnLineInput,
  type ScrapPricing,
} from "./return-note";

const K = 1000;
const counts = (good: number, repair = 0, scrap = 0, lost = 0) => ({
  goodMilli: good * K,
  repairMilli: repair * K,
  scrapMilli: scrap * K,
  lostMilli: lost * K,
});
const line = (
  code: string,
  c: ReturnType<typeof counts>,
  unit: ReturnLineInput["unit"] = "PIECE",
): ReturnLineInput => ({ itemId: code, itemCode: code, unit, counts: c });
const site = (fresh: number, good: number) => ({
  NEW: fresh * K,
  GOOD: good * K,
});
const CONTRACT = "112026/ANPHAT-MINHPHAT";

describe("assertReturnLines", () => {
  const onSite = new Map([
    ["H1,7", site(30, 90)],
    ["CHEO1,7", site(0, 260)],
  ]);

  it("keeps a fully split line and drops empty ones", () => {
    const kept = assertReturnLines(
      CONTRACT,
      [line("H1,7", counts(82, 15, 3, 2)), line("CHEO1,7", counts(0))],
      onSite,
    );
    expect(kept.map((entry) => entry.itemCode)).toEqual(["H1,7"]);
  });

  it("refuses more than is on site", () => {
    expect(() =>
      assertReturnLines(
        CONTRACT,
        [line("H1,7", counts(115, 0, 0, 10))],
        onSite,
      ),
    ).toThrow(
      "H1,7: trả về và mất (125 cái) nhiều hơn số đang ở công trình (120 cái). Kiểm tra lại số đếm.",
    );
  });

  it("refuses an item that is not at this contract's site", () => {
    expect(() =>
      assertReturnLines(CONTRACT, [line("MAM1,6", counts(20))], onSite),
    ).toThrow(
      "MAM1,6 không có ở công trình của hợp đồng 112026/ANPHAT-MINHPHAT. Hàng của hợp đồng khác cần lập phiếu thu hồi riêng.",
    );
  });

  it("refuses fractions of counted units, negatives, duplicates", () => {
    expect(() =>
      assertReturnLines(
        CONTRACT,
        [line("H1,7", { ...counts(10), goodMilli: 10_500 })],
        onSite,
      ),
    ).toThrow("H1,7 tính theo cái, số lượng phải là số nguyên");
    expect(() =>
      assertReturnLines(
        CONTRACT,
        [line("H1,7", { ...counts(1), lostMilli: -1000 })],
        onSite,
      ),
    ).toThrow("H1,7: số lượng không được âm.");
    expect(() =>
      assertReturnLines(
        CONTRACT,
        [line("H1,7", counts(1)), line("H1,7", counts(2))],
        onSite,
      ),
    ).toThrow("H1,7 có hai dòng trên phiếu. Gộp lại thành một dòng.");
  });

  it("accepts kg fractions", () => {
    const kgSite = new Map([["SAT-VUN", site(0, 500)]]);
    const kept = assertReturnLines(
      CONTRACT,
      [line("SAT-VUN", { ...counts(0), goodMilli: 120_500 }, "KG")],
      kgSite,
    );
    expect(kept).toHaveLength(1);
  });

  it("refuses a note with nothing", () => {
    expect(() =>
      assertReturnLines(CONTRACT, [line("H1,7", counts(0))], onSite),
    ).toThrow(
      "Phiếu thu hồi chưa có hàng nào. Nhập số trả về hoặc số mất của ít nhất một mã.",
    );
  });
});

describe("drawFromSite", () => {
  it("draws Mới first for every outcome, in order", () => {
    expect(drawFromSite(counts(80, 15, 3, 2), site(30, 90))).toEqual([
      { source: "NEW", outcome: "GOOD", milli: 30 * K },
      { source: "GOOD", outcome: "GOOD", milli: 50 * K },
      { source: "GOOD", outcome: "NEEDS_REPAIR", milli: 15 * K },
      { source: "GOOD", outcome: "SCRAP", milli: 3 * K },
      { source: "GOOD", outcome: "LOST", milli: 2 * K },
    ]);
  });
});

describe("allocateReturn", () => {
  const scrap: ScrapPricing = {
    scrapAvg: toMoney(60_000),
    siteAvg: { NEW: toMoney(520_000), GOOD: toMoney(400_000) },
    standardWeightKg: "13.600",
    scrapPricePerKg: toMoney(7_500),
  };
  const input = {
    code: "PTH-2026-071",
    siteLocationId: "ct",
    yardLocationId: "bai",
    line: line("H1,7", counts(80, 15, 3, 2)),
    onSite: site(30, 90),
    scrap,
  };

  it("posts the D1 example", () => {
    const drafts = allocateReturn(input);
    expect(
      drafts.map((d) => [
        d.movement,
        d.condition,
        d.locationId,
        d.quantityMilli / K,
      ]),
    ).toEqual([
      ["RETURN_OUT", "NEW", "ct", -30],
      ["RETURN_OUT", "GOOD", "ct", -68],
      ["RETURN_IN", "GOOD", "bai", 80],
      ["RETURN_IN", "NEEDS_REPAIR", "bai", 15],
      ["RETURN_IN", "SCRAP", "bai", 3],
      ["LOSS_OUT", "GOOD", "ct", -2],
    ]);
    expect(drafts[2]?.pairedWith).toBe(0);
    expect(drafts[3]?.pairedWith).toBe(1);
    expect(drafts[4]?.unitCost).toBeUndefined();
    expect(drafts[5]?.description).toBe("PTH-2026-071: Mất ở công trình");
  });

  it("books only a loss when nothing came back", () => {
    const drafts = allocateReturn({
      ...input,
      line: line("H1,7", counts(0, 0, 0, 20)),
    });
    expect(
      drafts.map((d) => [d.movement, d.condition, d.quantityMilli / K]),
    ).toEqual([["LOSS_OUT", "NEW", -20]]);
  });

  it("prices first Phế liệu at the scrap rate, without a pair", () => {
    const drafts = allocateReturn({
      ...input,
      line: line("GG-K15", counts(0, 0, 3)),
      onSite: site(0, 50),
      scrap: {
        ...scrap,
        scrapAvg: null,
        siteAvg: { NEW: null, GOOD: toMoney(167_000) },
      },
    });
    const into = drafts.find((d) => d.movement === "RETURN_IN");
    expect(into?.unitCost).toBe(102_000);
    expect(into?.pairedWith).toBeUndefined();
  });

  it("refuses first Phế liệu without a scrap price", () => {
    expect(() =>
      allocateReturn({
        ...input,
        scrap: { ...scrap, scrapAvg: null, scrapPricePerKg: null },
      }),
    ).toThrow(
      "Chưa có đơn giá sắt vụn tham chiếu. Vui lòng cập nhật đơn giá trong Cài đặt.",
    );
  });
});

describe("firstScrapUnitCost", () => {
  const pricing: ScrapPricing = {
    scrapAvg: null,
    siteAvg: { NEW: null, GOOD: toMoney(167_000) },
    standardWeightKg: "13.600",
    scrapPricePerKg: toMoney(7_500),
  };

  it("takes the lower of scrap rate and the cost it leaves as", () => {
    expect(firstScrapUnitCost("GG-K15", "PIECE", pricing, "GOOD")).toBe(
      102_000,
    );
    expect(
      firstScrapUnitCost(
        "TY-REN",
        "PIECE",
        {
          ...pricing,
          standardWeightKg: "2.000",
          siteAvg: { NEW: null, GOOD: toMoney(12_000) },
        },
        "GOOD",
      ),
    ).toBe(12_000);
  });

  it("refuses an item without a standard weight", () => {
    expect(() =>
      firstScrapUnitCost(
        "GG-K15",
        "PIECE",
        { ...pricing, standardWeightKg: null },
        "GOOD",
      ),
    ).toThrow(
      "GG-K15 chưa được khai báo trọng lượng chuẩn, không thể tính giá vốn phế liệu",
    );
  });

  it("treats a kg item as 1 kg per unit", () => {
    expect(firstScrapUnitCost("SAT", "KG", pricing, "GOOD")).toBe(7_500);
  });
});

describe("returnValueSummary", () => {
  it("adds up the D1 example", () => {
    expect(
      returnValueSummary([
        { movement: "RETURN_OUT", amount: -15_600_000 },
        { movement: "RETURN_OUT", amount: -27_200_000 },
        { movement: "RETURN_IN", amount: 32_000_000 },
        { movement: "RETURN_IN", amount: 3_750_000 },
        { movement: "RETURN_IN", amount: 180_000 },
        { movement: "LOSS_OUT", amount: -800_000 },
      ]),
    ).toEqual({ conditionLoss: 6_870_000, lostValue: 800_000 });
  });

  it("is zero when goods came back as they left", () => {
    expect(
      returnValueSummary([
        { movement: "RETURN_OUT", amount: -4_500_000 },
        { movement: "RETURN_IN", amount: 4_500_000 },
      ]),
    ).toEqual({ conditionLoss: 0, lostValue: 0 });
  });
});

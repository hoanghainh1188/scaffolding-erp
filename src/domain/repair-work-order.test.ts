// Repair work orders (repair-work-orders tasks 2.1–2.4; spec
// repair-work-orders; 0.2 số 117–số 130).
import { describe, expect, it } from "vitest";

import { toMoney } from "./money";
import { REPAIR_MESSAGES, costRepairLine } from "./repair-order";
import {
  WORK_ORDER_MESSAGES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_STEPS,
  WorkOrderStateError,
  checkReason,
  checkReport,
  issueAmount,
  laborAmount,
  splitMaterialIssue,
  transferLines,
  transition,
  workOrderPostingLines,
  type ReportLine,
  type WorkOrderStatus,
  type WorkOrderStep,
} from "./repair-work-order";

const K = 1000;

describe("transition (spec: trạng thái lệnh)", () => {
  const allowed: [WorkOrderStatus, WorkOrderStep, WorkOrderStatus][] = [
    ["DRAFT", "assign", "ASSIGNED"],
    ["ASSIGNED", "recall", "DRAFT"],
    ["ASSIGNED", "receive", "IN_PROGRESS"],
    ["IN_PROGRESS", "report", "AWAITING_CHECK"],
    ["AWAITING_CHECK", "count", "COUNTED"],
    ["AWAITING_CHECK", "return", "IN_PROGRESS"],
    ["COUNTED", "return", "IN_PROGRESS"],
    ["COUNTED", "post", "POSTED"],
    ["DRAFT", "cancel", "CANCELLED"],
    ["ASSIGNED", "cancel", "CANCELLED"],
    ["IN_PROGRESS", "cancel", "CANCELLED"],
    ["AWAITING_CHECK", "cancel", "CANCELLED"],
    ["COUNTED", "cancel", "CANCELLED"],
  ];

  it.each(allowed)("%s --%s--> %s", (from, step, to) => {
    expect(transition(from, step)).toBe(to);
  });

  it("refuses every other pair", () => {
    const ok = new Set(allowed.map(([from, step]) => `${from}|${step}`));
    for (const status of WORK_ORDER_STATUSES) {
      for (const step of WORK_ORDER_STEPS) {
        if (ok.has(`${status}|${step}`)) continue;
        expect(() => transition(status, step)).toThrow(WorkOrderStateError);
      }
    }
  });

  it("says why in the words of the spec", () => {
    const message = (status: WorkOrderStatus, step: WorkOrderStep) => {
      try {
        transition(status, step);
      } catch (error) {
        return (error as WorkOrderStateError).message;
      }
      return "";
    };
    expect(message("IN_PROGRESS", "recall")).toBe(WORK_ORDER_MESSAGES.received);
    expect(message("AWAITING_CHECK", "post")).toBe(
      "Lệnh đang Chờ nghiệm thu, Thủ kho chưa đếm xong",
    );
    expect(message("DRAFT", "receive")).toBe("Lệnh chưa giao xưởng");
    expect(message("IN_PROGRESS", "count")).toBe("Xưởng chưa báo sửa xong");
    expect(message("POSTED", "cancel")).toBe("Lệnh đã được ghi sổ");
    expect(message("CANCELLED", "assign")).toBe("Lệnh đã hủy");
  });
});

describe("laborAmount (spec: công khoán theo cái)", () => {
  it("is repaired pieces × rate", () => {
    expect(laborAmount(36 * K, toMoney(40_000))).toBe(1_440_000);
  });

  it("is 0 when nothing is repaired", () => {
    expect(laborAmount(0, toMoney(50_000))).toBe(0);
  });
});

const line = (overrides: Partial<ReportLine> = {}): ReportLine => ({
  itemId: "k17",
  itemCode: "GG-K17",
  unit: "PIECE",
  takenMilli: 40 * K,
  goodMilli: 36 * K,
  scrapMilli: 4 * K,
  materials: [],
  ...overrides,
});
const son = (quantityMilli: number) =>
  ({
    itemId: "son",
    itemCode: "VT-SON",
    unit: "LITER",
    category: "MATERIAL",
    quantityMilli,
  }) as const;

describe("checkReport (spec: số sửa xong, phế liệu và vật tư)", () => {
  it("accepts a full line", () => {
    expect(() => checkReport([line()])).not.toThrow();
  });

  it("refuses repaired + scrap different from taken", () => {
    expect(() => checkReport([line({ goodMilli: 30 * K })])).toThrow(
      REPAIR_MESSAGES.sumMismatch("GG-K17", 34 * K, 40 * K),
    );
  });

  it("refuses an equipment item as a supply", () => {
    expect(() =>
      checkReport([
        line({
          materials: [
            {
              itemId: "ch",
              itemCode: "GG-CH",
              unit: "PIECE",
              category: "EQUIPMENT",
              quantityMilli: K,
            },
          ],
        }),
      ]),
    ).toThrow("GG-CH không phải vật tư phụ");
  });

  it("lets one supply serve two lines but not twice on one", () => {
    expect(() =>
      checkReport([
        line({ materials: [son(3 * K)] }),
        line({
          itemId: "cheo",
          itemCode: "CHEO-1,7",
          takenMilli: 20 * K,
          goodMilli: 20 * K,
          scrapMilli: 0,
          materials: [son(500)],
        }),
      ]),
    ).not.toThrow();
    expect(() =>
      checkReport([line({ materials: [son(3 * K), son(K)] })]),
    ).toThrow(WORK_ORDER_MESSAGES.materialDuplicate("GG-K17", "VT-SON"));
  });

  it("refuses supplies on a line with nothing repaired", () => {
    expect(() =>
      checkReport([
        line({
          itemCode: "GG-M16",
          takenMilli: 5 * K,
          goodMilli: 0,
          scrapMilli: 5 * K,
          materials: [son(K)],
        }),
      ]),
    ).toThrow(REPAIR_MESSAGES.costWithoutGood("GG-M16"));
  });

  it("refuses a zero supply and a fraction of a counted supply", () => {
    expect(() => checkReport([line({ materials: [son(0)] })])).toThrow(
      WORK_ORDER_MESSAGES.materialQuantity("VT-SON"),
    );
    expect(() =>
      checkReport([
        line({
          materials: [
            {
              itemId: "bl",
              itemCode: "VT-BL12",
              unit: "PIECE",
              category: "MATERIAL",
              quantityMilli: 1500,
            },
          ],
        }),
      ]),
    ).toThrow(REPAIR_MESSAGES.wholePieces("VT-BL12", "cái"));
  });
});

describe("checkReason", () => {
  it("needs a reason of at most 500 characters", () => {
    expect(() => checkReason("  ", "return")).toThrow("Ghi lý do trả lại");
    expect(() => checkReason(null, "cancel")).toThrow("Ghi lý do hủy lệnh");
    expect(() => checkReason("x".repeat(501), "cancel")).toThrow();
    expect(checkReason(" Bán nguyên lô phế ", "cancel")).toBe(
      "Bán nguyên lô phế",
    );
  });
});

describe("splitMaterialIssue (0.2 số 127)", () => {
  const context = {
    itemCode: "VT-BL12",
    unit: "PIECE",
    locationCode: "XUONG-01",
  } as const;

  it("takes New first, then Good", () => {
    expect(
      splitMaterialIssue(
        30 * K,
        { newMilli: 20 * K, goodMilli: 100 * K },
        context,
      ),
    ).toEqual({ newMilli: 20 * K, goodMilli: 10 * K });
  });

  it("names what is left when short", () => {
    expect(() =>
      splitMaterialIssue(
        6 * K,
        { newMilli: 4 * K, goodMilli: 0 },
        { itemCode: "VT-QH", unit: "KG", locationCode: "XUONG-01" },
      ),
    ).toThrow("Không đủ vật tư: VT-QH tại XUONG-01 còn 4 kg");
  });
});

describe("posting the D12 example (spec: ghi sổ lệnh sửa)", () => {
  const qh = issueAmount(6 * K, toMoney(45_000));
  const sonK17 = issueAmount(3 * K, toMoney(90_000));
  const sonCheo = issueAmount(500, toMoney(90_000));
  const k17 = costRepairLine(
    {
      itemCode: "GG-K17",
      goodMilli: 36 * K,
      scrapMilli: 4 * K,
      repairCost: laborAmount(36 * K, toMoney(40_000)) + qh + sonK17,
    },
    {
      needsRepairAvg: toMoney(160_000),
      standardWeightKg: "13.500",
      scrapPricePerKg: toMoney(7_500),
    },
  );
  const cheo = costRepairLine(
    {
      itemCode: "CHEO-1,7",
      goodMilli: 20 * K,
      scrapMilli: 0,
      repairCost: laborAmount(20 * K, toMoney(10_000)) + sonCheo,
    },
    {
      needsRepairAvg: toMoney(30_000),
      standardWeightKg: "2.000",
      scrapPricePerKg: toMoney(7_500),
    },
  );

  it("costs 1.980.000 ₫ and enters Good at 221.528 ₫ for GG-K17", () => {
    expect(qh + sonK17).toBe(540_000);
    expect(k17.scrapValue).toBe(405_000);
    expect(k17.damage).toBe(235_000);
    expect(k17.goodAmount).toBe(7_975_000);
    expect(k17.goodUnitCost).toBe(221_528);
  });

  it("enters Good at 42.250 ₫ for CHEO-1,7", () => {
    expect(sonCheo).toBe(45_000);
    expect(cheo.goodAmount).toBe(845_000);
    expect(cheo.goodUnitCost).toBe(42_250);
  });

  const drafts = workOrderPostingLines(
    "PSC-2026-031",
    [
      {
        itemId: "k17",
        itemCode: "GG-K17",
        takenMilli: 40 * K,
        goodMilli: 36 * K,
        scrapMilli: 4 * K,
        cost: k17,
        materials: [
          { itemId: "qh", itemCode: "VT-QH", newMilli: 6 * K, goodMilli: 0 },
          { itemId: "son", itemCode: "VT-SON", newMilli: 3 * K, goodMilli: 0 },
        ],
      },
      {
        itemId: "cheo",
        itemCode: "CHEO-1,7",
        takenMilli: 20 * K,
        goodMilli: 20 * K,
        scrapMilli: 0,
        cost: cheo,
        materials: [
          { itemId: "son", itemCode: "VT-SON", newMilli: 500, goodMilli: 0 },
        ],
      },
    ],
    { workshopId: "xuong", returnToId: "bai" },
  );

  it("takes Chờ sửa and supplies at the workshop, puts Good and Scrap back at the yard", () => {
    expect(
      drafts.map((d) => [
        d.itemId,
        d.condition,
        d.locationId,
        d.movement,
        d.quantityMilli,
      ]),
    ).toEqual([
      ["k17", "NEEDS_REPAIR", "xuong", "REPAIR_OUT", -40 * K],
      ["k17", "GOOD", "bai", "REPAIR_IN", 36 * K],
      ["k17", "SCRAP", "bai", "REPAIR_IN", 4 * K],
      ["qh", "NEW", "xuong", "REPAIR_OUT", -6 * K],
      ["son", "NEW", "xuong", "REPAIR_OUT", -3 * K],
      ["cheo", "NEEDS_REPAIR", "xuong", "REPAIR_OUT", -20 * K],
      ["cheo", "GOOD", "bai", "REPAIR_IN", 20 * K],
      ["son", "NEW", "xuong", "REPAIR_OUT", -500],
    ]);
  });

  it("adds up to the labour: +1.640.000 ₫ (design D3)", () => {
    const total =
      -lineAt(40 * K, 160_000) +
      k17.goodAmount +
      k17.scrapValue -
      lineAt(20 * K, 30_000) +
      cheo.goodAmount -
      (qh + sonK17 + sonCheo);
    expect(total).toBe(1_640_000);
  });
});

function lineAt(milli: number, avg: number): number {
  return (milli / K) * avg;
}

describe("transferLines (design D2)", () => {
  const lines = [{ itemId: "k17", itemCode: "GG-K17", takenMilli: 40 * K }];

  it("moves Chờ sửa from the yard to the workshop", () => {
    expect(
      transferLines(
        "PSC-2026-031",
        lines,
        { fromId: "bai", toId: "xuong" },
        "receive",
      ).map((d) => [d.locationId, d.movement, d.quantityMilli, d.condition]),
    ).toEqual([
      ["bai", "TRANSFER_OUT", -40 * K, "NEEDS_REPAIR"],
      ["xuong", "TRANSFER_IN", 40 * K, "NEEDS_REPAIR"],
    ]);
  });

  it("writes nothing when the order takes stock at the workshop itself", () => {
    expect(
      transferLines(
        "PSC-2026-031",
        lines,
        { fromId: "xuong", toId: "xuong" },
        "receive",
      ),
    ).toEqual([]);
  });
});

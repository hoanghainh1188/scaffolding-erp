// Production orders (production-orders tasks 2.3–2.7; spec production-orders).
import { describe, expect, it } from "vitest";

import { toMoney, type Money } from "./money";
import type { MovementDraft } from "./movement";
import {
  OVERUSE_LIMIT_PERCENT,
  PRODUCTION_MESSAGES,
  PRODUCTION_STATUSES,
  PRODUCTION_STEPS,
  ProductionStateError,
  checkFloorReport,
  checkPlanned,
  checkPosting,
  checkStepNote,
  hasOveruse,
  normMilli,
  overuse,
  overuseText,
  overuseValue,
  previewProductionCost,
  productionPostingLines,
  transition,
  type FloorLine,
  type FloorOrderLine,
  type PostingContext,
  type PostingLine,
  type PostingMaterial,
  type PostingStock,
  type ProductionStatus,
  type ProductionStep,
} from "./production-order";

const K = 1000;

describe("transition", () => {
  const allowed: [ProductionStatus, ProductionStep, ProductionStatus][] = [
    ["DRAFT", "assign", "ASSIGNED"],
    ["ASSIGNED", "recall", "DRAFT"],
    ["ASSIGNED", "receive", "IN_PROGRESS"],
    ["IN_PROGRESS", "report", "AWAITING_CHECK"],
    ["AWAITING_CHECK", "count", "COUNTED"],
    ["AWAITING_APPROVAL", "approve", "COUNTED"],
    ["AWAITING_CHECK", "return", "IN_PROGRESS"],
    ["AWAITING_APPROVAL", "return", "IN_PROGRESS"],
    ["COUNTED", "return", "IN_PROGRESS"],
    ["COUNTED", "post", "POSTED"],
    ["DRAFT", "cancel", "CANCELLED"],
    ["ASSIGNED", "cancel", "CANCELLED"],
    ["IN_PROGRESS", "cancel", "CANCELLED"],
    ["AWAITING_CHECK", "cancel", "CANCELLED"],
    ["AWAITING_APPROVAL", "cancel", "CANCELLED"],
    ["COUNTED", "cancel", "CANCELLED"],
  ];

  it.each(allowed)("%s --%s--> %s", (from, step, to) => {
    expect(transition(from, step)).toBe(to);
  });

  it("sends a count with overuse to the director", () => {
    expect(transition("AWAITING_CHECK", "count", { overuse: true })).toBe(
      "AWAITING_APPROVAL",
    );
  });

  it("refuses every other pair", () => {
    const ok = new Set(allowed.map(([from, step]) => `${from}|${step}`));
    for (const status of PRODUCTION_STATUSES) {
      for (const step of PRODUCTION_STEPS) {
        if (ok.has(`${status}|${step}`)) continue;
        expect(() => transition(status, step)).toThrow(ProductionStateError);
      }
    }
  });

  it("words the refusals of the spec", () => {
    expect(() => transition("IN_PROGRESS", "receive")).toThrow(
      "Lệnh không còn ở trạng thái Đã giao",
    );
    expect(() => transition("AWAITING_CHECK", "post")).toThrow(
      "Lệnh chưa ở trạng thái Chờ ghi sổ",
    );
    expect(() => transition("AWAITING_APPROVAL", "post")).toThrow(
      "Lệnh chưa ở trạng thái Chờ ghi sổ",
    );
    expect(() => transition("POSTED", "cancel")).toThrow("Lệnh đã được ghi sổ");
  });
});

describe("checkPlanned, checkStepNote", () => {
  it("wants whole pieces above 0", () => {
    expect(() => checkPlanned(100 * K, "f")).not.toThrow();
    expect(() => checkPlanned(10_500, "f")).toThrow(
      "Số kế hoạch phải là số nguyên lớn hơn 0",
    );
    expect(() => checkPlanned(0, "f")).toThrow(PRODUCTION_MESSAGES.planned);
  });

  it("wants a note on return, approve and cancel", () => {
    expect(() => checkStepNote("  ", "cancel")).toThrow("Nhập lý do hủy");
    expect(() => checkStepNote(null, "approve")).toThrow("Nhập ghi chú duyệt");
    expect(() => checkStepNote("", "return")).toThrow("Nhập ghi chú trả lại");
    expect(checkStepNote(" Đếm lại ", "return")).toBe("Đếm lại");
    expect(() => checkStepNote("x".repeat(501), "return")).toThrow(
      PRODUCTION_MESSAGES.noteTooLong,
    );
  });
});

describe("norm and overuse (design D5)", () => {
  it("has the limit in one place", () => {
    expect(OVERUSE_LIMIT_PERCENT).toBe(5);
  });

  it("multiplies measure units exactly", () => {
    expect(normMilli(3600, 100 * K, "KG")).toBe(360 * K);
    expect(normMilli(30, 200 * K, "LITER")).toBe(6 * K);
  });

  it("rounds count units up to whole pieces", () => {
    expect(normMilli(500, 3 * K, "BAR")).toBe(2 * K);
    expect(normMilli(4000, 100 * K, "PIECE")).toBe(400 * K);
    expect(normMilli(500, 4 * K, "BAR")).toBe(2 * K);
  });

  it("says 391 / 360 is + 8,6 % and over", () => {
    const result = overuse(391 * K, 360 * K);
    expect(result).toEqual({ percentTenths: 86, over: true });
    expect(overuseText(result.percentTenths)).toBe("+ 8,6 %");
  });

  it("says 609 / 580 is + 5,0 % and not over", () => {
    const result = overuse(609 * K, 580 * K);
    expect(result).toEqual({ percentTenths: 50, over: false });
    expect(overuseText(result.percentTenths)).toBe("+ 5,0 %");
  });

  it("calls any use outside the norm over", () => {
    expect(overuse(500, 0)).toEqual({ percentTenths: null, over: true });
    expect(overuse(0, 0)).toEqual({ percentTenths: null, over: false });
    expect(overuseText(null)).toBe("—");
    expect(overuseText(0)).toBe("0 %");
  });

  it("says 7,5 / 8 is − 6,3 % and not over", () => {
    const result = overuse(7500, 8 * K);
    expect(result).toEqual({ percentTenths: -63, over: false });
    expect(overuseText(result.percentTenths)).toBe("− 6,3 %");
  });

  it("does not call the pre-filled 2 bars over", () => {
    expect(overuse(2 * K, normMilli(500, 3 * K, "BAR")).over).toBe(false);
  });

  it("adds the D20 overuse value to 1.349.500 ₫", () => {
    const money = (value: number) => toMoney(value);
    expect(
      overuseValue([
        { actualMilli: 1012 * K, normMilli: 980 * K, avgCost: money(19_500) },
        { actualMilli: 391 * K, normMilli: 360 * K, avgCost: money(19_000) },
        { actualMilli: 12_500, normMilli: 12 * K, avgCost: money(45_000) },
        { actualMilli: 586 * K, normMilli: 580 * K, avgCost: money(19_000) },
        { actualMilli: 7_500, normMilli: 8 * K, avgCost: money(90_000) },
      ]),
    ).toBe(1_349_500);
  });
});

const money = (value: number): Money => toMoney(value);

const material = (
  itemId: string,
  quantity: number,
  over: Partial<PostingMaterial> = {},
): PostingMaterial => ({
  rowId: `row-${itemId}`,
  itemId,
  itemCode: itemId,
  unit: "KG",
  standardWeightKg: null,
  quantityMilli: Math.round(quantity * K),
  normPerUnitMilli: null,
  ...over,
});

const frame: PostingLine = {
  lineId: "line-k17",
  itemId: "GG-K17",
  itemCode: "GG-K17",
  unit: "PIECE",
  finishedMilli: 100 * K,
  offcutMilli: 38 * K,
  laborRate: money(35_000),
  materials: [
    material("VT-ONG42", 1012, { normPerUnitMilli: 9800 }),
    material("VT-ONG27", 391, { normPerUnitMilli: 3600 }),
    material("VT-QH", 12.5, { normPerUnitMilli: 120 }),
    material("VT-SON", 8, {
      unit: "LITER",
      standardWeightKg: "1.300",
      normPerUnitMilli: 80,
    }),
    material("VT-CHOT", 400, {
      unit: "PIECE",
      standardWeightKg: "0.150",
      normPerUnitMilli: 4000,
    }),
  ],
};

const brace: PostingLine = {
  lineId: "line-ch",
  itemId: "GG-CH",
  itemCode: "GG-CH",
  unit: "PIECE",
  finishedMilli: 200 * K,
  offcutMilli: 9 * K,
  laborRate: money(8_000),
  materials: [
    material("VT-ONG27", 586, { normPerUnitMilli: 2900 }),
    material("VT-SON", 6, {
      unit: "LITER",
      standardWeightKg: "1.300",
      normPerUnitMilli: 30,
    }),
  ],
};

const stockOf = (
  newKg: number,
  avg: number,
  over: Partial<PostingStock> = {},
): PostingStock => ({
  newMilli: Math.round(newKg * K),
  goodMilli: 0,
  newAvg: money(avg),
  goodAvg: null,
  ...over,
});

const context = (over: Partial<PostingContext> = {}): PostingContext => ({
  orderCode: "LSX-2026-004",
  workshopId: "XUONG",
  workshopCode: "XUONG-01",
  toLocationId: "BAI",
  scrapItemId: "PL-SATVUN",
  scrapPricePerKg: money(7_500),
  stock: new Map([
    ["VT-ONG42", stockOf(2000, 19_500)],
    ["VT-ONG27", stockOf(2000, 19_000)],
    ["VT-QH", stockOf(50, 45_000)],
    ["VT-SON", stockOf(50, 90_000)],
    ["VT-CHOT", stockOf(1000, 2_500)],
  ]),
  ...over,
});

/** The value each draft will carry once postMovements prices it. */
function draftValue(draft: MovementDraft, ctx: PostingContext): number {
  if (draft.amount !== undefined) return draft.amount;
  const stock = ctx.stock.get(draft.itemId);
  const avg = draft.condition === "NEW" ? stock?.newAvg : stock?.goodAvg;
  return Math.round((draft.quantityMilli * Number(avg ?? 0)) / K);
}

describe("productionPostingLines (spec: ghi sổ lệnh sản xuất)", () => {
  it("gives the figures of the D20 example", () => {
    const posting = productionPostingLines([frame, brace], context());
    const [first, second] = posting.lines;
    expect(first?.materialAmount).toBe(29_445_500);
    expect(first?.laborAmount).toBe(3_500_000);
    expect(first?.offcutAmount).toBe(285_000);
    expect(first?.finishedAmount).toBe(32_660_500);
    expect(second?.materialAmount).toBe(11_674_000);
    expect(second?.laborAmount).toBe(1_600_000);
    expect(second?.offcutAmount).toBe(67_500);
    expect(second?.finishedAmount).toBe(13_206_500);
    expect(posting.totals).toEqual({
      finishedMilli: 300 * K,
      offcutMilli: 47 * K,
      material: 41_119_500,
      labor: 5_100_000,
      offcut: 352_500,
      finished: 45_867_000,
    });
  });

  it("adds every ledger line up to + labour", () => {
    const ctx = context();
    const posting = productionPostingLines([frame, brace], ctx);
    expect(
      posting.drafts.reduce((sum, draft) => sum + draftValue(draft, ctx), 0),
    ).toBe(5_100_000);
  });

  it("writes every material out before anything comes in", () => {
    const ctx = context();
    const posting = productionPostingLines([frame, brace], ctx);
    const movements = posting.drafts.map((draft) => draft.movement);
    const firstIn = movements.indexOf("PRODUCTION_IN");
    expect(firstIn).toBeGreaterThan(0);
    expect(movements.lastIndexOf("PRODUCTION_OUT")).toBeLessThan(firstIn);
    expect(
      posting.drafts.reduce((sum, draft) => sum + draftValue(draft, ctx), 0),
    ).toBe(5_100_000);
  });

  it("refuses an item that is both finished and a material of the order", () => {
    const second: PostingLine = {
      ...brace,
      materials: [...brace.materials, material("GG-K17", 1, { unit: "PIECE" })],
    };
    expect(() => productionPostingLines([frame, second], context())).toThrow(
      PRODUCTION_MESSAGES.finishedIsMaterial("GG-K17"),
    );
  });

  it("issues New first, then Good", () => {
    const ctx = context({
      stock: new Map([
        [
          "VT-ONG27",
          stockOf(300, 19_000, { goodMilli: 500 * K, goodAvg: money(16_000) }),
        ],
      ]),
    });
    const line: PostingLine = {
      ...frame,
      offcutMilli: 0,
      materials: [material("VT-ONG27", 391)],
    };
    const posting = productionPostingLines([line], ctx);
    expect(posting.lines[0]?.materials[0]).toMatchObject({
      newMilli: 300 * K,
      goodMilli: 91 * K,
      amount: 7_156_000,
    });
    expect(
      posting.drafts
        .filter((draft) => draft.movement === "PRODUCTION_OUT")
        .map((draft) => [draft.condition, draft.quantityMilli]),
    ).toEqual([
      ["NEW", -300 * K],
      ["GOOD", -91 * K],
    ]);
  });

  it("shares a material between two lines, the earlier line first", () => {
    const ctx = context({
      stock: new Map([
        [
          "VT-ONG27",
          stockOf(500, 19_000, { goodMilli: 500 * K, goodAvg: money(16_000) }),
        ],
      ]),
    });
    const first = {
      ...frame,
      offcutMilli: 0,
      materials: [material("VT-ONG27", 391)],
    };
    const second = {
      ...brace,
      offcutMilli: 0,
      materials: [material("VT-ONG27", 586)],
    };
    const posting = productionPostingLines([first, second], ctx);
    expect(posting.lines[0]?.materials[0]).toMatchObject({
      newMilli: 391 * K,
      goodMilli: 0,
    });
    expect(posting.lines[1]?.materials[0]).toMatchObject({
      newMilli: 109 * K,
      goodMilli: 477 * K,
    });
  });

  it("writes no Scrap line without offcuts", () => {
    const line = { ...frame, offcutMilli: 0 };
    const posting = productionPostingLines([line], context());
    expect(posting.drafts.some((draft) => draft.condition === "SCRAP")).toBe(
      false,
    );
  });

  it("skips materials brought back to 0", () => {
    const line: PostingLine = {
      ...frame,
      offcutMilli: 0,
      materials: [material("VT-ONG42", 10), material("VT-QH", 0)],
    };
    const posting = productionPostingLines([line], context());
    expect(posting.lines[0]?.materials).toHaveLength(1);
  });

  it("describes each ledger line", () => {
    const { drafts } = productionPostingLines([frame], context());
    expect(drafts[0]?.description).toBe("LSX-2026-004: nguyên liệu làm GG-K17");
    const incoming = drafts.filter((d) => d.movement === "PRODUCTION_IN");
    expect(incoming.map((d) => [d.itemId, d.condition, d.description])).toEqual(
      [
        ["GG-K17", "NEW", "LSX-2026-004: nhập sản xuất GG-K17"],
        ["PL-SATVUN", "SCRAP", "LSX-2026-004: đầu thừa làm GG-K17"],
      ],
    );
    expect(incoming.every((d) => d.locationId === "BAI")).toBe(true);
    expect(drafts[0]?.locationId).toBe("XUONG");
  });

  it("refuses a value of 0 or less", () => {
    const line: PostingLine = {
      ...frame,
      laborRate: money(0),
      offcutMilli: 1000 * K,
      materials: [material("VT-CHOT", 1, { unit: "PIECE" })],
    };
    expect(() => productionPostingLines([line], context())).toThrow(
      PRODUCTION_MESSAGES.valueNotPositive("GG-K17"),
    );
  });

  it("refuses a line whose labour was never taken", () => {
    expect(() =>
      productionPostingLines([{ ...frame, laborRate: null }], context()),
    ).toThrow(PRODUCTION_MESSAGES.noLabor("GG-K17"));
  });
});

describe("checkPosting (spec: điều kiện ghi sổ)", () => {
  it("passes the approved D20 order", () => {
    expect(() => checkPosting([frame, brace], context(), true)).not.toThrow();
  });

  it("names the whole need of a short material", () => {
    const stock = new Map(context().stock);
    stock.set("VT-ONG27", stockOf(900, 19_000));
    expect(() =>
      checkPosting([frame, brace], context({ stock }), true),
    ).toThrow("VT-ONG27 ở XUONG-01 còn 900 kg, lệnh cần 977 kg");
  });

  it("counts New and Good together for the need", () => {
    const stock = new Map(context().stock);
    stock.set(
      "VT-ONG27",
      stockOf(500, 19_000, { goodMilli: 477 * K, goodAvg: money(16_000) }),
    );
    expect(() =>
      checkPosting([frame, brace], context({ stock }), true),
    ).not.toThrow();
  });

  it("refuses a line with nothing finished", () => {
    expect(() =>
      checkPosting([{ ...brace, finishedMilli: 0 }], context(), true),
    ).toThrow(
      "GG-CH làm xong 0 cái: bỏ nguyên liệu của dòng, nguyên liệu hỏng thì lập phiếu điều chỉnh",
    );
  });

  it("refuses offcuts heavier than the materials", () => {
    expect(() =>
      checkPosting([{ ...brace, offcutMilli: 600 * K }], context(), true),
    ).toThrow("Đầu thừa của GG-CH (600 kg) nặng hơn nguyên liệu (593,8 kg)");
  });

  it("wants a scrap price, then a scrap item, only with offcuts", () => {
    expect(() =>
      checkPosting([frame], context({ scrapPricePerKg: null }), true),
    ).toThrow("Chưa có giá sắt vụn, Giám đốc đặt giá trước khi ghi sổ");
    expect(() =>
      checkPosting([frame], context({ scrapItemId: null }), true),
    ).toThrow("Chưa chọn Mã sắt vụn, Giám đốc chọn ở trang Giá sắt vụn");
    expect(() =>
      checkPosting(
        [{ ...frame, offcutMilli: 0 }],
        context({ scrapItemId: null, scrapPricePerKg: null }),
        true,
      ),
    ).not.toThrow();
  });

  it("refuses overuse that was not approved", () => {
    expect(hasOveruse([frame])).toBe(true);
    expect(() => checkPosting([frame], context(), false)).toThrow(
      PRODUCTION_MESSAGES.needsApproval,
    );
  });

  it("passes without approval when nothing is over", () => {
    const line: PostingLine = {
      ...frame,
      offcutMilli: 0,
      materials: [material("VT-ONG42", 980, { normPerUnitMilli: 9800 })],
    };
    expect(hasOveruse([line])).toBe(false);
    expect(() => checkPosting([line], context(), false)).not.toThrow();
  });

  it("calls a material added by the workshop overuse", () => {
    const line: PostingLine = {
      ...frame,
      materials: [material("VT-QH", 0.5)],
    };
    expect(hasOveruse([line])).toBe(true);
  });
});

describe("checkFloorReport (spec: API điện thoại)", () => {
  const order: FloorOrderLine[] = [
    { itemId: "GG-K17", itemCode: "GG-K17", unit: "PIECE" },
  ];
  const floor = (over: Partial<FloorLine> = {}): FloorLine => ({
    itemId: "GG-K17",
    finishedMilli: 100 * K,
    offcutMilli: 0,
    materials: [
      {
        itemId: "VT-CHOT",
        itemCode: "VT-CHOT",
        unit: "PIECE",
        category: "MATERIAL",
        quantityMilli: 400 * K,
      },
    ],
    ...over,
  });

  it("accepts a good report and 0 finished", () => {
    expect(() => checkFloorReport(order, [floor()])).not.toThrow();
    expect(() =>
      checkFloorReport(order, [floor({ finishedMilli: 0 })]),
    ).not.toThrow();
  });

  it("wants exactly one entry per line", () => {
    expect(() => checkFloorReport(order, [])).toThrow(
      PRODUCTION_MESSAGES.lineMissing("GG-K17"),
    );
    expect(() => checkFloorReport(order, [floor(), floor()])).toThrow(
      PRODUCTION_MESSAGES.lineTwice("GG-K17"),
    );
    expect(() =>
      checkFloorReport(order, [floor(), floor({ itemId: "GG-CH" })]),
    ).toThrow(PRODUCTION_MESSAGES.lineUnknown);
  });

  it("wants whole finished pieces, at least 0", () => {
    const message = PRODUCTION_MESSAGES.finishedWhole("GG-K17", "cái");
    expect(() =>
      checkFloorReport(order, [floor({ finishedMilli: 1500 })]),
    ).toThrow(message);
    expect(() =>
      checkFloorReport(order, [floor({ finishedMilli: -1000 })]),
    ).toThrow(message);
  });

  it("refuses negative offcuts", () => {
    expect(() => checkFloorReport(order, [floor({ offcutMilli: -1 })])).toThrow(
      PRODUCTION_MESSAGES.offcut("GG-K17"),
    );
  });

  it("wants whole numbers for count units", () => {
    const line = floor();
    expect(() =>
      checkFloorReport(order, [
        {
          ...line,
          materials: [
            {
              ...(line.materials[0] as FloorLine["materials"][number]),
              quantityMilli: 400_500,
            },
          ],
        },
      ]),
    ).toThrow("VT-CHOT tính theo cái, nhập số nguyên");
  });

  it("wants material items, once each", () => {
    const line = floor();
    const first = line.materials[0] as FloorLine["materials"][number];
    expect(() =>
      checkFloorReport(order, [
        { ...line, materials: [{ ...first, category: "EQUIPMENT" }] },
      ]),
    ).toThrow("Nguyên liệu phải là mã nhóm Vật tư");
    expect(() =>
      checkFloorReport(order, [{ ...line, materials: [first, first] }]),
    ).toThrow(PRODUCTION_MESSAGES.materialTwice("GG-K17", "VT-CHOT"));
    expect(() =>
      checkFloorReport(order, [
        { ...line, materials: [{ ...first, quantityMilli: -1000 }] },
      ]),
    ).toThrow(PRODUCTION_MESSAGES.materialNegative("VT-CHOT"));
  });
});

describe("previewProductionCost (design D5)", () => {
  it("matches posting while the stock is there", () => {
    const ctx = context();
    expect(previewProductionCost([frame, brace], ctx)).toEqual(
      productionPostingLines([frame, brace], ctx).lines,
    );
  });

  it("still gives a figure when a material is short", () => {
    const stock = new Map(context().stock);
    stock.set("VT-ONG27", stockOf(100, 19_000));
    const lines = previewProductionCost([frame], context({ stock }));
    expect(lines[0]?.materialAmount).toBe(29_445_500);
  });

  it("takes labour as 0 before the copy and allows a non-positive value", () => {
    const line: PostingLine = {
      ...frame,
      laborRate: null,
      offcutMilli: 1000 * K,
      materials: [material("VT-CHOT", 1, { unit: "PIECE" })],
    };
    const [preview] = previewProductionCost([line], context());
    expect(preview?.laborAmount).toBe(0);
    expect(preview?.finishedAmount).toBeLessThan(0);
  });
});

import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import {
  assertContractDeliverable,
  assertPicks,
  assertSaleWithinRemaining,
  cappedEstimateText,
  checkOverDelivery,
  deliveredSaleAmount,
  DELIVERY_STATUSES,
  estimatedPieces,
  explodeDelivery,
  lineKey,
  lineProgress,
  remainingToDeliver,
  requireReason,
  transition,
  type DeliveryCommand,
  type DeliveryStatus,
  type PickLine,
  type TermsLine,
} from "./delivery-note";
import { toMoney } from "./money";

const CODE = "PX-2026-140";

describe("transition", () => {
  const table: Record<
    DeliveryCommand,
    Partial<Record<DeliveryStatus, DeliveryStatus>>
  > = {
    EDIT: { PLANNED: "PLANNED" },
    START: { PLANNED: "PICKING" },
    RETURN: { PICKING: "PLANNED" },
    RECALL: { PICKING: "PLANNED" },
    POST: { PICKING: "POSTED" },
    CANCEL: { PLANNED: "CANCELLED", PICKING: "CANCELLED" },
  };

  for (const [command, allowed] of Object.entries(table)) {
    for (const status of DELIVERY_STATUSES) {
      const to = allowed[status];
      it(`${command} from ${status} ${to ? `→ ${to}` : "is refused"}`, () => {
        const run = () => transition(status, command as DeliveryCommand, CODE);
        if (to) expect(run()).toBe(to);
        else expect(run).toThrow();
      });
    }
  }

  it("names the picker hint when editing a note being picked", () => {
    expect(() => transition("PICKING", "EDIT", CODE)).toThrow(
      "Thủ kho đang nhặt phiếu PX-2026-140. Bạn rút phiếu về để sửa.",
    );
  });

  it("refuses to cancel a posted note", () => {
    expect(() => transition("POSTED", "CANCEL", "PX-2026-139")).toThrow(
      "Phiếu PX-2026-139 đã xuất nên không hủy được. Hàng xuất nhầm thì lập phiếu thu hồi.",
    );
  });
});

describe("requireReason", () => {
  const missing = "Bạn ghi lý do để văn phòng biết cần đổi gì.";

  it("treats blanks as empty", () => {
    expect(() => requireReason("   ", missing)).toThrow(missing);
  });

  it("trims and keeps a reason", () => {
    expect(requireReason("  Bãi hết chéo, văn phòng đổi đợt ", missing)).toBe(
      "Bãi hết chéo, văn phòng đổi đợt",
    );
  });

  it("refuses 501 characters", () => {
    expect(() => requireReason("a".repeat(501), missing)).toThrow(
      "Lý do tối đa 500 ký tự.",
    );
  });
});

describe("assertContractDeliverable", () => {
  it("lets approved and active through", () => {
    expect(() => assertContractDeliverable("APPROVED")).not.toThrow();
    expect(() => assertContractDeliverable("ACTIVE")).not.toThrow();
  });

  it.each([
    ["PENDING", "Hợp đồng chưa được duyệt nên chưa xuất hàng được."],
    ["DRAFT", "Hợp đồng chưa được duyệt nên chưa xuất hàng được."],
    ["CANCELLED", "Hợp đồng đã hủy nên không xuất hàng được."],
    ["CLOSED", "Hợp đồng đã thanh lý nên không xuất hàng được."],
  ])("refuses %s", (status, message) => {
    expect(() => assertContractDeliverable(status)).toThrow(message);
  });
});

const rentalTerms: TermsLine[] = [
  {
    itemId: "h17",
    itemCode: "H1,7",
    unit: "PIECE",
    condition: null,
    pricingUnit: null,
    quantityMilli: 300_000,
  },
  {
    itemId: "cheo",
    itemCode: "CHEO1,7",
    unit: "PIECE",
    condition: null,
    pricingUnit: null,
    quantityMilli: 300_000,
  },
  {
    itemId: "mam",
    itemCode: "MAM1,6",
    unit: "PIECE",
    condition: null,
    pricingUnit: null,
    quantityMilli: 160_000,
  },
];

const kit = {
  kitId: "bo17",
  kitCode: "BO-1,7",
  quantity: 60,
  components: [
    { itemId: "h17", itemCode: "H1,7", quantity: 2 },
    { itemId: "cheo", itemCode: "CHEO1,7", quantity: 2 },
    { itemId: "mam", itemCode: "MAM1,6", quantity: 1 },
  ],
};

describe("explodeDelivery", () => {
  it("splits 60 kits into parts", () => {
    const lines = explodeDelivery({
      type: "RENTAL",
      kits: [kit],
      own: [],
      sale: [],
      terms: rentalTerms,
    });
    expect(lines.map((line) => [line.itemId, line.requestedMilli])).toEqual([
      ["h17", 120_000],
      ["cheo", 120_000],
      ["mam", 60_000],
    ]);
  });

  it("merges a loose line with the kit parts", () => {
    const lines = explodeDelivery({
      type: "RENTAL",
      kits: [kit],
      own: [{ itemId: "cheo", itemCode: "CHEO1,7", ownMilli: 40_000 }],
      sale: [],
      terms: rentalTerms,
    });
    expect(lines.find((line) => line.itemId === "cheo")?.requestedMilli).toBe(
      160_000,
    );
  });

  it("refuses a kit with a part not on the contract", () => {
    expect(() =>
      explodeDelivery({
        type: "RENTAL",
        kits: [kit],
        own: [],
        sale: [],
        terms: rentalTerms.slice(0, 2),
      }),
    ).toThrow(
      "Bộ BO-1,7 có mã MAM1,6 chưa có trên hợp đồng. Bạn chọn từng mã hoặc lập phụ lục thêm mã này.",
    );
  });

  it("refuses an item not on the contract", () => {
    expect(() =>
      explodeDelivery({
        type: "RENTAL",
        kits: [],
        own: [{ itemId: "cc3", itemCode: "CC3", ownMilli: 20_000 }],
        sale: [],
        terms: rentalTerms,
      }),
    ).toThrow(
      "Mã CC3 chưa có trên hợp đồng. Bạn lập phụ lục nếu khách cần thêm mã này.",
    );
  });

  it("names the day an amendment adds the item", () => {
    expect(() =>
      explodeDelivery({
        type: "RENTAL",
        kits: [],
        own: [{ itemId: "cc3", itemCode: "CC3", ownMilli: 20_000 }],
        sale: [],
        terms: rentalTerms,
        later: new Map([["CC3", "2026-12-15" as BusinessDate]]),
      }),
    ).toThrow("Mã CC3 chỉ có trên hợp đồng từ 15/12/2026.");
  });

  it("refuses an empty batch", () => {
    expect(() =>
      explodeDelivery({
        type: "RENTAL",
        kits: [],
        own: [],
        sale: [],
        terms: rentalTerms,
      }),
    ).toThrow("Bạn thêm ít nhất một bộ hoặc một mã hàng cho đợt xuất.");
  });

  it("keeps sale lines by condition and pricing unit", () => {
    const terms: TermsLine[] = [
      {
        itemId: "h17",
        itemCode: "H1,7",
        unit: "PIECE",
        condition: "GOOD",
        pricingUnit: "KG",
        quantityMilli: 1_250_500,
      },
    ];
    expect(
      explodeDelivery({
        type: "SALE",
        kits: [],
        own: [],
        sale: [
          {
            itemId: "h17",
            condition: "GOOD",
            pricingUnit: "KG",
            quantityMilli: 1_250_500,
          },
        ],
        terms,
      }),
    ).toEqual([
      {
        itemId: "h17",
        condition: "GOOD",
        pricingUnit: "KG",
        quantityMilli: 1_250_500,
        requestedMilli: 1_250_500,
      },
    ]);
    expect(() =>
      explodeDelivery({
        type: "SALE",
        kits: [],
        own: [],
        sale: [
          {
            itemId: "h17",
            condition: "NEW",
            pricingUnit: "ITEM",
            quantityMilli: 10_000,
          },
        ],
        terms,
      }),
    ).toThrow("Dòng H1,7 Mới chưa có trên hợp đồng bán.");
  });
});

describe("remainingToDeliver", () => {
  it("keeps 180 left and 80 unplanned after two batches", () => {
    const rows = remainingToDeliver({
      type: "RENTAL",
      terms: rentalTerms,
      done: new Map([["cheo", 120_000]]),
      open: new Map([["cheo", 100_000]]),
    });
    const cheo = rows.find((row) => row.key === "cheo");
    expect(cheo?.remainingMilli).toBe(180_000);
    expect(cheo?.unplannedMilli).toBe(80_000);
  });

  it("counts what is on site, so return then redeliver is not over", () => {
    // 300 on the contract, 300 delivered, 200 returned: 100 on site.
    const rows = remainingToDeliver({
      type: "RENTAL",
      terms: rentalTerms,
      done: new Map([["h17", 100_000]]),
      open: new Map(),
    });
    const h17 = rows.find((row) => row.key === "h17");
    expect(h17?.remainingMilli).toBe(200_000);
    const over = checkOverDelivery(
      "RENTAL",
      [
        {
          itemId: "h17",
          condition: null,
          pricingUnit: null,
          requestedMilli: 200_000,
        },
      ],
      rows,
      false,
    );
    expect(over).toEqual([]);
  });

  it("shows 0 and the overage when more went out", () => {
    const rows = remainingToDeliver({
      type: "RENTAL",
      terms: rentalTerms,
      done: new Map([["cheo", 320_000]]),
      open: new Map(),
    });
    const cheo = rows.find((row) => row.key === "cheo");
    expect(cheo?.remainingMilli).toBe(0);
    expect(cheo?.overMilli).toBe(20_000);
  });

  it("counts a sale by kg in weighed kg", () => {
    const line: TermsLine = {
      itemId: "h17",
      itemCode: "H1,7",
      unit: "PIECE",
      condition: "GOOD",
      pricingUnit: "KG",
      quantityMilli: 1_250_500,
    };
    const [row] = remainingToDeliver({
      type: "SALE",
      terms: [line],
      done: new Map([[lineKey("h17", "GOOD", "KG"), 800_000]]),
      open: new Map(),
    });
    expect(row?.remainingMilli).toBe(450_500);
  });

  it("is 0 with nothing on the contract line", () => {
    const [row] = remainingToDeliver({
      type: "RENTAL",
      terms: [{ ...(rentalTerms[0] as TermsLine), quantityMilli: 0 }],
      done: new Map(),
      open: new Map(),
    });
    expect(row?.remainingMilli).toBe(0);
  });
});

describe("checkOverDelivery", () => {
  const rows = remainingToDeliver({
    type: "RENTAL",
    terms: rentalTerms,
    done: new Map([["cheo", 120_000]]),
    open: new Map([["cheo", 100_000]]),
  });
  const ask = [
    {
      itemId: "cheo",
      condition: null,
      pricingUnit: null,
      requestedMilli: 100_000,
    },
  ];

  it("asks a rental to confirm going over", () => {
    expect(() => checkOverDelivery("RENTAL", ask, rows, false)).toThrow(
      "Đợt này xuất CHEO1,7 nhiều hơn số còn phải giao 20 cái. Bạn tích xác nhận nếu vẫn muốn xuất.",
    );
  });

  it("returns the overage once confirmed", () => {
    expect(checkOverDelivery("RENTAL", ask, rows, true)).toEqual([
      { key: "cheo", itemCode: "CHEO1,7", overMilli: 20_000, unit: "PIECE" },
    ]);
  });

  it("refuses a sale going over", () => {
    const sale: TermsLine = {
      itemId: "h17",
      itemCode: "H1,7",
      unit: "PIECE",
      condition: "NEW",
      pricingUnit: "ITEM",
      quantityMilli: 150_000,
    };
    const saleRows = remainingToDeliver({
      type: "SALE",
      terms: [sale],
      done: new Map(),
      open: new Map(),
    });
    expect(() =>
      checkOverDelivery(
        "SALE",
        [
          {
            itemId: "h17",
            condition: "NEW",
            pricingUnit: "ITEM",
            requestedMilli: 160_000,
          },
        ],
        saleRows,
        true,
      ),
    ).toThrow(
      "Hợp đồng bán chỉ còn phải giao 150 cái H1,7 Mới. Bạn lập phụ lục nếu khách mua thêm.",
    );
  });
});

const rentalLine = (
  picks: PickLine["picks"],
  requestedMilli = 120_000,
): PickLine => ({
  lineId: "l1",
  itemCode: "H1,7",
  unit: "PIECE",
  condition: null,
  pricingUnit: null,
  requestedMilli,
  picks,
});

const kgLine = (picks: PickLine["picks"]): PickLine => ({
  lineId: "l2",
  itemCode: "H1,7",
  unit: "PIECE",
  condition: "GOOD",
  pricingUnit: "KG",
  requestedMilli: 1_250_500,
  picks,
});

const pick = (
  condition: PickLine["picks"][number]["condition"],
  quantityMilli: number,
  weighedMilli: number | null = null,
) => ({
  condition,
  quantityMilli,
  weighedMilli,
  piecesEstimated: false,
});

describe("assertPicks", () => {
  it("lets a rental split NEW and GOOD", () => {
    expect(
      assertPicks("RENTAL", [
        rentalLine([pick("NEW", 80_000), pick("GOOD", 40_000)]),
      ]),
    ).toEqual([]);
  });

  it.each(["NEEDS_REPAIR", "SCRAP"] as const)(
    "refuses %s on a rental",
    (condition) => {
      expect(() =>
        assertPicks("RENTAL", [rentalLine([pick(condition, 10_000)])]),
      ).toThrow("Hợp đồng thuê chỉ xuất hàng Mới hoặc Tốt.");
    },
  );

  it("refuses picking more than needed", () => {
    expect(() =>
      assertPicks("RENTAL", [rentalLine([pick("GOOD", 130_000)])]),
    ).toThrow(
      "Bạn nhặt 130 cái H1,7, nhiều hơn số cần 120 cái. Văn phòng cần sửa phiếu nếu muốn xuất thêm.",
    );
  });

  it("returns the shortage", () => {
    expect(assertPicks("RENTAL", [rentalLine([pick("GOOD", 80_000)])])).toEqual(
      [{ lineId: "l1", itemCode: "H1,7", leftMilli: 40_000, unit: "PIECE" }],
    );
  });

  it("refuses a note with nothing picked", () => {
    expect(() => assertPicks("RENTAL", [rentalLine([])])).toThrow(
      "Phiếu chưa có hàng nào được nhặt. Bạn trả lại văn phòng nếu không xuất được.",
    );
  });

  it("refuses half a piece", () => {
    expect(() =>
      assertPicks("RENTAL", [rentalLine([pick("GOOD", 2_500)])]),
    ).toThrow("H1,7 tính theo cái, số lượng phải là số nguyên.");
  });

  it("needs the weighed kg on a sale by kg", () => {
    expect(() => assertPicks("SALE", [kgLine([pick("GOOD", 90_000)])])).toThrow(
      "Dòng H1,7 Tốt bán theo kg, bạn nhập số kg cân.",
    );
  });

  it("compares weighed kg, not pieces, with the need", () => {
    const line = kgLine([pick("GOOD", 80_000, 1_100_000)]);
    expect(lineProgress(line)).toEqual({
      pickedMilli: 1_100_000,
      leftMilli: 150_500,
      extraMilli: 0,
      done: false,
    });
    expect(assertPicks("SALE", [line])).toEqual([
      { lineId: "l2", itemCode: "H1,7", leftMilli: 150_500, unit: "KG" },
    ]);
  });

  it("lets a weighing 7,5 kg over through", () => {
    const line = kgLine([pick("GOOD", 90_000, 1_258_000)]);
    expect(assertPicks("SALE", [line])).toEqual([]);
    expect(lineProgress(line).extraMilli).toBe(7_500);
    expect(lineProgress(line).done).toBe(true);
  });

  it("refuses a weighing past 10 %", () => {
    expect(() =>
      assertPicks("SALE", [kgLine([pick("GOOD", 90_000, 1_400_000)])]),
    ).toThrow(
      "Kg cân của H1,7 Tốt (1.400 kg) vượt số cần 1.250,5 kg quá 10 %. Văn phòng cần sửa phiếu hoặc lập phụ lục.",
    );
  });

  it("keeps the sale line condition", () => {
    expect(() =>
      assertPicks("SALE", [kgLine([pick("NEW", 90_000, 1_250_500)])]),
    ).toThrow("Dòng H1,7 Tốt chỉ xuất hàng Tốt.");
  });
});

describe("assertSaleWithinRemaining", () => {
  const pieces: TermsLine = {
    itemId: "h17",
    itemCode: "H1,7",
    unit: "PIECE",
    condition: "NEW",
    pricingUnit: "ITEM",
    quantityMilli: 150_000,
  };
  const byKg: TermsLine = {
    ...pieces,
    condition: "GOOD",
    pricingUnit: "KG",
    quantityMilli: 1_250_500,
  };

  it("refuses a second sale note past what is left", () => {
    expect(() =>
      assertSaleWithinRemaining([
        { line: pieces, deliveredMilli: 100_000, remainingMilli: 50_000 },
      ]),
    ).toThrow("Hợp đồng bán chỉ còn phải giao 50 cái H1,7 Mới.");
  });

  it("lets kg through within 10 %", () => {
    expect(() =>
      assertSaleWithinRemaining([
        { line: byKg, deliveredMilli: 1_258_000, remainingMilli: 1_250_500 },
      ]),
    ).not.toThrow();
    expect(() =>
      assertSaleWithinRemaining([
        { line: byKg, deliveredMilli: 1_400_000, remainingMilli: 1_250_500 },
      ]),
    ).toThrow("Hợp đồng bán chỉ còn phải giao 1.250,5 kg H1,7 Tốt.");
  });
});

describe("estimatedPieces", () => {
  it("rounds 570,5 kg ÷ 13,6 to 42", () => {
    expect(estimatedPieces(570_500, 13_600, 100_000)).toEqual({
      quantityMilli: 42_000,
      estimatedMilli: 42_000,
      capped: false,
    });
  });

  it("gives at least one piece", () => {
    expect(estimatedPieces(5_000, 13_600, 100_000).quantityMilli).toBe(1_000);
  });

  it("caps at the yard stock and says so", () => {
    const estimate = estimatedPieces(612_000, 13_600, 42_000);
    expect(estimate).toEqual({
      quantityMilli: 42_000,
      estimatedMilli: 45_000,
      capped: true,
    });
    expect(cappedEstimateText(estimate)).toBe(
      "Ước tính 45 cái nhưng bãi chỉ còn 42 cái Phế liệu, máy điền 42.",
    );
  });
});

describe("deliveredSaleAmount", () => {
  const price = (value: number) => toMoney(value);

  it("multiplies pieces by the piece price", () => {
    expect(
      deliveredSaleAmount({
        pricingUnit: "ITEM",
        unit: "PIECE",
        quantityMilli: 200_000,
        weighedMilli: null,
        unitPrice: price(320_000),
      }),
    ).toBe(64_000_000);
  });

  it("uses the weighed kg on a line by kg", () => {
    expect(
      deliveredSaleAmount({
        pricingUnit: "KG",
        unit: "PIECE",
        quantityMilli: 90_000,
        weighedMilli: 1_250_500,
        unitPrice: price(14_000),
      }),
    ).toBe(17_507_000);
    expect(
      deliveredSaleAmount({
        pricingUnit: "KG",
        unit: "PIECE",
        quantityMilli: 42_000,
        weighedMilli: 570_500,
        unitPrice: price(7_500),
      }),
    ).toBe(4_278_750);
  });

  it("rounds half a đồng up", () => {
    expect(
      deliveredSaleAmount({
        pricingUnit: "KG",
        unit: "KG",
        quantityMilli: 500,
        weighedMilli: null,
        unitPrice: price(3),
      }),
    ).toBe(2);
  });
});

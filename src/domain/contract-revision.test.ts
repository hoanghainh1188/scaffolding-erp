import { describe, expect, it } from "vitest";

import {
  assertChanged,
  assertEffectiveDate,
  diffRevisions,
  REVISION_MESSAGES,
  revisionAt,
  type ContentLine,
  type RevisionContent,
} from "./contract-revision";
import { dailyTotal } from "./rental";

const rev = (
  number: number,
  effectiveFrom: string,
  price: number,
  status = "APPROVED",
) => ({ number, effectiveFrom, status, price });

describe("revisionAt", () => {
  const original = rev(0, "2026-11-01", 1200);
  const first = rev(1, "2026-12-15", 1400);

  it("uses the original before the effective date", () => {
    expect(revisionAt([original, first], "2026-12-14")?.price).toBe(1200);
  });

  it("uses the amendment from its effective date", () => {
    expect(revisionAt([original, first], "2026-12-15")?.price).toBe(1400);
  });

  it("follows two amendments", () => {
    const second = rev(2, "2027-02-01", 1300);
    const all = [original, first, second];
    expect(revisionAt(all, "2027-01-10")?.price).toBe(1400);
    expect(revisionAt(all, "2027-02-01")?.price).toBe(1300);
  });

  it("lets the later revision win on the same effective date", () => {
    const second = rev(2, "2026-12-15", 1350);
    expect(revisionAt([original, first, second], "2026-12-15")?.number).toBe(2);
  });

  it("lets an amendment on the start date win over the original", () => {
    const sameDay = rev(1, "2026-11-01", 1250);
    expect(revisionAt([original, sameDay], "2026-11-01")?.price).toBe(1250);
  });

  it("skips amendments not approved yet", () => {
    const pending = rev(1, "2026-12-15", 1400, "PENDING");
    expect(revisionAt([original, pending], "2026-12-20")?.price).toBe(1200);
  });

  it("uses the original before the contract starts", () => {
    expect(revisionAt([original, first], "2026-10-20")?.price).toBe(1200);
  });

  it("has nothing while the original is not approved", () => {
    expect(
      revisionAt([rev(0, "2026-11-01", 1200, "PENDING")], "2026-12-01"),
    ).toBeNull();
  });
});

describe("assertEffectiveDate", () => {
  const limits = {
    contractStart: "2026-11-01",
    lastApprovedEffective: null,
    lastClosedEnd: "2026-11-30",
  };

  it("refuses the last day of a closed period", () => {
    expect(() => assertEffectiveDate("2026-11-30", limits)).toThrow(
      "Ngày hiệu lực phải sau ngày chốt kỳ gần nhất (30/11/2026). Kỳ đã chốt không tính lại.",
    );
  });

  it("accepts the first day after it", () => {
    expect(() => assertEffectiveDate("2026-12-01", limits)).not.toThrow();
  });

  it("accepts any date from the start when nothing is closed", () => {
    expect(() =>
      assertEffectiveDate("2026-11-05", { ...limits, lastClosedEnd: null }),
    ).not.toThrow();
  });

  it("refuses a date before the contract starts", () => {
    expect(() =>
      assertEffectiveDate("2026-10-25", { ...limits, lastClosedEnd: null }),
    ).toThrow(
      "Ngày hiệu lực không được trước ngày bắt đầu hợp đồng (01/11/2026).",
    );
  });

  it("refuses a date before the last approved amendment, same day is fine", () => {
    const after = {
      ...limits,
      lastClosedEnd: null,
      lastApprovedEffective: "2026-12-15",
    };
    expect(() => assertEffectiveDate("2026-12-14", after)).toThrow();
    expect(() => assertEffectiveDate("2026-12-15", after)).not.toThrow();
  });

  it("refuses a sale amendment not after the latest delivery (0.2 #89)", () => {
    const sale = {
      contractStart: "2026-10-01",
      lastApprovedEffective: null,
      lastClosedEnd: null,
      lastSaleDelivery: "2026-10-02",
    };
    expect(() => assertEffectiveDate("2026-10-02", sale)).toThrow(
      "Ngày hiệu lực phải sau ngày giao hàng gần nhất (02/10/2026). Hàng đã giao giữ VAT và hạn trả cũ.",
    );
    expect(() => assertEffectiveDate("2026-10-03", sale)).not.toThrow();
  });
});

const line = (
  itemCode: string,
  pieces: number,
  price: number | null,
): ContentLine => ({
  itemId: itemCode,
  itemCode,
  unit: "PIECE",
  condition: null,
  pricingUnit: "ITEM",
  quantityMilli: pieces * 1000,
  price,
});

const BASE: RevisionContent = {
  type: "RENTAL",
  customerId: "NT-0003",
  siteId: "CT-0003",
  signedDate: "2026-10-28",
  startDate: "2026-11-01",
  endDate: "2027-03-21",
  minRentalDays: 45,
  paymentTermsDays: 30,
  vatEnabled: false,
  vatRate: null,
  companyTruck: true,
  freightPerTrip: 1_800_000,
  lines: [
    line("H1,7", 600, 1200),
    line("CHEO1,7", 600, 300),
    line("MAM1,6", 300, 900),
    line("KU0,5", 400, 400),
  ],
  compensations: [
    {
      itemId: "H1,7",
      itemCode: "H1,7",
      lostPrice: 480_000,
      damagePrice: 50_000,
    },
  ],
  deposits: [
    {
      kind: "CASH",
      amount: 50_000_000,
      method: "TRANSFER",
      bankName: null,
      guaranteeNumber: null,
      expiryDate: null,
    },
  ],
  batches: [],
};

const dayRent = (content: RevisionContent) =>
  dailyTotal(
    content.lines.map((entry) => ({
      dailyPrice: entry.price ?? 0,
      quantityMilli: entry.quantityMilli,
    })),
  );

describe("diffRevisions", () => {
  it("lists a new price and a new item", () => {
    const after = {
      ...BASE,
      lines: [
        line("H1,7", 600, 1200),
        line("CHEO1,7", 600, 400),
        line("MAM1,6", 300, 900),
        line("KU0,5", 400, 400),
        line("CC3", 200, 700),
      ],
    };
    const changes = diffRevisions(BASE, after, { effectiveFrom: "2026-12-15" });
    expect(changes.map((entry) => entry.label)).toEqual([
      "Giá CHEO1,7",
      "Thêm CC3",
    ]);
    expect(changes[0]).toMatchObject({ before: "300 ₫", after: "400 ₫" });
    expect(dayRent(BASE)).toBe(1_330_000);
    expect(dayRent(after)).toBe(1_530_000);
  });

  it("lists term, compensation and deposit changes", () => {
    const after = {
      ...BASE,
      endDate: "2027-04-30",
      vatEnabled: true,
      vatRate: "8.00",
      compensations: [{ ...BASE.compensations[0]!, lostPrice: 500_000 }],
      deposits: [{ ...BASE.deposits[0]!, amount: 70_000_000 }],
    };
    expect(
      diffRevisions(BASE, after, { effectiveFrom: "2026-12-15" }).map(
        (entry) => [entry.label, entry.before, entry.after],
      ),
    ).toEqual([
      ["Giá mất H1,7", "480.000 ₫", "500.000 ₫"],
      ["Kết thúc dự kiến", "21/03/2027", "30/04/2027"],
      ["VAT", "Không", "Có · 8 %"],
      [
        "Cọc và bảo lãnh",
        "Cọc tiền 50.000.000 ₫ · chuyển khoản",
        "Cọc tiền 70.000.000 ₫ · chuyển khoản",
      ],
    ]);
  });

  it.each([
    ["type", { type: "SALE" }],
    ["customer", { customerId: "NT-0005" }],
    ["site", { siteId: "CT-0004" }],
    ["signed date", { signedDate: "2026-10-29" }],
    ["start date", { startDate: "2026-11-05" }],
  ])("refuses a change of %s", (_name, patch) => {
    expect(() =>
      diffRevisions(
        BASE,
        { ...BASE, ...patch },
        { effectiveFrom: "2026-12-15" },
      ),
    ).toThrow(REVISION_MESSAGES.fixed);
  });

  it("refuses to drop a line", () => {
    expect(() =>
      diffRevisions(
        BASE,
        { ...BASE, lines: BASE.lines.slice(0, 3) },
        { effectiveFrom: "2026-12-15" },
      ),
    ).toThrow(
      "Phụ lục không bỏ được dòng hàng đã có (KU0,5). Bạn giữ dòng và sửa số lượng dự kiến.",
    );
  });

  it("refuses a new end date before the effective date", () => {
    expect(() =>
      diffRevisions(
        BASE,
        { ...BASE, endDate: "2026-12-10" },
        { effectiveFrom: "2026-12-15" },
      ),
    ).toThrow(
      "Ngày kết thúc dự kiến mới phải sau ngày hiệu lực của phụ lục (15/12/2026).",
    );
  });

  it("lists fixed fields and dropped lines for a draft edit", () => {
    const changes = diffRevisions(BASE, {
      ...BASE,
      startDate: "2026-11-05",
      lines: BASE.lines.slice(0, 3),
    });
    expect(changes.map((entry) => entry.label)).toEqual([
      "Ngày bắt đầu",
      "Bỏ KU0,5",
    ]);
  });

  it("finds nothing in a plain copy, and submitting it is refused", () => {
    const changes = diffRevisions(
      BASE,
      { ...BASE },
      { effectiveFrom: "2026-12-15" },
    );
    expect(changes).toEqual([]);
    expect(() => assertChanged(changes)).toThrow(
      "Phụ lục chưa có thay đổi nào.",
    );
  });
});

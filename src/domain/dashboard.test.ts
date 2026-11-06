// D1 pure rules (dashboard-basic tasks 2.1, 2.4–2.7; spec dashboard).
import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import {
  RISK_LOSS_DAYS,
  approvalsTitle,
  dayText,
  greeting,
  isPastEnd,
  isRecentLoss,
  millionsText,
  monthTotals,
  onSiteTotals,
  piecesText,
  regionTotals,
  riskBySite,
  riskLabel,
  tonsText,
  topCustomers,
  type DayRevenue,
  type RiskContract,
} from "./dashboard";
import { toMoney } from "./money";

const d = (value: string) => value as BusinessDate;

describe("greeting (0.2 #94)", () => {
  it("counts what the director approves", () => {
    expect(greeting("Minh Anh", "DIRECTOR", 4)).toBe(
      "Chào Minh Anh, hôm nay có 4 việc chờ bạn duyệt",
    );
    expect(greeting("Minh Anh", "DIRECTOR", 0)).toBe(
      "Chào Minh Anh, hôm nay không có việc nào chờ bạn duyệt",
    );
  });

  it("counts what others wait for", () => {
    expect(greeting("Thu Hà", "ACCOUNTANT", 1)).toBe(
      "Chào Thu Hà, có 1 việc đang chờ Giám đốc duyệt",
    );
    expect(greeting("Quốc Bảo", "SALES", 0)).toBe(
      "Chào Quốc Bảo, không có việc nào đang chờ Giám đốc duyệt",
    );
  });

  it("titles the block by role", () => {
    expect(approvalsTitle("DIRECTOR")).toBe("Chờ bạn duyệt");
    expect(approvalsTitle("SALES")).toBe("Đang chờ Giám đốc duyệt");
  });

  it("writes the weekday", () => {
    expect(dayText(d("2026-11-06"))).toBe("Thứ Sáu, 06/11/2026");
    expect(dayText(d("2026-11-08"))).toBe("Chủ Nhật, 08/11/2026");
  });
});

describe("risk signs (0.2 #92)", () => {
  it("keeps a loss up to 30 days old", () => {
    expect(RISK_LOSS_DAYS).toBe(30);
    expect(isRecentLoss(d("2026-10-07"), d("2026-11-06"))).toBe(true);
    expect(isRecentLoss(d("2026-10-07"), d("2026-11-07"))).toBe(false);
    expect(isRecentLoss(d("2026-11-06"), d("2026-11-06"))).toBe(true);
    expect(isRecentLoss(d("2026-11-07"), d("2026-11-06"))).toBe(false);
  });

  it("marks a contract past its end with goods on site", () => {
    const held = [{ unit: "PIECE" as const, milli: 860_000 }];
    expect(isPastEnd(d("2026-10-31"), d("2026-11-06"), held)).toBe(true);
    expect(isPastEnd(d("2026-11-06"), d("2026-11-06"), held)).toBe(false);
    expect(isPastEnd(null, d("2026-11-06"), held)).toBe(false);
    expect(isPastEnd(d("2026-10-31"), d("2026-11-06"), [])).toBe(false);
    expect(
      isPastEnd(d("2026-10-31"), d("2026-11-06"), [
        { unit: "PIECE", milli: 0 },
      ]),
    ).toBe(false);
  });

  it("labels each sign", () => {
    expect(riskLabel({ kind: "OVERDUE", days: 36 })).toBe("Nợ quá hạn 36 ngày");
    expect(
      riskLabel({
        kind: "LOSS",
        date: d("2026-10-20"),
        items: [{ code: "PK-KU", unit: "PIECE", milli: 3_000 }],
      }),
    ).toBe("Mất 3 PK-KU ngày 20/10");
    expect(
      riskLabel({
        kind: "PAST_END",
        endDate: d("2026-10-31"),
        onSite: [{ unit: "PIECE", milli: 860_000 }],
      }),
    ).toBe("Hết hạn HĐ 31/10, còn 860 cái");
  });

  it("groups risky contracts by site", () => {
    const contract = (
      siteId: string,
      siteName: string,
      code: string,
      days: number | null,
    ): RiskContract => ({
      siteId,
      siteCode: siteId,
      siteName,
      contractId: code,
      contractCode: code,
      customerName: "Nhà thầu",
      signs:
        days === null
          ? [
              {
                kind: "LOSS",
                date: d("2026-10-20"),
                items: [{ code: "PK-KU", unit: "PIECE", milli: 3_000 }],
              },
            ]
          : [{ kind: "OVERDUE", days }],
    });
    const sites = riskBySite([
      contract("CT-7", "An Phú – Block B", "MINHPHAT", null),
      contract("CT-7", "An Phú – Block B", "SONGHONG", 12),
      contract("CT-9", "KCN Quang Minh", "SH2", 36),
      { ...contract("CT-1", "Không rủi ro", "X", 0), signs: [] },
    ]);
    expect(sites.map((site) => site.siteName)).toEqual([
      "KCN Quang Minh",
      "An Phú – Block B",
    ]);
    expect(sites[1]?.contracts.map((entry) => entry.contractCode)).toEqual([
      "MINHPHAT",
      "SONGHONG",
    ]);
  });
});

describe("pieces and tons (design D8)", () => {
  it("counts cái only and weighs every item", () => {
    const totals = onSiteTotals([
      { unit: "PIECE", milli: 100_000, standardWeightKg: "5.000" },
      { unit: "METER", milli: 50_000, standardWeightKg: "3.000" },
      { unit: "KG", milli: 210_000, standardWeightKg: null },
    ]);
    expect(totals).toEqual({ piecesMilli: 100_000, kgMilli: 860_000 });
    expect(piecesText(totals.piecesMilli)).toBe("100");
    expect(tonsText(totals.kgMilli)).toBe("0,9");
  });

  it("gives no piece for an item counted in cây", () => {
    const totals = onSiteTotals([
      { unit: "BAR", milli: 30_000, standardWeightKg: "25.200" },
    ]);
    expect(totals).toEqual({ piecesMilli: 0, kgMilli: 756_000 });
    expect(tonsText(totals.kgMilli)).toBe("0,8");
  });

  it("writes tons with one decimal and grouping", () => {
    expect(tonsText(318_400_000)).toBe("318,4");
    expect(tonsText(1_284_550_000)).toBe("1.284,6");
    expect(tonsText(0)).toBe("0,0");
  });
});

describe("regionTotals", () => {
  it("adds sites by region, unknown last, and a total", () => {
    const { rows, total } = regionTotals([
      {
        siteId: "a",
        province: "HN",
        piecesMilli: 15_940_000,
        kgMilli: 231_200_000,
      },
      {
        siteId: "b",
        province: "DNG",
        piecesMilli: 1_880_000,
        kgMilli: 27_600_000,
      },
      {
        siteId: "c",
        province: "HCM",
        piecesMilli: 4_040_000,
        kgMilli: 59_600_000,
      },
      { siteId: "d", province: null, piecesMilli: 100_000, kgMilli: 500_000 },
      { siteId: "e", province: "HN", piecesMilli: 0, kgMilli: 0 },
    ]);
    expect(rows.map((row) => [row.label, row.siteCount])).toEqual([
      ["Miền Bắc", 1],
      ["Miền Trung", 1],
      ["Miền Nam", 1],
      ["Chưa rõ", 1],
    ]);
    expect(total).toEqual({
      label: "Cộng",
      siteCount: 4,
      piecesMilli: 21_960_000,
      kgMilli: 318_900_000,
    });
  });

  it("has no unknown row when every site has a province", () => {
    const { rows } = regionTotals([
      { siteId: "a", province: "HN", piecesMilli: 1_000, kgMilli: 1_000 },
    ]);
    expect(rows.map((row) => row.label)).toEqual([
      "Miền Bắc",
      "Miền Trung",
      "Miền Nam",
    ]);
  });
});

describe("monthTotals and topCustomers", () => {
  const day = (date: string, rent: number, sale: number): DayRevenue => ({
    date: d(date),
    rent: toMoney(rent),
    sale: toMoney(sale),
  });

  it("adds days by month, keeps negatives and flags open months", () => {
    const months = monthTotals(
      [
        day("2026-10-31", 100, 50),
        day("2026-11-01", 200, 0),
        day("2026-11-04", -500, 0),
      ],
      ["2026-10", "2026-11"],
      new Set(["2026-11"]),
    );
    expect(months).toEqual([
      { month: "2026-10", rent: 100, sale: 50, total: 150, provisional: false },
      { month: "2026-11", rent: -300, sale: 0, total: -300, provisional: true },
    ]);
  });

  it("ranks by value then name and leaves zero out", () => {
    const top = topCustomers([
      { customerId: "1", name: "Hòa Bình", value: 90 },
      { customerId: "2", name: "Sông Hồng", value: 1_284 },
      { customerId: "3", name: "Minh Phát", value: 962 },
      { customerId: "4", name: "Thành Công", value: 744 },
      { customerId: "5", name: "Đông Á", value: 512 },
      { customerId: "6", name: "Trần Văn Hùng", value: 186 },
      { customerId: "7", name: "Không mua", value: 0 },
      { customerId: "8", name: "An Bình", value: 186 },
    ]);
    expect(top.map((row) => row.name)).toEqual([
      "Sông Hồng",
      "Minh Phát",
      "Thành Công",
      "Đông Á",
      "An Bình",
    ]);
  });

  it("writes millions for the chart", () => {
    expect(millionsText(278_400_000)).toBe("278,4 tr");
    expect(millionsText(71_300_000)).toBe("71,3 tr");
    expect(millionsText(-200_000)).toBe("-0,2 tr");
    expect(millionsText(1_284_500_000)).toBe("1.284,5 tr");
  });
});

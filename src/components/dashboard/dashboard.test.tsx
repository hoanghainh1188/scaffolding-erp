// D1 blocks (dashboard-basic tasks 5.3–5.5): the revenue panel with its
// day view and a negative day, the site lookup with and without money, the
// approvals, risk, region, stock and top 5 blocks.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import type { DayRevenue, MonthRevenue, RiskSite } from "@/domain/dashboard";
import { toMoney } from "@/domain/money";
import type { ApprovalRow } from "@/lib/dashboard/approvals";
import type { LookupSite } from "@/lib/dashboard/lookup";

import { ApprovalsList } from "./approvals-list";
import { OverdueTile } from "./kpi-tiles";
import { RegionTable } from "./region-table";
import { RevenuePanel } from "./revenue-panel";
import { RiskList } from "./risk-list";
import { SiteLookup } from "./site-lookup";
import { StockTable } from "./stock-table";
import { TopCustomers } from "./top-customers";

const d = (value: string) => value as BusinessDate;
const m = toMoney;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const json = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data, error: null }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const month = (
  key: string,
  rent: number,
  sale: number,
  provisional = false,
): MonthRevenue => ({
  month: key,
  rent: m(rent),
  sale: m(sale),
  total: m(rent + sale),
  provisional,
});

const day = (date: string, rent: number, sale = 0): DayRevenue => ({
  date: d(date),
  rent: m(rent),
  sale: m(sale),
});

describe("RevenuePanel", () => {
  const months = [
    month("2026-06", 233_000_000, 45_400_000),
    month("2026-07", 234_400_000, 25_000_000),
    month("2026-08", 295_200_000, 57_000_000),
    month("2026-09", 295_100_000, 42_000_000),
    month("2026-10", 336_300_000, 67_000_000),
    month("2026-11", 49_800_000, 21_500_000, true),
  ];
  const days = [
    day("2026-11-01", 8_000_000),
    day("2026-11-02", 8_000_000, 21_500_000),
    day("2026-11-03", 8_000_000),
    day("2026-11-04", -200_000),
    day("2026-11-05", 17_580_000),
    day("2026-11-06", 8_420_000),
  ];

  it("shows six months, today and the separate amount", () => {
    render(
      <RevenuePanel
        months={months}
        days={days}
        today={days[5] as DayRevenue}
        separate={10_250_000}
      />,
    );
    expect(screen.getByText("278,4 tr")).toBeInTheDocument();
    expect(screen.getByText("T11*")).toBeInTheDocument();
    expect(screen.getByText("8.420.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("10.250.000 ₫")).toBeInTheDocument();
    expect(
      screen.getByText("tính riêng, không cộng vào doanh số"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Chưa gồm VAT/)).toBeInTheDocument();
  });

  it("switches to the days of the month and draws a negative day below zero", async () => {
    const { container } = render(
      <RevenuePanel
        months={months}
        days={days}
        today={days[5] as DayRevenue}
        separate={0}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Theo ngày" }));
    expect(screen.getByRole("button", { name: "Theo ngày" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const items = container.querySelectorAll("ul.sr-only li");
    expect(items).toHaveLength(6);
    expect(items[3]?.textContent).toContain("thuê -200.000 đồng");
    const zero = Number(container.querySelector("line")?.getAttribute("y1"));
    const rects = [...container.querySelectorAll("rect")];
    const below = rects.filter(
      (rect) => Number(rect.getAttribute("y")) >= zero,
    );
    expect(below).toHaveLength(1);
  });
});

describe("SiteLookup", () => {
  const site = (withMoney: boolean): LookupSite => ({
    siteId: "s1",
    code: "CT-0007",
    name: "Chung cư An Phú – Block B",
    provinceName: "Hà Nội",
    regionLabel: "Miền Bắc",
    onSite: { piecesMilli: 1_240_000, kgMilli: 18_600_000 },
    contracts: [
      {
        id: "c1",
        code: "082026/ANPHAT-MINHPHAT",
        customerName: "Cty TNHH Xây dựng Minh Phát",
        signedDate: "2026-08-01",
        status: "ACTIVE",
        onSite: { piecesMilli: 1_240_000, kgMilli: 18_600_000 },
        ...(withMoney
          ? {
              money: {
                rentThisMonth: 4_560_000,
                rentAsOf: d("2026-11-06"),
                owed: 33_050_000,
                overdue: { amount: m(0), days: 0 },
                depositAgreed: 50_000_000,
                depositReceived: 50_000_000,
              },
            }
          : {}),
      },
    ],
  });

  it("finds one site after a pause and shows its contract with money", async () => {
    fetchMock.mockResolvedValue(json({ sites: [site(true)] }));
    render(<SiteLookup />);
    await userEvent.type(screen.getByRole("combobox"), "CT-0007");
    expect(
      await screen.findByText("CT-0007 · Chung cư An Phú – Block B"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/dashboard/site-lookup?q=CT-0007",
    );
    expect(screen.getByText("1.240 cái")).toBeInTheDocument();
    expect(screen.getByText("4.560.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("33.050.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("cọc tiền, đã nhận")).toBeInTheDocument();
  });

  it("shows no money line when the server sent none", async () => {
    fetchMock.mockResolvedValue(json({ sites: [site(false)] }));
    render(<SiteLookup />);
    await userEvent.type(screen.getByRole("combobox"), "an phu");
    await screen.findByText("CT-0007 · Chung cư An Phú – Block B");
    expect(screen.getByText("Đang giữ")).toBeInTheDocument();
    expect(screen.queryByText("Thuê tháng này")).not.toBeInTheDocument();
    expect(screen.queryByText("Đang nợ")).not.toBeInTheDocument();
  });

  it("lets the keyboard pick among several sites", async () => {
    const other = {
      ...site(false),
      siteId: "s2",
      code: "CT-0002",
      name: "Trường THCS Dương Nội",
    };
    fetchMock.mockResolvedValue(json({ sites: [site(false), other] }));
    render(<SiteLookup />);
    const box = screen.getByRole("combobox");
    await userEvent.type(box, "minh phat");
    const list = await screen.findByRole("listbox");
    expect(within(list).getAllByRole("option")).toHaveLength(2);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(
      await screen.findByText("CT-0002 · Trường THCS Dương Nội"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("does not ask the server under two characters", async () => {
    render(<SiteLookup />);
    await userEvent.type(screen.getByRole("combobox"), "C");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says when nothing is found", async () => {
    fetchMock.mockResolvedValue(json({ sites: [] }));
    render(<SiteLookup />);
    await userEvent.type(screen.getByRole("combobox"), "khong co");
    await waitFor(() =>
      expect(
        screen.getByText("Không tìm thấy công trình nào."),
      ).toBeInTheDocument(),
    );
  });
});

describe("the other blocks", () => {
  const approval: ApprovalRow = {
    kind: "CONTRACT",
    label: "Hợp đồng thuê",
    code: "112026/ANPHAT-MINHPHAT",
    party: "Minh Phát · Trường THCS Dương Nội",
    summary: "3 mã hàng",
    amount: 186_200_000,
    sentAt: new Date("2026-11-05T02:00:00Z"),
    href: "/sales/contracts/c1",
  };

  it("titles approvals by role and links each row", () => {
    const { rerender } = render(
      <ApprovalsList role="DIRECTOR" rows={[approval]} />,
    );
    expect(
      screen.getByRole("heading", { name: /^Chờ bạn duyệt\s*·\s*1$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Hợp đồng thuê 112026/ANPHAT-MINHPHAT",
      }),
    ).toHaveAttribute("href", "/sales/contracts/c1");
    expect(screen.getByText("186.200.000 ₫")).toBeInTheDocument();
    rerender(<ApprovalsList role="ACCOUNTANT" rows={[]} />);
    expect(
      screen.getByRole("heading", {
        name: /^Đang chờ Giám đốc duyệt\s*·\s*0$/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Không có việc nào.")).toBeInTheDocument();
  });

  it("shows risk signs, overdue in red", () => {
    const sites: RiskSite[] = [
      {
        siteId: "s9",
        siteCode: "CT-0009",
        siteName: "KCN Quang Minh",
        contracts: [
          {
            siteId: "s9",
            siteCode: "CT-0009",
            siteName: "KCN Quang Minh",
            contractId: "c9",
            contractCode: "122026/ANPHAT-SONGHONG",
            customerName: "Sông Hồng",
            signs: [
              { kind: "OVERDUE", days: 36 },
              {
                kind: "PAST_END",
                endDate: d("2026-10-31"),
                onSite: [{ unit: "PIECE", milli: 860_000 }],
              },
            ],
          },
        ],
      },
    ];
    render(<RiskList sites={sites} />);
    expect(screen.getByText("Nợ quá hạn 36 ngày")).toHaveAttribute(
      "data-tone",
      "destructive",
    );
    expect(screen.getByText("Hết hạn HĐ 31/10, còn 860 cái")).toHaveAttribute(
      "data-tone",
      "warning",
    );
    expect(
      screen.getByRole("heading", { name: /^Công trình đang rủi ro\s*·\s*1$/ }),
    ).toBeInTheDocument();
  });

  it("writes regions with a total", () => {
    render(
      <RegionTable
        onSite={{
          total: {
            label: "Cộng",
            siteCount: 17,
            piecesMilli: 21_860_000,
            kgMilli: 318_400_000,
          },
          regions: [
            {
              label: "Miền Bắc",
              siteCount: 12,
              piecesMilli: 15_940_000,
              kgMilli: 231_200_000,
            },
          ],
        }}
      />,
    );
    const total = screen.getByRole("row", { name: /Cộng/ });
    expect(within(total).getByText("21.860")).toBeInTheDocument();
    expect(within(total).getByText("318,4")).toBeInTheDocument();
  });

  it("writes stock by condition in the item's unit", () => {
    render(
      <StockTable
        rows={[
          {
            itemId: "i1",
            code: "PL-SAT",
            name: "Phế liệu sắt lẫn",
            unit: "KG",
            stock: { NEW: 0, GOOD: 0, NEEDS_REPAIR: 0, SCRAP: 12_850_500 },
            onSite: 0,
          },
        ]}
      />,
    );
    expect(screen.getByText("12.850,5")).toBeInTheDocument();
  });

  it("ranks the top 5 by revenue or by kg", async () => {
    const rows = [
      {
        customerId: "a",
        name: "Sông Hồng",
        revenue: 1_284_500_000,
        kgMilli: 100_000_000,
      },
      {
        customerId: "b",
        name: "Minh Phát",
        revenue: 962_300_000,
        kgMilli: 305_100_000,
      },
    ];
    render(
      <TopCustomers
        year="2026"
        byRevenue={rows}
        byKg={[rows[1], rows[0]] as typeof rows}
      />,
    );
    const names = () =>
      screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
    expect(names()[0]).toContain("Sông Hồng");
    expect(screen.getByText("1.284.500.000 ₫")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Theo kg" }));
    expect(names()[0]).toContain("Minh Phát");
    expect(screen.getByText("305,1 tấn")).toBeInTheDocument();
    expect(screen.getByText(/không trừ hàng trả/)).toBeInTheDocument();
  });

  it("links the overdue tile to D14 filtered", () => {
    render(
      <OverdueTile
        overdue={{ amount: m(189_700_000), customers: 2, longestDays: 36 }}
      />,
    );
    expect(screen.getByText("189.700.000 ₫")).toBeInTheDocument();
    expect(
      screen.getByText("2 nhà thầu · lâu nhất 36 ngày"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem công nợ" })).toHaveAttribute(
      "href",
      "/receivables?filter=overdue",
    );
  });
});

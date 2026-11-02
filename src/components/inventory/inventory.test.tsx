import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { StockCard } from "@/lib/inventory/card";
import type { StockCards as Cards, StockRow } from "@/lib/inventory/stock";

import { AdjustmentActions } from "./adjustment-actions";
import { AdjustmentFormSheet } from "./adjustment-form-sheet";
import { StockCardSummary } from "./stock-card-summary";
import { StockCardTable } from "./stock-card-table";
import { StockCards } from "./stock-cards";
import { StockTable } from "./stock-table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/inventory",
  useSearchParams: () => new URLSearchParams(),
}));

const K17: StockRow = {
  itemId: "k17",
  code: "GG-K17",
  name: "Khung giàn giáo 1,7m",
  unit: "PIECE",
  groupId: "g",
  groupName: "Giàn giáo",
  yard: { NEW: 0, GOOD: 1_240_000, NEEDS_REPAIR: 186_000, SCRAP: 42_000 },
  workshop: 60_000,
  sites: 3_860_000,
  total: 5_388_000,
  value: 1_040_030_760,
};

const SCRAP: StockRow = {
  ...K17,
  itemId: "pl",
  code: "PL-SAT",
  name: "Phế liệu sắt lẫn",
  unit: "KG",
  yard: { NEW: 0, GOOD: 0, NEEDS_REPAIR: 0, SCRAP: 12_850_500 },
  workshop: 0,
  sites: 0,
  total: 12_850_500,
  value: 102_187_176,
};

const rowOf = (code: string) =>
  screen.getByText(code, { exact: false }).closest("tr") as HTMLElement;

describe("D10 stock table", () => {
  it("shows GG-K17 by yard condition, workshop, sites and total", () => {
    render(
      <StockTable
        rows={[K17, SCRAP]}
        sites={new Map([["k17", []]])}
        showValue
      />,
    );
    const row = within(rowOf("GG-K17 · cái"));
    for (const text of [
      "1.240",
      "186",
      "42",
      "60",
      "3.860",
      "5.388",
      "1.040.030.760 ₫",
    ]) {
      expect(row.getByText(text)).toBeInTheDocument();
    }
    expect(row.getByRole("link", { name: "186" })).toHaveAttribute(
      "href",
      "/inventory/items/GG-K17?condition=NEEDS_REPAIR&place=yard",
    );
    expect(
      row.getByRole("button", { name: /tại công trình: 3.860/ }),
    ).toBeInTheDocument();
  });

  it("shows kg items with a dash outside scrap", () => {
    render(<StockTable rows={[SCRAP]} sites={new Map()} showValue />);
    const row = within(rowOf("PL-SAT · kg"));
    expect(row.getAllByText("12.850,5")).toHaveLength(2);
    expect(row.getAllByText("–").length).toBeGreaterThanOrEqual(3);
  });

  it("hides the value column on demand", () => {
    render(<StockTable rows={[K17]} sites={new Map()} showValue={false} />);
    expect(screen.queryByRole("columnheader", { name: "Giá trị" })).toBeNull();
  });
});

describe("D10 cards", () => {
  const cards: Cards = {
    totalValue: 2_595_268_632,
    needsRepair: { PIECE: 706_000 },
    scrapKgMilli: 13_958_900,
    convertedKgMilli: 1_108_400,
    converted: { PIECE: 141_000 },
  };

  it("adds converted scrap pieces to the kg", () => {
    render(<StockCards cards={cards} />);
    expect(screen.getByText("2.595.268.632 ₫")).toBeInTheDocument();
    expect(screen.getByText("706 cái")).toBeInTheDocument();
    expect(screen.getByText("13.958,9 kg")).toBeInTheDocument();
    expect(
      screen.getByText("gồm 1.108,4 kg quy đổi từ 141 cái"),
    ).toBeInTheDocument();
  });
});

describe("D10 cards with metre and bundle items", () => {
  it("lists Chờ sửa per unit and converts metre scrap to kg", () => {
    render(
      <StockCards
        cards={{
          totalValue: 0,
          needsRepair: { PIECE: 706_000, BUNDLE: 4_000, METER: 12_500 },
          scrapKgMilli: 1_136_880,
          convertedKgMilli: 28_480,
          converted: { METER: 8_000 },
        }}
      />,
    );
    expect(screen.getByText("706 cái · 4 bó · 12,5 m")).toBeInTheDocument();
    expect(screen.getByText("gồm 28,48 kg quy đổi từ 8 m")).toBeInTheDocument();
  });
});

const card = (overrides: Partial<StockCard> = {}): StockCard => ({
  item: {
    id: "k17",
    code: "GG-K17",
    name: "Khung giàn giáo 1,7m",
    unit: "PIECE",
    standardWeightKg: "13.500",
  },
  site: null,
  opening: 1_220_000,
  inflow: 450_000,
  outflow: 430_000,
  closing: 1_240_000,
  currentAvg: 195_282,
  openingAvg: 195_000,
  lines: [
    {
      id: 1,
      date: "2026-10-16",
      documentType: "ADJUSTMENT",
      documentId: "adj-1",
      documentCode: "ĐC-2026-004",
      description: "Sửa PTH-2026-064",
      movement: "ADJUST_OUT",
      in: 0,
      out: 10_000,
      balance: 1_320_000,
      unitCost: 195_282,
      avgAfter: 195_282,
    },
  ],
  ...overrides,
});

describe("D11 stock card", () => {
  it("sums the period and shows the current average", () => {
    render(<StockCardSummary card={card()} condition="GOOD" />);
    expect(screen.getByText("1.220")).toBeInTheDocument();
    expect(screen.getByText("+450")).toBeInTheDocument();
    expect(screen.getByText("−430")).toBeInTheDocument();
    expect(screen.getByText("1.240")).toBeInTheDocument();
    expect(screen.getByText("195.282 ₫")).toBeInTheDocument();
    expect(screen.getByText("mỗi cái, tình trạng Tốt")).toBeInTheDocument();
  });

  it("shows kg next to scrap counted in pieces", () => {
    render(
      <StockCardSummary card={card({ closing: 42_000 })} condition="SCRAP" />,
    );
    expect(screen.getByText("≈ 567 kg")).toBeInTheDocument();
  });

  it("has no average card for every condition together", () => {
    render(<StockCardSummary card={card()} condition={null} />);
    expect(screen.queryByText("Giá vốn bình quân hiện tại")).toBeNull();
  });

  it("labels adjustments and hides prices for every condition", () => {
    const { rerender } = render(
      <StockCardTable card={card()} from="2026-10-01" priced />,
    );
    expect(screen.getByText("Điều chỉnh")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ĐC-2026-004" })).toHaveAttribute(
      "href",
      "/inventory/adjustments/adj-1",
    );
    expect(screen.getByText("195.000 ₫")).toBeInTheDocument();
    rerender(<StockCardTable card={card()} from="2026-10-01" priced={false} />);
    expect(
      screen.queryByRole("columnheader", { name: "Đơn giá ghi sổ" }),
    ).toBeNull();
  });

  it("says when nothing moved", () => {
    render(
      <StockCardTable
        card={card({ lines: [], inflow: 0, outflow: 0, closing: 1_220_000 })}
        from="2026-11-01"
        priced
      />,
    );
    expect(screen.getByText("Không có biến động trong kỳ")).toBeInTheDocument();
  });
});

describe("adjustment form and actions", () => {
  const items = [
    {
      id: "k17",
      code: "GG-K17",
      name: "Khung giàn giáo 1,7m",
      unit: "PIECE" as const,
    },
  ];
  const places = [
    { id: "bai", code: "BAI-01", name: "Bãi chính" },
    { id: "xuong", code: "XUONG-01", name: "Xưởng" },
  ];

  async function openForm() {
    const user = userEvent.setup();
    render(
      <AdjustmentFormSheet
        kind="ADJUSTMENT"
        items={items}
        places={places}
        today="2026-10-27"
        trigger={<button type="button">Lập phiếu điều chỉnh</button>}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Lập phiếu điều chỉnh" }),
    );
    return user;
  }

  it("asks for the target condition of a condition fix", async () => {
    const user = await openForm();
    expect(screen.queryByLabelText("Sang tình trạng")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Kiểu"), "CONDITION");
    expect(screen.getByLabelText("Sang tình trạng")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tăng hay giảm")).toBeNull();
  });

  it("shows the server's message", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: "Nhập lý do điều chỉnh",
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );
    const user = await openForm();
    await user.type(screen.getByLabelText("Số lượng (cái)"), "5");
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nhập lý do điều chỉnh",
    );
    expect(fetch).toHaveBeenCalledOnce();
    fetch.mockRestore();
  });

  it("checks the quantity before sending", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const user = await openForm();
    await user.type(screen.getByLabelText("Số lượng (cái)"), "2,5");
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Số lượng cái phải là số nguyên",
    );
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("shows approve and return to the director only", () => {
    const { rerender } = render(
      <AdjustmentActions
        id="a"
        code="ĐC-2026-004"
        status="PENDING_APPROVAL"
        canAdjust
        canApprove={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Duyệt và ghi sổ" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Trả lại" })).toBeNull();
    rerender(
      <AdjustmentActions
        id="a"
        code="ĐC-2026-004"
        status="PENDING_APPROVAL"
        canAdjust={false}
        canApprove
      />,
    );
    expect(
      screen.getByRole("button", { name: "Duyệt và ghi sổ" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trả lại" })).toBeInTheDocument();
  });
});

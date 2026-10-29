import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AdjustmentDetail } from "@/lib/inventory/adjustments";
import type { StockCard } from "@/lib/inventory/card";

import { AdjustmentCreateMenu } from "./adjustment-create-menu";
import { formatValuePreview } from "./format";
import { StockCardTable } from "./stock-card-table";
import { TripCostSheet } from "./trip-cost-sheet";
import { ValueAdjustmentLines } from "./value-adjustment-lines";
import { ValueAdjustmentSheet } from "./value-adjustment-sheet";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/inventory/adjustments",
  useSearchParams: () => new URLSearchParams(),
}));

const items = [
  {
    id: "k17",
    code: "GG-K17",
    name: "Khung giàn giáo 1,7m",
    unit: "PIECE" as const,
  },
];

const PREVIEW = {
  poolMilli: 1_240_000,
  avgCost: 195_282,
  value: 242_149_680,
  newAvg: 194_072,
  error: null,
};

function json(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ success: status < 400, data, error: null }),
    { status, headers: { "content-type": "application/json" } },
  );
}

describe("value preview text", () => {
  it("writes stock, average, value and the new average", () => {
    expect(formatValuePreview(PREVIEW, "PIECE")).toBe(
      "Tồn 1.240 cái · Giá BQ 195.282 ₫ · Giá trị 242.149.680 ₫ → Giá BQ mới 194.072 ₫",
    );
    expect(
      formatValuePreview(
        { ...PREVIEW, newAvg: null, error: "PK-KU Mới đã hết hàng" },
        "PIECE",
      ),
    ).toBe("PK-KU Mới đã hết hàng");
  });
});

describe("Lập phiếu menu", () => {
  it("offers the four kinds of document", async () => {
    const user = userEvent.setup();
    render(
      <AdjustmentCreateMenu
        items={items}
        places={[{ id: "bai", code: "BAI-01", name: "Bãi chính" }]}
        receipts={[]}
        today="2026-10-29"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Lập phiếu" }));
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      "Điều chỉnh số lượng",
      "Tồn đầu kỳ",
      "Điều chỉnh giá trị",
      "Sửa chi phí chuyến",
    ]);
    await user.click(
      screen.getByRole("menuitem", { name: "Điều chỉnh giá trị" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Lập phiếu điều chỉnh giá trị",
      }),
    ).toBeInTheDocument();
  });
});

describe("value adjustment form", () => {
  it("previews the new average while typing and sends a signed change", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) =>
        String(input).includes("revalue-preview")
          ? json(PREVIEW)
          : json({ id: "new" }, 201),
      );
    const user = userEvent.setup();
    render(<ValueAdjustmentSheet items={items} defaultOpen />);
    await user.type(screen.getByLabelText("Chứng từ bị sửa"), "PN-2026-094");
    await user.type(screen.getByLabelText("Lý do"), "Nhập nhầm đơn giá");
    await user.type(screen.getByLabelText("Chênh lệch (₫)"), "1.500.000");
    expect(
      await screen.findByText(
        "Tồn 1.240 cái · Giá BQ 195.282 ₫ · Giá trị 242.149.680 ₫ → Giá BQ mới 194.072 ₫",
      ),
    ).toBeInTheDocument();
    expect(String(fetch.mock.calls.at(-1)?.[0])).toContain(
      "valueDelta=-1500000",
    );
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    const sent = fetch.mock.calls.find(
      ([url]) => String(url) === "/api/inventory/adjustments",
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toMatchObject({
      kind: "REVALUE",
      relatedDocumentCode: "PN-2026-094",
      lines: [{ itemId: "k17", condition: "GOOD", valueDelta: -1_500_000 }],
    });
    fetch.mockRestore();
  });

  it("shows the recorded trip cost of the chosen receipt", async () => {
    render(
      <TripCostSheet
        receipts={[
          {
            id: "r1",
            code: "PN-2026-094",
            orderCode: "PO-2026-060",
            businessDate: "2026-10-26",
            recordedCost: 35_000_000,
          },
        ]}
        defaultOpen
      />,
    );
    expect(screen.getByLabelText("Phiếu nhập")).toHaveDisplayValue(
      "PN-2026-094 · PO-2026-060 · 26/10/2026",
    );
    expect(screen.getByText("35.000.000 ₫")).toBeInTheDocument();
  });
});

const detail = (
  overrides: Partial<AdjustmentDetail> = {},
): AdjustmentDetail => ({
  id: "a1",
  code: "ĐCG-2026-001",
  kind: "REVALUE",
  status: "PENDING_APPROVAL",
  reason: "Cước xe nhập nhầm",
  relatedDocumentCode: "PN-2026-094",
  openingDate: null,
  lineCount: 2,
  createdByName: "Thu Hà",
  createdAt: new Date("2026-10-29T03:00:00Z"),
  returnedReason: null,
  createdBy: "u1",
  approvedByName: null,
  approvedAt: null,
  submittedAt: null,
  updatedAt: new Date("2026-10-29T03:00:00Z"),
  sourceReceiptId: "r1",
  sourceReceiptCode: "PN-2026-094",
  sourceOrderCode: "PO-2026-060",
  recordedTripCost: 35_000_000,
  correctedTripCost: 3_500_000,
  lines: [
    {
      lineNo: 1,
      lineType: "VALUE",
      itemId: "k17",
      itemCode: "GG-K17",
      itemName: "Khung giàn giáo 1,7m",
      unit: "PIECE",
      condition: "NEW",
      toCondition: null,
      locationId: null,
      locationCode: null,
      locationName: null,
      toLocationId: null,
      toLocationCode: null,
      toLocationName: null,
      quantity: 0,
      unitCost: null,
      valueDelta: -23_403_614,
      preview: {
        poolMilli: 200_000,
        avgCost: 315_020,
        value: 63_004_000,
        newAvg: 198_002,
        error: null,
      },
    },
    {
      lineNo: 2,
      lineType: "VALUE",
      itemId: "ch",
      itemCode: "GG-CH",
      itemName: "Giằng chéo",
      unit: "PIECE",
      condition: "NEW",
      toCondition: null,
      locationId: null,
      locationCode: null,
      locationName: null,
      toLocationId: null,
      toLocationCode: null,
      toLocationName: null,
      quantity: 0,
      unitCost: null,
      valueDelta: -8_096_386,
      preview: {
        poolMilli: 400_000,
        avgCost: 54_490,
        value: 21_796_000,
        newAvg: 34_249,
        error: null,
      },
    },
  ],
  posted: [],
  ...overrides,
});

describe("value adjustment detail", () => {
  it("shows the trip costs, before → after and the total", () => {
    render(<ValueAdjustmentLines adjustment={detail()} />);
    expect(screen.getByRole("link", { name: "PN-2026-094" })).toHaveAttribute(
      "href",
      "/purchasing/orders/PO-2026-060",
    );
    expect(screen.getByText("35.000.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("3.500.000 ₫")).toBeInTheDocument();
    const k17 = screen.getByRole("row", { name: /GG-K17/ });
    expect(within(k17).getByText("−23.403.614 ₫")).toBeInTheDocument();
    expect(within(k17).getByText("315.020 ₫")).toBeInTheDocument();
    expect(within(k17).getByText("198.002 ₫")).toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /Tổng chênh lệch/ })).getByText(
        "−31.500.000 ₫",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Giá BQ sau (dự kiến)" }),
    ).toBeInTheDocument();
  });

  it("shows why a line would be refused now", () => {
    const [first] = detail().lines;
    render(
      <ValueAdjustmentLines
        adjustment={detail({
          lines: [
            {
              ...first!,
              preview: {
                ...first!.preview!,
                newAvg: null,
                error: "GG-K17 Mới đã hết hàng, không điều chỉnh giá trị được",
              },
            },
          ],
        })}
      />,
    );
    expect(
      screen.getByText("GG-K17 Mới đã hết hàng, không điều chỉnh giá trị được"),
    ).toBeInTheDocument();
  });
});

describe("D11 with a value adjustment", () => {
  const card: StockCard = {
    item: {
      id: "k17",
      code: "GG-K17",
      name: "Khung giàn giáo 1,7m",
      unit: "PIECE",
      standardWeightKg: "13.500",
    },
    site: null,
    opening: 1_240_000,
    inflow: 0,
    outflow: 0,
    closing: 1_240_000,
    currentAvg: 194_072,
    openingAvg: 195_282,
    lines: [
      {
        id: 9,
        date: "2026-10-30",
        documentType: "REVALUE",
        documentId: "a1",
        documentCode: "ĐCG-2026-001",
        description: "Giảm giá trị 1.500.000 ₫ · sửa PN-2026-094",
        movement: "REVALUE",
        in: 0,
        out: 0,
        balance: 1_240_000,
        unitCost: null,
        avgAfter: 194_072,
      },
    ],
  };

  it("labels the line and leaves in, out and unit cost empty", () => {
    render(<StockCardTable card={card} from="2026-10-01" priced />);
    const row = screen.getByRole("row", { name: /ĐCG-2026-001/ });
    expect(within(row).getByText("Điều chỉnh giá")).toBeInTheDocument();
    expect(within(row).getByRole("link")).toHaveAttribute(
      "href",
      "/inventory/adjustments/a1",
    );
    const cells = within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells).toEqual([
      "ĐCG-2026-001Điều chỉnh giá",
      "Giảm giá trị 1.500.000 ₫ · sửa PN-2026-094",
      "",
      "",
      "1.240",
      "",
      "194.072 ₫",
    ]);
  });
});

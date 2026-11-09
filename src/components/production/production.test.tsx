// D19, D20 and the list (production-orders tasks 4.2–4.6) with the numbers
// of the drawings.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toMoney } from "@/domain/money";
import type { ProductionStatus } from "@/domain/production-order";
import type {
  BomDetail,
  ProductionDetail,
  ProductionLineDetail,
  ProductionMaterialView,
} from "@/lib/production/queries";

import { BomEditor } from "./bom-editor";
import { orderFigures } from "./figures";
import { ProductionActions } from "./production-actions";
import { ProductionForm } from "./production-form";
import { ProductionList } from "./production-list";
import { ProductionView } from "./production-view";
import { ScrapItemForm } from "./scrap-item-form";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    Response.json({ success: true, data: { code: "X" }, error: null }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const K = 1000;
const m = toMoney;

const material = (
  code: string,
  name: string,
  normPerUnit: number,
  expected: number,
  quantity: number,
  price: number,
  over: Partial<ProductionMaterialView> = {},
): ProductionMaterialView => ({
  rowId: `row-${code}`,
  itemId: code,
  code,
  name,
  unit: "KG",
  standardWeightKg: null,
  normPerUnitMilli: normPerUnit,
  expectedMilli: expected * K,
  reportedMilli: quantity * K,
  quantityMilli: quantity * K,
  amount: null,
  newAvg: m(price),
  goodAvg: null,
  ...over,
});

const frame: ProductionLineDetail = {
  lineId: "k17",
  itemId: "GG-K17",
  code: "GG-K17",
  name: "Khung giàn giáo 1,7m",
  unit: "PIECE",
  plannedMilli: 100 * K,
  reportedFinishedMilli: 102 * K,
  reportedOffcutMilli: 38 * K,
  finishedMilli: 100 * K,
  offcutMilli: 38 * K,
  laborRate: m(35_000),
  laborAmount: null,
  materialAmount: null,
  offcutAmount: null,
  finishedAmount: null,
  missingBom: false,
  materials: [
    material("VT-ONG42", "Ống thép D42", 9800, 980, 1012, 19_500),
    material("VT-ONG27", "Ống thép D27", 3600, 360, 391, 19_000),
    material("VT-QH", "Que hàn", 120, 12, 12.5, 45_000),
    material("VT-SON", "Sơn chống gỉ", 80, 8, 8, 90_000, { unit: "LITER" }),
    material("VT-CHOT", "Chốt khóa khung", 4000, 400, 400, 2_500, {
      unit: "PIECE",
    }),
  ],
};

const brace: ProductionLineDetail = {
  ...frame,
  lineId: "ch",
  itemId: "GG-CH",
  code: "GG-CH",
  name: "Chéo giàn giáo 1,7m",
  plannedMilli: 200 * K,
  reportedFinishedMilli: 200 * K,
  reportedOffcutMilli: 9 * K,
  finishedMilli: 200 * K,
  offcutMilli: 9 * K,
  laborRate: m(8_000),
  materials: [
    material("VT-ONG27", "Ống thép D27", 2900, 580, 586, 19_000),
    material("VT-SON", "Sơn chống gỉ", 30, 6, 6, 90_000, { unit: "LITER" }),
  ],
};

const step = (by: string | null, at: string | null) => ({
  by,
  at: at ? new Date(at) : null,
});

const detail = (over: Partial<ProductionDetail> = {}): ProductionDetail => ({
  code: "LSX-2026-004",
  status: "AWAITING_APPROVAL",
  updatedAt: new Date("2026-11-08T10:00:00Z"),
  team: "tổ anh Lực",
  note: null,
  workshop: { id: "x", code: "XUONG-01", name: "Xưởng" },
  to: { id: "b", code: "BAI-01", name: "Bãi" },
  steps: {
    created: step("Thu Hà", "2026-11-03T02:00:00Z"),
    assigned: step("Thu Hà", "2026-11-03T03:00:00Z"),
    received: step("Hoàng Nam", "2026-11-04T02:00:00Z"),
    reported: step("Hoàng Nam", "2026-11-08T02:00:00Z"),
    counted: step("Anh Hải", "2026-11-08T05:00:00Z"),
    approved: step(null, null),
    returned: step(null, null),
    posted: step(null, null),
    cancelled: step(null, null),
  },
  approveNote: null,
  returnNote: null,
  cancelReason: null,
  scrapPricePerKg: m(7_500),
  scrapItemId: "sv",
  scrapItemCode: "PL-SATVUN",
  lines: [frame, brace],
  stock: ["VT-ONG42", "VT-ONG27", "VT-QH", "VT-SON", "VT-CHOT"].map(
    (itemId) => ({ itemId, newMilli: 5_000 * K, goodMilli: 0 }),
  ),
  ...over,
});

describe("orderFigures", () => {
  it("previews the D20 example like posting would", () => {
    const figures = orderFigures(detail());
    expect(figures.provisional).toBe(true);
    expect(figures.lines[0]?.finishedAmount).toBe(32_660_500);
    expect(figures.lines[0]?.unitCost).toBe(326_605);
    expect(figures.lines[1]?.finishedAmount).toBe(13_206_500);
    expect(figures.lines[1]?.unitCost).toBe(66_033);
    expect(figures.totals).toMatchObject({
      material: 41_119_500,
      labor: 5_100_000,
      offcut: 352_500,
      finished: 45_867_000,
      overuse: 1_349_500,
    });
  });

  it("reads a posted order from what was fixed, not from today's prices", () => {
    const posted = detail({
      status: "POSTED",
      lines: [
        {
          ...frame,
          laborAmount: m(3_500_000),
          materialAmount: m(29_445_500),
          offcutAmount: m(285_000),
          finishedAmount: m(32_660_500),
          materials: frame.materials.map((row) => ({
            ...row,
            newAvg: m(99_999),
            amount: m(row.code === "VT-ONG42" ? 19_734_000 : 1),
          })),
        },
      ],
    });
    const figures = orderFigures(posted);
    expect(figures.provisional).toBe(false);
    expect(figures.lines[0]?.finishedAmount).toBe(32_660_500);
    expect(figures.lines[0]?.materials[0]?.amount).toBe(19_734_000);
  });
});

describe("ProductionView (D20)", () => {
  it("shows progress, the overuse warning and the figures", () => {
    render(<ProductionView detail={detail()} />);
    expect(
      screen.getByRole("heading", { name: "Lệnh sản xuất LSX-2026-004" }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("list", { name: "Tiến trình lệnh" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(7);
    expect(screen.getByText(/Vượt định mức quá 5 %:/)).toBeInTheDocument();
    expect(
      screen.getByText(/dùng 391 kg so với 360 kg \(\+ 8,6 %\)/),
    ).toBeTruthy();
    const section = screen.getByRole("region", {
      name: "Khung giàn giáo 1,7m",
    });
    expect(within(section).getByText("100 cái (xưởng báo 102)")).toBeTruthy();
    expect(within(section).getByText("32.660.500 ₫")).toBeTruthy();
    expect(within(section).getByText("326.605 ₫")).toBeTruthy();
    expect(
      within(section).getByText("100 × 35.000 ₫ = 3.500.000 ₫"),
    ).toBeTruthy();
    const brackets = screen.getByRole("region", {
      name: "Chéo giàn giáo 1,7m",
    });
    expect(within(brackets).getByText("66.033 ₫")).toBeTruthy();
    expect(screen.getAllByText("45.867.000 ₫").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1.349.500 ₫").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: /Giá trị thành phẩm \(tạm tính\)/ }),
    ).toBeInTheDocument();
  });

  it("colours the over-limit row and leaves 5,0 % alone", () => {
    render(<ProductionView detail={detail()} />);
    const over = screen.getByText("+ 8,6 %");
    expect(over.className).toContain("text-warning");
    expect(screen.getByText("+ 3,3 %").className).not.toContain("text-warning");
  });

  it("drops the tạm tính label once posted", () => {
    render(
      <ProductionView
        detail={detail({
          status: "POSTED",
          steps: {
            ...detail().steps,
            posted: step("Thu Hà", "2026-11-09T03:00:00Z"),
          },
          lines: [{ ...frame, finishedAmount: m(32_660_500) }],
        })}
      />,
    );
    expect(screen.queryByText(/tạm tính/)).toBeNull();
    expect(screen.queryByText("Khi ghi sổ")).toBeNull();
  });

  it("names the return note while the workshop fixes the numbers", () => {
    render(
      <ProductionView
        detail={detail({
          status: "IN_PROGRESS",
          returnNote: "Đếm lại ống D27",
        })}
      />,
    );
    expect(screen.getByText("Văn phòng trả lại: Đếm lại ống D27")).toBeTruthy();
    expect(screen.getAllByText(/Xưởng đang làm\./).length).toBeGreaterThan(0);
  });
});

describe("ProductionActions (buttons by role and status)", () => {
  const renderActions = (
    status: ProductionStatus,
    role: { canManage: boolean; canApprove: boolean },
  ) =>
    render(
      <ProductionActions
        code="LSX-2026-004"
        status={status}
        updatedAt="2026-11-08T10:00:00.000Z"
        {...role}
      />,
    );
  const director = { canManage: true, canApprove: true };
  const accountant = { canManage: true, canApprove: false };
  const sales = { canManage: false, canApprove: false };

  it("shows nothing to Kinh doanh", () => {
    const { container } = renderActions("AWAITING_APPROVAL", sales);
    expect(container).toBeEmptyDOMElement();
  });

  it("lets the director approve and the accountant only return", () => {
    const { unmount } = renderActions("AWAITING_APPROVAL", director);
    expect(
      screen.getByRole("button", { name: "Duyệt vượt định mức" }),
    ).toBeTruthy();
    unmount();
    renderActions("AWAITING_APPROVAL", accountant);
    expect(
      screen.queryByRole("button", { name: "Duyệt vượt định mức" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Ghi sổ" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Trả lại xưởng sửa số" }),
    ).toBeTruthy();
  });

  it("offers Ghi sổ on a counted order and sends the note on approval", async () => {
    const user = userEvent.setup();
    const { unmount } = renderActions("COUNTED", accountant);
    expect(screen.getByRole("button", { name: "Ghi sổ" })).toBeTruthy();
    unmount();
    renderActions("AWAITING_APPROVAL", director);
    await user.type(screen.getByLabelText("Ghi chú duyệt"), "Chấp nhận");
    await user.click(
      screen.getByRole("button", { name: "Duyệt vượt định mức" }),
    );
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/production/orders/LSX-2026-004/approve");
    expect(JSON.parse(String(init?.body))).toMatchObject({ note: "Chấp nhận" });
  });

  it("offers recall only before the workshop takes it", () => {
    const { unmount } = renderActions("ASSIGNED", accountant);
    expect(screen.getByRole("button", { name: "Thu hồi lệnh" })).toBeTruthy();
    unmount();
    renderActions("IN_PROGRESS", accountant);
    expect(screen.queryByRole("button", { name: "Thu hồi lệnh" })).toBeNull();
    expect(screen.getByRole("button", { name: "Hủy lệnh" })).toBeTruthy();
  });

  it("has no buttons on a posted order", () => {
    const { container } = renderActions("POSTED", director);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ProductionList", () => {
  it("lists orders and hides the new button without manage", () => {
    render(
      <ProductionList
        status={undefined}
        canManage={false}
        rows={[
          {
            code: "LSX-2026-004",
            status: "COUNTED",
            team: "tổ anh Lực",
            workshopCode: "XUONG-01",
            toCode: "BAI-01",
            planned: [{ unit: "PIECE", milli: 300 * K }],
            products: ["GG-K17", "GG-CH"],
            createdAt: new Date("2026-11-03T02:00:00Z"),
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "LSX-2026-004" })).toBeTruthy();
    expect(screen.getByText("XUONG-01 → BAI-01")).toBeTruthy();
    expect(screen.getByText("300 cái")).toBeTruthy();
    expect(screen.getAllByText("Chờ ghi sổ").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Lệnh mới" })).toBeNull();
  });
});

describe("ProductionForm", () => {
  it("shows the expected materials for the planned quantity", async () => {
    const user = userEvent.setup();
    render(
      <ProductionForm
        places={[
          { id: "x", code: "XUONG-01", name: "Xưởng", type: "WORKSHOP" },
          { id: "b", code: "BAI-01", name: "Bãi", type: "YARD" },
        ]}
        items={[{ itemId: "k", code: "GG-K17", name: "Khung", unit: "PIECE" }]}
        norms={{
          k: [
            {
              itemId: "o",
              code: "VT-ONG42",
              name: "Ống",
              unit: "KG",
              perUnitMilli: 9800,
            },
          ],
        }}
      />,
    );
    await user.type(screen.getByLabelText("Số kế hoạch"), "100");
    expect(screen.getByText("VT-ONG42 980 kg")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/production/orders");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      workshopId: "x",
      toLocationId: "b",
      lines: [{ itemId: "k", quantity: "100" }],
    });
  });
});

const bom: BomDetail = {
  itemId: "k",
  code: "GG-K17",
  name: "Khung giàn giáo 1,7m",
  unit: "PIECE",
  laborRate: m(35_000),
  note: null,
  updatedAt: new Date("2026-11-01T00:00:00Z"),
  materials: [
    ["VT-ONG42", "Ống D42", "KG", 9800, 19_500],
    ["VT-ONG27", "Ống D27", "KG", 3600, 19_000],
    ["VT-QH", "Que hàn", "KG", 120, 45_000],
    ["VT-SON", "Sơn", "LITER", 80, 90_000],
    ["VT-CHOT", "Chốt", "PIECE", 4000, 2_500],
  ].map(([code, name, unit, perUnit, price]) => ({
    itemId: String(code),
    code: String(code),
    name: String(name),
    unit: unit as "KG",
    perUnitMilli: Number(perUnit),
    newAvg: m(Number(price)),
    goodAvg: null,
  })),
};

describe("BomEditor (D19)", () => {
  const list = [
    { itemId: "k", code: "GG-K17", name: "Khung", materialCount: 5 },
  ];

  it("gives the estimate of the drawing", () => {
    render(
      <BomEditor
        rows={list}
        bom={bom}
        creating={null}
        candidates={[]}
        materials={[]}
        canManage
      />,
    );
    expect(screen.getByText("GG-K17 · 5 nguyên liệu")).toBeTruthy();
    expect(screen.getByText("191.100 ₫")).toBeTruthy();
    expect(screen.getByText("282.100 ₫")).toBeTruthy();
    expect(screen.getByText("317.100 ₫")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lưu định mức" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "+ Thêm định mức" }),
    ).toBeTruthy();
  });

  it("shows chưa đủ giá when a material has no price", () => {
    render(
      <BomEditor
        rows={list}
        bom={{
          ...bom,
          materials: bom.materials.map((row) =>
            row.code === "VT-CHOT" ? { ...row, newAvg: null } : row,
          ),
        }}
        creating={null}
        candidates={[]}
        materials={[]}
        canManage
      />,
    );
    expect(screen.getAllByText("chưa đủ giá").length).toBeGreaterThan(0);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("is read-only for Kinh doanh", () => {
    render(
      <BomEditor
        rows={list}
        bom={bom}
        creating={null}
        candidates={[]}
        materials={[]}
        canManage={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Lưu định mức" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Thêm định mức/ })).toBeNull();
    expect(screen.queryByLabelText("Định mức VT-ONG42")).toBeNull();
    expect(screen.getByText("9,8")).toBeTruthy();
  });

  it("sends the updatedAt when editing", async () => {
    const user = userEvent.setup();
    render(
      <BomEditor
        rows={list}
        bom={bom}
        creating={null}
        candidates={[]}
        materials={[]}
        canManage
      />,
    );
    await user.click(screen.getByRole("button", { name: "Lưu định mức" }));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/production/boms/GG-K17");
    const body = JSON.parse(String(init?.body));
    expect(body.updatedAt).toBe("2026-11-01T00:00:00.000Z");
    expect(body.laborRate).toBe(35_000);
    expect(body.materials[0]).toEqual({
      itemId: "VT-ONG42",
      quantity: "9.800",
    });
  });
});

describe("ScrapItemForm", () => {
  it("shows the current item and saves another", async () => {
    const user = userEvent.setup();
    render(
      <ScrapItemForm
        current={{ itemId: "sv", code: "PL-SATVUN", name: "Sắt vụn" }}
        choices={[
          { itemId: "sv", code: "PL-SATVUN", name: "Sắt vụn", unit: "KG" },
          { itemId: "qh", code: "VT-QH", name: "Que hàn", unit: "KG" },
        ]}
      />,
    );
    expect(screen.getByText("Mã sắt vụn: PL-SATVUN")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Chọn mã"), "qh");
    await user.click(screen.getByRole("button", { name: "Lưu mã sắt vụn" }));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/production/settings");
    expect(JSON.parse(String(init?.body))).toEqual({ itemId: "qh" });
  });
});

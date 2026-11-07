// D12 of a work order (repair-work-orders tasks 7.2, 7.3; spec "Màn D12
// lệnh sửa chữa") with the numbers of the D12 drawing.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { toMoney } from "@/domain/money";
import type { WorkLine, WorkOrderDetail } from "@/lib/repairs/work-queries";

import { WorkOrderActions } from "./work-order-actions";
import { WorkOrderView } from "./work-order-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const K = 1000;
const m = toMoney;
const step = (by: string | null, at: string | null) => ({
  by,
  at: at ? new Date(at) : null,
});

const line = (overrides: Partial<WorkLine>): WorkLine => ({
  itemId: "k17",
  code: "GG-K17",
  name: "Khung giàn giáo 1,7m",
  unit: "PIECE",
  standardWeightKg: "13.500",
  takenMilli: 40 * K,
  goodMilli: 36 * K,
  scrapMilli: 4 * K,
  reportedGoodMilli: 36 * K,
  reportedScrapMilli: 4 * K,
  laborRate: m(40_000),
  materials: [
    {
      itemId: "qh",
      code: "VT-QH",
      name: "Que hàn",
      unit: "KG",
      quantityMilli: 6 * K,
      amount: null,
    },
    {
      itemId: "son",
      code: "VT-SON",
      name: "Sơn chống gỉ",
      unit: "LITER",
      quantityMilli: 3 * K,
      amount: null,
    },
  ],
  laborAmount: null,
  materialAmount: m(0),
  repairCost: m(0),
  lossAmount: null,
  postedGood: null,
  postedScrap: null,
  postedNeedsRepairCost: null,
  ...overrides,
});

const D12: WorkOrderDetail = {
  code: "PSC-2026-031",
  status: "COUNTED",
  updatedAt: new Date("2026-11-06T09:00:00Z"),
  repairedBy: "tổ anh Lực",
  note: null,
  from: { id: "bai", code: "BAI-01", name: "Bãi chính", type: "YARD" },
  workshop: { id: "xuong", code: "XUONG-01", name: "Xưởng" },
  steps: {
    created: step("Thu Hà", "2026-11-02T02:00:00Z"),
    assigned: step("Thu Hà", "2026-11-02T03:00:00Z"),
    received: step("Hoàng Nam", "2026-11-03T02:00:00Z"),
    reported: step("Hoàng Nam", "2026-11-06T02:00:00Z"),
    counted: step("Anh Hải", "2026-11-06T04:00:00Z"),
    posted: step(null, null),
    cancelled: step(null, null),
  },
  returnNote: null,
  cancelReason: null,
  scrapPriceUsed: null,
  confirmedNote: null,
  lines: [
    line({}),
    line({
      itemId: "cheo",
      code: "CHEO-1,7",
      name: "Chéo giàn giáo 1,7m",
      standardWeightKg: "2.000",
      takenMilli: 20 * K,
      goodMilli: 20 * K,
      scrapMilli: 0,
      reportedGoodMilli: 20 * K,
      reportedScrapMilli: 0,
      laborRate: m(10_000),
      materials: [
        {
          itemId: "son",
          code: "VT-SON",
          name: "Sơn chống gỉ",
          unit: "LITER",
          quantityMilli: 500,
          amount: null,
        },
      ],
    }),
  ],
  averages: {
    "k17|NEEDS_REPAIR": m(160_000),
    "cheo|NEEDS_REPAIR": m(30_000),
    "qh|NEW": m(45_000),
    "son|NEW": m(90_000),
  },
  supplies: [
    {
      itemId: "qh",
      code: "VT-QH",
      name: "Que hàn",
      unit: "KG",
      newMilli: 18 * K,
      goodMilli: 0,
      newAvg: m(45_000),
      goodAvg: null,
    },
    {
      itemId: "son",
      code: "VT-SON",
      name: "Sơn chống gỉ",
      unit: "LITER",
      newMilli: 12 * K,
      goodMilli: 0,
      newAvg: m(90_000),
      goodAvg: null,
    },
  ],
  scrapPricePerKg: m(7_500),
};

describe("WorkOrderView (spec: lệnh chờ ghi sổ như D12)", () => {
  it("shows labour, supplies and the price into Good", () => {
    render(<WorkOrderView detail={D12} />);
    expect(screen.getByText("Chờ ghi sổ")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(
      within(table).getByText("Công khoán: 36 × 40.000 ₫ = 1.440.000 ₫"),
    ).toBeInTheDocument();
    expect(
      within(table).getByText(
        /Que hàn \(VT-QH\) 6 kg × 45\.000 ₫ = 270\.000 ₫/,
      ),
    ).toBeInTheDocument();
    expect(
      within(table).getByText("Công 1.640.000 ₫ · vật tư 585.000 ₫"),
    ).toBeInTheDocument();
    expect(within(table).getAllByText("2.225.000 ₫").length).toBeGreaterThan(0);
    const good = screen.getByRole("region", { name: "Giá vốn khi vào Tốt" });
    expect(within(good).getByText("221.528 ₫")).toBeInTheDocument();
    expect(within(good).getByText("42.250 ₫")).toBeInTheDocument();
    expect(within(good).getByText("7.975.000 ₫")).toBeInTheDocument();
  });

  it("says what the posting will write", () => {
    render(<WorkOrderView detail={D12} />);
    const posting = screen.getByRole("region", { name: "Khi ghi sổ" });
    expect(posting).toHaveTextContent(
      "Xuất 60 cái Chờ sửa ở XUONG-01 (đã chuyển từ BAI-01 lúc xưởng nhận lệnh).",
    );
    expect(posting).toHaveTextContent(
      "Nhập 56 cái Tốt, 4 cái Phế liệu ở BAI-01.",
    );
    expect(posting).toHaveTextContent(
      "Xuất vật tư: 6 kg que hàn, 3,5 lít sơn chống gỉ theo giá BQ.",
    );
  });

  it("shows the workshop's numbers next to a different count", () => {
    const counted = {
      ...D12,
      lines: [
        line({ goodMilli: 35 * K, scrapMilli: 5 * K }),
        ...D12.lines.slice(1),
      ],
    };
    render(<WorkOrderView detail={counted} />);
    expect(
      screen.getByText("Xưởng báo 36 sửa xong, 4 phế"),
    ).toBeInTheDocument();
  });

  it("hides the numbers while the workshop works", () => {
    render(<WorkOrderView detail={{ ...D12, status: "IN_PROGRESS" }} />);
    expect(screen.getAllByText(/Xưởng đang sửa/).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("region", { name: "Giá vốn khi vào Tốt" }),
    ).toBeNull();
  });
});

describe("WorkOrderActions (spec: nút theo trạng thái)", () => {
  const actions = (status: WorkOrderDetail["status"]) =>
    render(
      <WorkOrderActions
        code="PSC-2026-031"
        status={status}
        updatedAt="x"
        lineCodes={["GG-K17"]}
      />,
    );

  it("offers posting and returning once counted", () => {
    actions("COUNTED");
    expect(
      screen.getByRole("button", { name: "Ghi sổ kho" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Trả lại xưởng sửa số" }),
    ).toBeInTheDocument();
  });

  it("offers no posting while the workshop works, but cancelling", () => {
    actions("IN_PROGRESS");
    expect(screen.queryByRole("button", { name: "Ghi sổ kho" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Hủy lệnh" }),
    ).toBeInTheDocument();
  });

  it("offers recalling an assigned order", () => {
    actions("ASSIGNED");
    expect(
      screen.getByRole("button", { name: "Thu hồi lệnh" }),
    ).toBeInTheDocument();
  });
});

describe("WorkOrderForm (spec: lệnh nháp)", () => {
  it("lets the office pick workshop, source and lines, then assign", async () => {
    const { WorkOrderForm } = await import("./work-order-form");
    const { default: userEvent } = await import("@testing-library/user-event");
    render(
      <WorkOrderForm
        places={[
          { id: "bai", code: "BAI-01", name: "Bãi chính", type: "YARD" },
          { id: "xuong", code: "XUONG-01", name: "Xưởng", type: "WORKSHOP" },
        ]}
        awaiting={[
          {
            itemId: "k17",
            itemCode: "GG-K17",
            itemName: "Khung giàn giáo 1,7m",
            unit: "PIECE",
            standardWeightKg: "13.500",
            onHandMilli: 201 * K,
            needsRepairAvg: m(160_000),
            goodPoolMilli: 0,
            goodAvg: null,
            scrapPoolMilli: 0,
            scrapAvg: null,
          },
        ]}
      />,
    );
    expect(screen.getByLabelText("Xưởng")).toHaveValue("xuong");
    expect(screen.getByLabelText("Lấy hàng Chờ sửa tại")).toHaveValue("bai");
    expect(screen.getByRole("button", { name: "Giao xưởng" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /GG-K17/ }));
    expect(screen.getByLabelText("Lấy ra")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Giao xưởng" })).toBeEnabled();
  });
});

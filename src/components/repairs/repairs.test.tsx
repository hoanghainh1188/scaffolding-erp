// D12 and the repair list (simple-repair tasks 6.1-6.4), with the numbers of
// the spec: GG-K17 B 160.000 ₫, Tốt 1.120 cái 195.861 ₫, sắt vụn 7.500 ₫/kg.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toMoney } from "@/domain/money";
import { REPAIR_MESSAGES, sumMismatchText } from "@/domain/repair-order";
import type {
  AwaitingItem,
  AwaitingRepair,
  RepairDetail,
  RepairPlace,
  RepairSummary,
} from "@/lib/repairs/queries";

import { CostBlock } from "./cost-block";
import { previewLine } from "./preview";
import { RepairForm, type EditedSlip } from "./repair-form";
import { RepairList } from "./repair-list";
import { RepairView } from "./repair-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push }),
  usePathname: () => "/repairs",
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const K = 1000;
const m = toMoney;

const K17: AwaitingItem = {
  itemId: "k17",
  itemCode: "GG-K17",
  itemName: "Khung giàn giáo 1,7m",
  unit: "PIECE",
  standardWeightKg: "13.500",
  onHandMilli: 201 * K,
  needsRepairAvg: m(160_000),
  goodPoolMilli: 1_120 * K,
  goodAvg: m(195_861),
  scrapPoolMilli: 42 * K,
  scrapAvg: m(150_000),
};
const CH: AwaitingItem = {
  itemId: "ch",
  itemCode: "GG-CH",
  itemName: "Chéo giàn giáo",
  unit: "PIECE",
  standardWeightKg: "2.800",
  onHandMilli: 63 * K,
  needsRepairAvg: m(30_000),
  goodPoolMilli: 2_000 * K,
  goodAvg: m(38_500),
  scrapPoolMilli: 0,
  scrapAvg: null,
};
const M16: AwaitingItem = {
  itemId: "m16",
  itemCode: "GG-M16",
  itemName: "Mâm giàn giáo 1,6m",
  unit: "PIECE",
  standardWeightKg: "12.000",
  onHandMilli: 9 * K,
  needsRepairAvg: m(210_000),
  goodPoolMilli: 0,
  goodAvg: null,
  scrapPoolMilli: 0,
  scrapAvg: null,
};
const AWAITING: AwaitingRepair = {
  items: [CH, K17, M16],
  scrapPricePerKg: m(7_500),
};
const PLACES: RepairPlace[] = [
  { id: "bai", code: "BAI-01", name: "Bãi chính", type: "YARD" },
  { id: "xuong", code: "XUONG-01", name: "Xưởng", type: "WORKSHOP" },
];

const D12: EditedSlip = {
  code: "PSC-2026-024",
  updatedAt: "2026-10-28T03:00:00.000Z",
  repairDate: "2026-10-28",
  repairedBy: "Tổ anh Hoàng Nam",
  note: null,
  fromLocationId: "bai",
  toLocationId: "bai",
  lines: [
    {
      itemId: "k17",
      takenMilli: 40 * K,
      goodMilli: 36 * K,
      scrapMilli: 4 * K,
      repairCost: 1_980_000,
    },
    {
      itemId: "ch",
      takenMilli: 20 * K,
      goodMilli: 20 * K,
      scrapMilli: 0,
      repairCost: 240_000,
    },
  ],
};

function renderForm(slip?: EditedSlip) {
  return render(
    <RepairForm
      places={PLACES}
      today="2026-10-28"
      defaultLocationId="bai"
      awaiting={AWAITING}
      slip={slip}
    />,
  );
}

function answer(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("RepairList", () => {
  const row: RepairSummary = {
    code: "PSC-2026-024",
    status: "DRAFT",
    repairDate: "2026-10-28",
    fromCode: "BAI-01",
    fromName: "Bãi chính",
    toCode: "BAI-01",
    toName: "Bãi chính",
    lineCount: 2,
    goodMilli: 56 * K,
    scrapMilli: 4 * K,
    cost: m(2_220_000),
    loss: m(0),
    createdAt: new Date("2026-10-28T03:00:00Z"),
  };

  it("lists slips with totals and offers a new one to managers", () => {
    render(<RepairList rows={[row]} status={undefined} canManage />);
    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("link", { name: "PSC-2026-024" }),
    ).toHaveAttribute("href", "/repairs/PSC-2026-024");
    expect(within(table).getByText("2.220.000 ₫")).toBeInTheDocument();
    expect(within(table).getByText("Nháp")).toBeInTheDocument();
    expect(within(table).getByText("28/10/2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Phiếu mới" })).toHaveAttribute(
      "href",
      "/repairs/new",
    );
  });

  it("keeps the filter in the URL and hides Phiếu mới from readers", () => {
    render(<RepairList rows={[]} status="POSTED" canManage={false} />);
    expect(screen.getByText("Chưa có phiếu sửa chữa")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Phiếu mới" })).toBeNull();
    expect(screen.getByRole("link", { name: "Đã ghi sổ" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Nháp" })).toHaveAttribute(
      "href",
      "/repairs?status=draft",
    );
  });
});

describe("Giá vốn sau sửa", () => {
  it("shows the D12 block with the damage carried by repaired pieces", () => {
    const preview = previewLine(
      {
        itemCode: "GG-K17",
        itemName: "Khung giàn giáo 1,7m",
        unit: "PIECE",
        goodMilli: 36 * K,
        scrapMilli: 4 * K,
        repairCost: 1_980_000,
      },
      K17,
      m(7_500),
    );
    if (!preview.ok) throw new Error(preview.reason);
    render(<CostBlock figures={preview.figures} />);
    const block = screen.getByRole("article");
    for (const text of [
      "Giá vốn Chờ sửa",
      "160.000 ₫",
      "+ Chi phí sửa (1.980.000 ₫ ÷ 36)",
      "55.000 ₫",
      "+ Phần hỏng gánh thêm (235.000 ₫ ÷ 36)",
      "6.528 ₫",
      "= Giá vốn khi vào Tốt",
      "221.528 ₫",
      "196.660 ₫",
      "4 cái hỏng hẳn vào Phế liệu theo giá sắt vụn 405.000 ₫ (54 kg × 7.500 ₫)",
    ]) {
      expect(within(block).getByText(text)).toBeInTheDocument();
    }
    expect(
      within(block).getByText(/Giá vốn BQ Tốt: 195\.861 ₫ →/),
    ).toBeInTheDocument();
  });

  it("shows the loss when nothing is repaired", () => {
    const preview = previewLine(
      {
        itemCode: "GG-M16",
        itemName: "Mâm giàn giáo 1,6m",
        unit: "PIECE",
        goodMilli: 0,
        scrapMilli: 5 * K,
        repairCost: 0,
      },
      M16,
      m(7_500),
    );
    if (!preview.ok) throw new Error(preview.reason);
    render(<CostBlock figures={preview.figures} />);
    expect(
      screen.getByText(
        "5 cái hỏng hẳn vào Phế liệu theo giá sắt vụn 450.000 ₫ (60 kg × 7.500 ₫)",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Lỗ hỏng hàng: 600.000 ₫")).toBeInTheDocument();
  });

  it("says when there is no scrap or no scrap price", () => {
    const noScrap = previewLine(
      {
        itemCode: "GG-CH",
        itemName: "Chéo giàn giáo",
        unit: "PIECE",
        goodMilli: 20 * K,
        scrapMilli: 0,
        repairCost: 240_000,
      },
      CH,
      null,
    );
    if (!noScrap.ok) throw new Error(noScrap.reason);
    render(<CostBlock figures={noScrap.figures} />);
    expect(screen.getByText("Không có phế liệu.")).toBeInTheDocument();
    expect(screen.getByText("42.000 ₫")).toBeInTheDocument();
    expect(
      previewLine(
        {
          itemCode: "GG-K17",
          itemName: "Khung",
          unit: "PIECE",
          goodMilli: 36 * K,
          scrapMilli: 4 * K,
          repairCost: 0,
        },
        K17,
        null,
      ),
    ).toEqual({
      ok: false,
      reason: REPAIR_MESSAGES.noScrapPrice,
    });
  });
});

describe("RepairForm", () => {
  it("adds up the D12 slip and shows the header totals", () => {
    renderForm(D12);
    const summary = screen.getByRole("region", { name: "Tổng chi phí sửa" });
    expect(within(summary).getByText("2.220.000 ₫")).toBeInTheDocument();
    expect(
      within(summary).getByText("56 cái về Tốt · 4 cái thành phế liệu"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Chi phí sửa GG-K17")).toHaveValue(
      "1.980.000",
    );
    expect(
      screen.getByText("Sổ kho ghi theo ngày ghi sổ."),
    ).toBeInTheDocument();
    expect(screen.getByText("đang chờ sửa 201 cái")).toBeInTheDocument();
  });

  it("adds a line from the waiting list once and fills Sửa xong", async () => {
    const user = userEvent.setup();
    renderForm();
    const add = screen.getByRole("button", {
      name: /^Thêm\s*Mâm giàn giáo 1,6m/,
    });
    await user.click(add);
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText("Lấy ra sửa GG-M16"), "5");
    await user.clear(screen.getByLabelText("Hỏng hẳn GG-M16"));
    await user.type(screen.getByLabelText("Hỏng hẳn GG-M16"), "2");
    expect(screen.getByLabelText("Sửa xong GG-M16")).toHaveValue("3");
  });

  it("shows a broken row under it and locks Ghi sổ kho", async () => {
    const user = userEvent.setup();
    renderForm(D12);
    const good = screen.getByLabelText("Sửa xong GG-K17");
    await user.clear(good);
    await user.type(good, "30");
    const expectedMismatch = sumMismatchText(34 * K, 40 * K);
    expect(
      screen.getByText(
        expectedMismatch.charAt(0).toUpperCase() + expectedMismatch.slice(1),
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ghi sổ kho" })).toBeDisabled();
  });

  it("saves the draft with the updatedAt it was opened with", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      answer(200, {
        success: true,
        data: { code: "PSC-2026-024", updatedAt: "2026-10-28T04:00:00.000Z" },
        error: null,
      }),
    );
    renderForm(D12);
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/repairs/PSC-2026-024?saved=draft"),
    );
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/repairs/PSC-2026-024");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      updatedAt: D12.updatedAt,
      fromLocationId: "bai",
      lines: [
        {
          itemId: "k17",
          quantityTaken: "40.000",
          quantityGood: "36.000",
          quantityScrap: "4.000",
          repairCost: 1_980_000,
        },
        { itemId: "ch", repairCost: 240_000 },
      ],
    });
  });

  it("asks before a high cost: Sửa lại goes back, Đúng posts with the key", async () => {
    const user = userEvent.setup();
    renderForm({
      ...D12,
      lines: [
        {
          itemId: "k17",
          takenMilli: 20 * K,
          goodMilli: 20 * K,
          scrapMilli: 0,
          repairCost: 6_000_000,
        },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Ghi sổ kho" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(
        "GG-K17: chi phí sửa 300.000 ₫/cái, cao hơn giá vốn Tốt 195.861 ₫. Đúng không?",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Sửa lại" }));
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock
      .mockResolvedValueOnce(
        answer(200, {
          success: true,
          data: { code: "PSC-2026-024", updatedAt: "2026-10-28T04:00:00.000Z" },
          error: null,
        }),
      )
      .mockResolvedValueOnce(
        answer(200, {
          success: true,
          data: { code: "PSC-2026-024", postingId: "x" },
          error: null,
        }),
      );
    await user.click(screen.getByRole("button", { name: "Ghi sổ kho" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Đúng, ghi sổ",
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/repairs/PSC-2026-024"),
    );
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("/api/repairs/PSC-2026-024/post");
    expect(JSON.parse(String(init?.body))).toEqual({
      confirmedOverrides: ["line:GG-K17"],
      updatedAt: "2026-10-28T04:00:00.000Z",
    });
  });

  it("offers to reload when someone else saved the slip", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      answer(409, {
        success: false,
        data: null,
        error: "Phiếu vừa được người khác sửa, tải lại trang",
      }),
    );
    renderForm(D12);
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    expect(
      await screen.findByText("Phiếu vừa được người khác sửa, tải lại trang"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tải lại trang" }),
    ).toBeInTheDocument();
  });
});

describe("RepairView", () => {
  const posted: RepairDetail = {
    id: "id",
    code: "PSC-2026-024",
    status: "POSTED",
    repairDate: "2026-10-28",
    repairedBy: "Tổ anh Hoàng Nam",
    note: null,
    fromLocationId: "bai",
    fromCode: "BAI-01",
    fromName: "Bãi chính",
    toLocationId: "bai",
    toCode: "BAI-01",
    toName: "Bãi chính",
    scrapPriceUsed: m(7_500),
    confirmedNote: null,
    createdByName: "Thu Hà",
    createdAt: new Date("2026-10-28T03:00:00Z"),
    updatedAt: new Date("2026-10-28T03:00:00Z"),
    postedByName: "Thu Hà",
    postedAt: new Date("2026-10-28T04:15:00Z"),
    lines: [
      {
        itemId: "k17",
        itemCode: "GG-K17",
        itemName: "Khung giàn giáo 1,7m",
        unit: "PIECE",
        standardWeightKg: "13.500",
        takenMilli: 40 * K,
        goodMilli: 36 * K,
        scrapMilli: 4 * K,
        repairCost: m(1_980_000),
        loss: m(0),
      },
    ],
    posted: [
      {
        itemId: "k17",
        needsRepairAvg: m(160_000),
        goodAmount: m(7_975_000),
        goodUnitCost: m(221_528),
        goodAvgBefore: m(195_861),
        goodAvgAfter: m(196_660),
        scrapAmount: m(405_000),
        scrapAvgAfter: m(145_761),
      },
    ],
  };

  it("reads a posted slip from the ledger, with no inputs", () => {
    render(<RepairView slip={posted} awaiting={null} />);
    expect(screen.getByText("Đã ghi sổ")).toBeInTheDocument();
    expect(screen.getByText("Thu Hà · 28/10/2026 11:15")).toBeInTheDocument();
    expect(screen.getByText("7.500 ₫/kg")).toBeInTheDocument();
    expect(screen.getByText("221.528 ₫")).toBeInTheDocument();
    expect(screen.getByText("196.660 ₫")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ghi sổ kho" })).toBeNull();
  });
});

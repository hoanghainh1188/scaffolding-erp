// M1, M2, M7 and the receipt view (goods-receipt tasks 8.1, 8.3–8.5).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DraftBanner } from "@/components/drafts/draft-banner";
import { ScanScreen } from "@/components/scan/scan-screen";
import { toMoney } from "@/domain/money";
import { resetDraftRuntime } from "@/lib/drafts/runtime";
import {
  memoryDraftStore,
  setDraftStore,
  type DraftRecord,
  type DraftStore,
} from "@/lib/drafts/store";
import type {
  ArrivalCard,
  ReceiptView as Receipt,
  StockLookup,
} from "@/lib/receiving/queries";

import { ArrivalList } from "./arrival-list";
import { HistoryList } from "./history-list";
import { ReceiptView } from "./receipt-view";

vi.mock("@/lib/scan/detector", () => ({
  preloadQrDetector: vi.fn(),
  createQrDetector: () => Promise.reject(new Error("no camera in tests")),
}));

const fetchMock = vi.fn<typeof fetch>();
let store: DraftStore;
beforeEach(() => {
  store = memoryDraftStore();
  setDraftStore(store);
  resetDraftRuntime();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  setDraftStore(null);
  vi.unstubAllGlobals();
});

function draft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    draftId: "d-052",
    kind: "GOODS_RECEIPT",
    userId: "vantung",
    documentRef: "PO-2026-052",
    title: "Nhập PO-2026-052 · Anh Trần Văn Hùng",
    progress: "2/4 mã đã đếm",
    payload: {},
    state: "EDITING",
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: "2026-10-26T01:15:00.000Z",
    attempts: 0,
    ...overrides,
  };
}

const CARD: ArrivalCard = {
  code: "PO-2026-052",
  supplierName: "Anh Trần Văn Hùng",
  kind: "USED",
  vehicle: "29H-123.45",
  label: { day: "TODAY", text: "09:30" },
  openLines: 4,
  hasReceipts: false,
  waiting: null,
};

describe("M1 arrivals", () => {
  it("shows a card per order with its time, seller, truck and lines", () => {
    render(<ArrivalList cards={[CARD]} later={0} userId="vantung" />);
    const card = screen.getByRole("article", { name: "PO-2026-052" });
    expect(card).toHaveTextContent("09:30");
    expect(card).toHaveTextContent("PO-2026-052 · Anh Trần Văn Hùng");
    expect(card).toHaveTextContent("Xe 29H-123.45 · 4 mã hàng cũ");
    expect(
      within(card).getByRole("link", { name: /Bắt đầu nhập hàng/ }),
    ).toHaveAttribute("href", "/m/receive/PO-2026-052");
  });

  it("marks a late order, a waiting one, and the orders after tomorrow", () => {
    render(
      <ArrivalList
        cards={[
          { ...CARD, label: { day: "LATE", text: "Trễ 2 ngày" } },
          {
            ...CARD,
            code: "PO-2026-051",
            hasReceipts: true,
            waiting: "40 mâm giàn giáo 1,6m",
          },
        ]}
        later={3}
        userId="vantung"
      />,
    );
    const late = screen.getByText("Trễ 2 ngày");
    expect(late.className).toContain("text-warning");
    expect(
      screen.getByText("Đang nhận · chờ giao bù 40 mâm giàn giáo 1,6m"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Xem 3 đơn ngày sau" }),
    ).toHaveAttribute("href", "/m?later=1");
  });

  it("continues the draft on this phone", async () => {
    await store.put(draft());
    render(<ArrivalList cards={[CARD]} later={0} userId="vantung" />);
    expect(
      await screen.findByRole("link", { name: /Tiếp tục nhập/ }),
    ).toHaveAttribute("href", "/m/receive/PO-2026-052?draft=d-052");
  });

  it("shows unsent drafts of this user only", async () => {
    await store.put(draft());
    await store.put(draft({ draftId: "x", userId: "ducthang" }));
    render(<DraftBanner userId="vantung" />);
    expect(await screen.findByText(/1 phiếu chưa gửi:/)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Phiếu chưa gửi" }),
    ).toHaveTextContent("Nhập PO-2026-052, nháp lúc 08:15");
    expect(screen.getByRole("link", { name: "Tiếp tục" })).toHaveAttribute(
      "href",
      "/m/receive/PO-2026-052?draft=d-052",
    );
  });
});

const STOCK: StockLookup = {
  code: "GG-K17",
  name: "Khung giàn giáo 1,7m",
  unit: "PIECE",
  standardWeightKg: "13.500",
  yard: { NEW: 0, GOOD: 1_240_000, NEEDS_REPAIR: 186_000, SCRAP: 42_000 },
  workshop: 0,
  sites: 3_860_000,
};

describe("M2 scan", () => {
  async function lookUp(code: string) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Không quét được? Nhập mã"), code);
    await user.click(screen.getByRole("button", { name: "Tìm" }));
  }

  it("shows the stock of a typed code, without the stock card for the storekeeper", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, data: STOCK, error: null }),
    );
    render(<ScanScreen canViewCard={false} />);
    await lookUp("gg-k17");
    const card = await screen.findByRole("region", {
      name: "Khung giàn giáo 1,7m",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/stock/lookup?code=GG-K17",
    );
    expect(card).toHaveTextContent("GG-K17 · cái · 13,5 kg/cái");
    expect(card).toHaveTextContent("Tốt1.240");
    expect(card).toHaveTextContent("Chờ sửa186");
    expect(card).toHaveTextContent("Ở công trình3.860");
    expect(card).toHaveTextContent(/Đã nhận mã lúc \d\d:\d\d/);
    expect(
      within(card).queryByRole("link", { name: "Xem thẻ kho" }),
    ).not.toBeInTheDocument();
  });

  it("gives the director the stock card", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, data: STOCK, error: null }),
    );
    render(<ScanScreen canViewCard />);
    await lookUp("GG-K17");
    expect(
      await screen.findByRole("link", { name: "Xem thẻ kho" }),
    ).toHaveAttribute("href", "/inventory/items/GG-K17");
  });

  it("says when a code does not exist", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { success: false, data: null, error: "Không tìm thấy mã GG-X99" },
        { status: 404 },
      ),
    );
    render(<ScanScreen canViewCard={false} />);
    await lookUp("GG-X99");
    expect(
      await screen.findByText("Không tìm thấy mã GG-X99"),
    ).toBeInTheDocument();
  });
});

describe("M7 history", () => {
  const RECEIPTS = {
    days: [
      {
        date: "2026-10-26" as const,
        receipts: [
          {
            code: "PN-2026-091",
            orderCode: "PO-2026-055",
            supplierName: "Thép Phúc Lâm",
            kind: "NEW" as const,
            countedItems: 2,
            createdAt: new Date("2026-10-26T00:20:00Z"),
          },
        ],
      },
    ],
    hasMore: true,
  };

  it("lists drafts first, then receipts by day", async () => {
    await store.put(draft());
    render(
      <HistoryList
        userId="vantung"
        receipts={RECEIPTS as never}
        dayLabels={{ "2026-10-26": "Hôm nay, 26/10" }}
        olderHref="/m/history?before=2026-10-26"
        now="2026-10-26T03:00:00Z"
      />,
    );
    const drafts = await screen.findByRole("region", {
      name: "Chưa gửi · lưu trên máy này",
    });
    expect(drafts).toHaveTextContent("Nhập · PO-2026-052");
    expect(drafts).toHaveTextContent("Nháp lúc 08:15 · 2/4 mã đã đếm");
    expect(within(drafts).getByText("Đang làm")).toBeInTheDocument();
    expect(screen.getByText("Hôm nay, 26/10")).toBeInTheDocument();
    const row = screen.getByRole("link", { name: /Nhập PN-2026-091/ });
    expect(row).toHaveAttribute("href", "/m/receipts/PN-2026-091");
    expect(row).toHaveTextContent("Thép Phúc Lâm · hàng mới · 2 mã");
    expect(row).toHaveTextContent("07:20");
    expect(
      screen.getByRole("link", { name: "Xem các ngày trước" }),
    ).toBeInTheDocument();
  });

  it("offers to resend a queued draft and marks an old one", async () => {
    await store.put(
      draft({ state: "QUEUED", createdAt: "2026-10-20T00:00:00Z" }),
    );
    render(
      <HistoryList
        userId="vantung"
        receipts={null}
        dayLabels={{}}
        olderHref={null}
        now="2026-10-26T03:00:00Z"
      />,
    );
    expect(await screen.findByText("Chờ gửi")).toBeInTheDocument();
    expect(screen.getByText("Nháp cũ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi lại" })).toBeInTheDocument();
  });

  it("asks before deleting a draft", async () => {
    const user = userEvent.setup();
    await store.put(draft());
    render(
      <HistoryList
        userId="vantung"
        receipts={null}
        dayLabels={{}}
        olderHref={null}
        now="2026-10-26T03:00:00Z"
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Xóa nháp" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "Xóa nháp nhập PO-2026-052?Số đã đếm sẽ mất.",
    );
    expect(await store.list("vantung")).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: "Xóa nháp" }));
    await waitFor(async () => expect(await store.list("vantung")).toEqual([]));
  });

  it("invites the user when there is nothing yet", async () => {
    render(
      <HistoryList
        userId="vantung"
        receipts={null}
        dayLabels={{}}
        olderHref={null}
        now="2026-10-26T03:00:00Z"
      />,
    );
    expect(
      await screen.findByText(
        "Chưa có phiếu nào. Phiếu bạn làm sẽ hiện ở đây.",
      ),
    ).toBeInTheDocument();
  });
});

describe("receipt view", () => {
  const RECEIPT: Receipt = {
    id: "r1",
    code: "PN-2026-094",
    orderCode: "PO-2026-052",
    supplierName: "Anh Trần Văn Hùng",
    kind: "USED",
    tripNo: 1,
    businessDate: "2026-10-26" as never,
    arrivedAt: new Date("2026-10-26T02:34:00Z"),
    createdAt: new Date("2026-10-26T03:00:00Z"),
    vehicle: "29H-123.45",
    createdByName: "Văn Tùng",
    locationName: "Bãi chính",
    scrapPricePerKg: toMoney(7_500),
    lines: [
      {
        itemCode: "GG-K17",
        itemName: "Khung giàn giáo 1,7m",
        itemUnit: "PIECE",
        lineUnit: "PIECE",
        status: "COUNTED",
        quantityMilli: 196_000,
        weighedKgMilli: null,
        split: { NEW: 0, GOOD: 150_000, NEEDS_REPAIR: 34_000, SCRAP: 12_000 },
        awaitsRest: false,
      },
      {
        itemCode: "GG-M16",
        itemName: "Mâm giàn giáo 1,6m",
        itemUnit: "PIECE",
        lineUnit: "PIECE",
        status: "NOT_IN_TRIP",
        quantityMilli: 0,
        weighedKgMilli: null,
        split: { NEW: 0, GOOD: 0, NEEDS_REPAIR: 0, SCRAP: 0 },
        awaitsRest: true,
      },
    ],
    costs: [{ label: "Cước xe tải", amount: toMoney(3_500_000) }],
    totalCosts: toMoney(3_500_000),
  };

  it("shows a posted receipt without a way to edit it", () => {
    render(<ReceiptView receipt={RECEIPT} posted />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Đã nhập kho PN-2026-094",
    );
    expect(screen.getByText("Thực nhận 196 cái")).toBeInTheDocument();
    expect(
      screen.getByText("Chuyến này không có · chờ chuyến sau"),
    ).toBeInTheDocument();
    expect(screen.getByText("7.500 ₫/kg")).toBeInTheDocument();
    expect(screen.getAllByText("3.500.000 ₫")).toHaveLength(2);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

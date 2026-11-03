// M5, M1 "Xuất hàng" and the picking model (deliveries tasks 6.2, 6.3;
// spec delivery-picking, mobile-home "Xuất hàng trên Việc hôm nay").
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import type {
  MobileLine,
  MobileNote,
  MobileTask,
} from "@/lib/deliveries/queries";
import { resetDraftRuntime } from "@/lib/drafts/runtime";
import {
  draftStore,
  memoryDraftStore,
  setDraftStore,
} from "@/lib/drafts/store";

import { DeliveryHome } from "./delivery-home";
import {
  emptyPicks,
  estimateFromKg,
  lineView,
  postBodyOf,
  progressText,
  shortageQuestion,
  type PickingPayload,
} from "./picking-model";
import { PickingScreen } from "./picking-screen";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
}));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  setDraftStore(memoryDraftStore());
  resetDraftRuntime();
  push.mockReset();
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  setDraftStore(null);
  vi.unstubAllGlobals();
});

const rental = (
  id: string,
  code: string,
  name: string,
  needed: number,
  stock: [number, number],
): MobileLine => ({
  id,
  itemCode: code,
  itemName: name,
  unit: "PIECE",
  lineUnit: "PIECE",
  condition: null,
  byKg: false,
  standardWeightMilli: 13_600,
  requestedMilli: needed * 1000,
  stock: [
    { condition: "NEW", milli: stock[0] * 1000 },
    { condition: "GOOD", milli: stock[1] * 1000 },
  ],
  picks: [],
});

const NOTE: MobileNote = {
  id: "n1",
  code: "PX-2026-140",
  batchNo: 3,
  status: "PICKING",
  contractType: "RENTAL",
  place: "An Phú – Block B",
  plannedDate: "2026-11-03" as BusinessDate,
  businessDate: null,
  postedAt: null,
  postedByName: null,
  pickingByName: "Văn Tùng",
  vehiclePlate: null,
  kitsText: "60 bộ giàn giáo 1,7m",
  sourceCode: "BAI-01",
  version: "2026-11-03T02:40:00.000Z",
  lines: [
    rental("l1", "H1,7", "Khung giàn giáo 1,7m", 120, [0, 1240]),
    rental("l2", "CHEO1,7", "Chéo giàn giáo", 120, [300, 2480]),
    rental("l3", "MAM1,6", "Mâm giàn giáo 1,6m", 60, [0, 640]),
  ],
};

const payload = (lines: PickingPayload["lines"] = {}): PickingPayload => ({
  noteId: "n1",
  code: "PX-2026-140",
  startedVersion: NOTE.version,
  vehiclePlate: "51X-000.01",
  lines,
  departedAt: null,
});

const kgLine: MobileLine = {
  ...rental("k1", "H1,7", "Khung H 1,7m có đầu", 0, [0, 0]),
  condition: "GOOD",
  byKg: true,
  lineUnit: "KG",
  requestedMilli: 1_250_500,
  stock: [{ condition: "GOOD", milli: 100_000 }],
};

describe("picking model", () => {
  it("counts progress and the shortage question", () => {
    const state = payload({
      l1: { ...emptyPicks(), quantities: { GOOD: "120" } },
      l2: { ...emptyPicks(), quantities: { GOOD: "80" } },
    });
    expect(progressText(NOTE.lines, state)).toBe("200 / 300 cái");
    expect(shortageQuestion(NOTE.lines, state)).toBe(
      "Còn 100 cái chưa nhặt. Xác nhận luôn thì phần thiếu chuyển sang đợt sau.",
    );
  });

  it("says a line is full, split over two conditions", () => {
    const view = lineView(NOTE.lines[1] as MobileLine, {
      ...emptyPicks(),
      quantities: { NEW: "80", GOOD: "40" },
    });
    expect(view.status).toBe("Đã nhặt đủ 120 cái");
  });

  it("blocks more than the line needs", () => {
    const view = lineView(NOTE.lines[2] as MobileLine, {
      ...emptyPicks(),
      quantities: { GOOD: "70" },
    });
    expect(view.error).toBe("Dòng này chỉ cần 60 cái.");
  });

  it("follows the weighed kg on a sale by kg", () => {
    expect(
      lineView(kgLine, {
        quantities: { GOOD: "80" },
        weighedKg: "1100",
        piecesEstimated: false,
      }).status,
    ).toBe("Còn 150,5 kg");
    const slight = lineView(kgLine, {
      quantities: { GOOD: "90" },
      weighedKg: "1258",
      piecesEstimated: false,
    });
    expect(slight.status).toBe("Đã nhặt đủ 1.258 kg · dư 7,5 kg");
    expect(slight.error).toBeNull();
    expect(
      lineView(kgLine, {
        quantities: { GOOD: "100" },
        weighedKg: "1400",
        piecesEstimated: false,
      }).error,
    ).toBe("Kg cân vượt số cần quá 10 %. Văn phòng cần sửa phiếu.");
  });

  it("estimates scrap pieces from the kg, capped by stock", () => {
    const scrap: MobileLine = {
      ...kgLine,
      condition: "SCRAP",
      stock: [{ condition: "SCRAP", milli: 100_000 }],
    };
    expect(estimateFromKg(scrap, "570,5")).toEqual({
      quantity: "42",
      note: null,
    });
    expect(
      estimateFromKg(
        { ...scrap, stock: [{ condition: "SCRAP", milli: 42_000 }] },
        "612",
      ),
    ).toEqual({
      quantity: "42",
      note: "Ước tính 45 cái nhưng bãi chỉ còn 42 cái Phế liệu, máy điền 42.",
    });
  });

  it("sends only the lines picked", () => {
    const body = postBodyOf(
      NOTE.lines,
      payload({
        l1: { ...emptyPicks(), quantities: { GOOD: "120", NEW: "" } },
      }),
      "2026-11-03T03:42:00.000Z",
    );
    expect(body.picks).toEqual([
      {
        lineId: "l1",
        condition: "GOOD",
        quantity: "120",
        weighedKg: null,
        piecesEstimated: false,
      },
    ]);
  });
});

describe("M5", () => {
  it("shows the header, the stock and no money", async () => {
    render(<PickingScreen note={NOTE} userId="vantung" />);
    expect(await screen.findByText("Xuất PX-2026-140")).toBeInTheDocument();
    expect(
      screen.getByText(
        "60 bộ giàn giáo 1,7m đã tự tách thành linh kiện. Chỉ lấy hàng Mới hoặc Tốt.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Mới tồn 300 · Tốt tồn 2\.480 · cần 120 cái/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/₫/);
  });

  it("offers only Mới and Tốt on a rental line", async () => {
    render(<PickingScreen note={NOTE} userId="vantung" />);
    const card = await screen.findByRole("article", { name: "CHEO1,7" });
    await userEvent.click(
      within(card).getByRole("button", { name: "Thêm hàng Mới" }),
    );
    expect(within(card).queryByText("Chờ sửa")).toBeNull();
    expect(within(card).queryByText("Phế liệu")).toBeNull();
    expect(
      within(card).queryByRole("button", { name: /Thêm hàng/ }),
    ).toBeNull();
  });

  it("needs the truck plate", async () => {
    render(<PickingScreen note={NOTE} userId="vantung" />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Xác nhận xe rời bãi" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Bạn nhập biển số xe chở hàng.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks before confirming a short note, then sends once", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ data: { code: "PX-2026-140" } }, { status: 201 }),
    );
    render(<PickingScreen note={NOTE} userId="vantung" />);
    await userEvent.type(
      await screen.findByLabelText("Biển số xe chở hàng"),
      "51X-000.01",
    );
    const card = screen.getByRole("article", { name: "H1,7" });
    await userEvent.click(
      within(card).getByRole("button", { name: "Nhặt đủ" }),
    );
    expect(within(card).getByText("Đã nhặt đủ 120 cái")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Xác nhận xe rời bãi" }),
    );
    expect(
      await screen.findByText(
        "Còn 180 cái chưa nhặt. Xác nhận luôn thì phần thiếu chuyển sang đợt sau.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vẫn xác nhận" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/m"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/m/deliveries/PX-2026-140/post");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      vehiclePlate: "51X-000.01",
      startedVersion: NOTE.version,
      picks: [{ lineId: "l1", condition: "GOOD", quantity: "120" }],
    });
  });

  it("keeps the draft waiting when offline", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    render(
      <PickingScreen
        note={{ ...NOTE, vehiclePlate: "51X-000.01" }}
        userId="vantung"
      />,
    );
    for (const code of ["H1,7", "CHEO1,7", "MAM1,6"]) {
      const card = await screen.findByRole("article", { name: code });
      await userEvent.click(
        within(card).getByRole("button", { name: "Nhặt đủ" }),
      );
    }
    await userEvent.click(
      screen.getByRole("button", { name: "Xác nhận xe rời bãi" }),
    );
    expect(
      await screen.findByText("Chưa gửi được, sẽ tự gửi khi có mạng"),
    ).toBeInTheDocument();
    const [saved] = await draftStore().list("vantung");
    expect(saved?.state).toBe("QUEUED");
    expect(saved?.kind).toBe("DELIVERY");
  });

  it("locks the numbers until picking starts", async () => {
    render(
      <PickingScreen note={{ ...NOTE, status: "PLANNED" }} userId="vantung" />,
    );
    expect(
      await screen.findByRole("button", { name: "Bắt đầu nhặt" }),
    ).toBeEnabled();
    const card = screen.getByRole("article", { name: "H1,7" });
    expect(
      within(card).getByRole("button", { name: "Nhặt đủ" }),
    ).toBeDisabled();
  });

  it("shows a posted note read-only", () => {
    render(
      <PickingScreen
        note={{
          ...NOTE,
          status: "POSTED",
          businessDate: "2026-11-03" as BusinessDate,
          postedByName: "Văn Tùng",
          lines: [
            {
              ...(NOTE.lines[0] as MobileLine),
              picks: [
                {
                  condition: "GOOD",
                  quantityMilli: 120_000,
                  weighedMilli: null,
                  piecesEstimated: false,
                },
              ],
            },
          ],
        }}
        userId="vantung"
      />,
    );
    expect(screen.getByText("03/11/2026")).toBeInTheDocument();
    expect(screen.getByText("Tốt 120 cái")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Xác nhận xe rời bãi" }),
    ).toBeNull();
  });
});

describe("M1 Xuất hàng", () => {
  const task = (overrides: Partial<MobileTask> = {}): MobileTask => ({
    id: "n1",
    code: "PX-2026-140",
    batchNo: 3,
    status: "PLANNED",
    plannedDate: "2026-11-03" as BusinessDate,
    place: "An Phú – Block B",
    requested: "60 bộ giàn giáo 1,7m = 120 khung, 120 chéo, 60 mâm",
    totalRequested: [{ unit: "PIECE", milli: 300_000 }],
    ...overrides,
  });

  it("shows a waiting note with its goods and no price", () => {
    render(
      <DeliveryHome
        tasks={[task()]}
        today={"2026-11-03" as BusinessDate}
        userId="vantung"
      />,
    );
    expect(
      screen.getByText("PX-2026-140 · Đợt 3 · An Phú – Block B"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("60 bộ giàn giáo 1,7m = 120 khung, 120 chéo, 60 mâm"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bắt đầu nhặt" })).toHaveAttribute(
      "href",
      "/m/deliveries/PX-2026-140",
    );
  });

  it("marks a late note", () => {
    render(
      <DeliveryHome
        tasks={[
          task({
            code: "PX-2026-138",
            plannedDate: "2026-11-01" as BusinessDate,
          }),
        ]}
        today={"2026-11-03" as BusinessDate}
        userId="vantung"
      />,
    );
    expect(screen.getByText("Trễ 2 ngày")).toBeInTheDocument();
  });

  it("continues a note being picked with the draft progress", async () => {
    await draftStore().put({
      draftId: "d1",
      kind: "DELIVERY",
      userId: "vantung",
      documentRef: "PX-2026-140",
      title: "Xuất PX-2026-140",
      progress: "200 / 300 cái",
      payload: {},
      state: "EDITING",
      error: null,
      createdAt: "2026-11-03T02:00:00.000Z",
      updatedAt: "2026-11-03T02:10:00.000Z",
      attempts: 0,
    });
    render(
      <DeliveryHome
        tasks={[task({ status: "PICKING" })]}
        today={"2026-11-03" as BusinessDate}
        userId="vantung"
      />,
    );
    expect(
      await screen.findByText("Đang nhặt · 200 / 300 cái"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Tiếp tục nhặt" }),
    ).toBeInTheDocument();
  });
});

describe("M7 Xuất", () => {
  it("lists a posted note and only delivery drafts under Xuất", async () => {
    const { HistoryList } = await import("@/components/receiving/history-list");
    await draftStore().put({
      draftId: "r1",
      kind: "GOODS_RECEIPT",
      userId: "vantung",
      documentRef: "PO-2026-052",
      title: "Nhập PO-2026-052 · anh Hùng",
      progress: "2/4 mã đã đếm",
      payload: {},
      state: "EDITING",
      error: null,
      createdAt: "2026-11-03T02:00:00.000Z",
      updatedAt: "2026-11-03T02:10:00.000Z",
      attempts: 0,
    });
    render(
      <HistoryList
        userId="vantung"
        receipts={null}
        deliveries={{
          days: [
            {
              date: "2026-11-03" as BusinessDate,
              notes: [
                {
                  code: "PX-2026-140",
                  place: "An Phú – Block B",
                  delivered: [{ unit: "PIECE", milli: 260_000 }],
                  postedAt: new Date("2026-11-03T03:42:00Z"),
                },
              ],
            },
          ],
          hasMore: false,
        }}
        type="delivery"
        dayLabels={{ "2026-11-03": "Hôm nay, 03/11" }}
        olderHref={null}
        now="2026-11-03T04:00:00.000Z"
      />,
    );
    expect(screen.getByText("Xuất PX-2026-140")).toBeInTheDocument();
    expect(screen.getByText("An Phú – Block B · 260 cái")).toBeInTheDocument();
    expect(screen.getByText("10:42")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/PO-2026-052/)).toBeNull());
  });
});

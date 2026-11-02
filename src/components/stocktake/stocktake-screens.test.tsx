// M6a, M6 and the M1 block (stocktake tasks 6.2-6.4).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STOCKTAKE_MESSAGES } from "@/domain/stocktake";
import { resetDraftRuntime } from "@/lib/drafts/runtime";
import { memoryDraftStore, setDraftStore } from "@/lib/drafts/store";
import type { OpenStocktake } from "@/lib/stocktakes/queries";

import { StocktakeCount } from "./stocktake-count";
import { StocktakeHome } from "./stocktake-home";
import type { CountViewData, CountViewLine } from "./stocktake-model";
import { StocktakeStart, type StartPlaceOption } from "./stocktake-start";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
}));
vi.mock("@/lib/scan/detector", () => ({
  preloadQrDetector: vi.fn(),
  createQrDetector: () => Promise.reject(new Error("no camera in tests")),
}));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  setDraftStore(memoryDraftStore());
  resetDraftRuntime();
  push.mockReset();
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  setDraftStore(null);
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(Response.json(body, { status }));

describe("M6a", () => {
  const PLACES: StartPlaceOption[] = [
    {
      id: "bai",
      code: "BAI-01",
      name: "Bãi chính",
      lines: 42,
      lastDone: "30/09/2026",
      openCode: null,
      groups: [
        { id: "khung", name: "Khung", lines: 8 },
        { id: "cheo", name: "Chéo", lines: 6 },
        { id: "kich", name: "Kích, phụ kiện", lines: 14 },
      ],
    },
    {
      id: "xuong",
      code: "XUONG-01",
      name: "Xưởng",
      lines: 9,
      lastDone: null,
      openCode: "KK-2026-004",
      groups: [],
    },
  ];

  it("starts a session for the chosen groups", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(
      json({ success: true, data: { code: "KK-2026-003" } }, 201),
    );
    render(<StocktakeStart places={PLACES} />);
    expect(
      screen.getByRole("radio", { name: /^BAI-01 · Bãi chính/ }),
    ).toHaveTextContent("Lần trước: 30/09/2026 · 42 dòng hàng có tồn");
    expect(
      screen.getByText(/đếm mù: máy không hiện số trên sổ/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bắt đầu đếm 42 dòng" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Khung (8)" }));
    await user.click(screen.getByRole("button", { name: "Chéo (6)" }));
    await user.click(
      screen.getByRole("button", { name: "Kích, phụ kiện (14)" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Bắt đầu đếm 28 dòng" }),
    );
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/stocktakes");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      locationId: "bai",
      groupIds: ["khung", "cheo", "kich"],
    });
    expect(push).toHaveBeenCalledWith("/m/stocktake/KK-2026-003");
  });

  it("says a place already has a session and needs the network", async () => {
    const user = userEvent.setup();
    render(<StocktakeStart places={PLACES} />);
    await user.click(screen.getByRole("radio", { name: /XUONG-01/ }));
    expect(
      screen.getByText("Đang có phiên KK-2026-004 chưa xong"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bắt đầu đếm/ })).toBeDisabled();
    await user.click(
      screen.getByRole("radio", { name: /^BAI-01 · Bãi chính/ }),
    );
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await user.click(screen.getByRole("button", { name: /Bắt đầu đếm/ }));
    expect(
      screen.getByText(STOCKTAKE_MESSAGES.offlineStart),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const line = (overrides: Partial<CountViewLine>): CountViewLine => ({
  id: crypto.randomUUID(),
  itemId: "ch",
  itemCode: "GG-CH",
  itemName: "Chéo giàn giáo",
  unit: "PIECE",
  groupName: "Giàn giáo",
  condition: "GOOD",
  origin: "LISTED",
  counted: null,
  recount: false,
  ...overrides,
});

const VIEW: CountViewData = {
  code: "KK-2026-003",
  status: "COUNTING",
  round: 1,
  locationCode: "BAI-01",
  locationName: "Bãi chính",
  startedAt: "2026-10-28T01:00:00.000Z",
  scope: ["Giàn giáo"],
  returnedReason: null,
  lines: [
    line({ condition: "GOOD" }),
    line({ condition: "NEEDS_REPAIR" }),
    line({
      itemId: "k17",
      itemCode: "GG-K17",
      itemName: "Khung giàn giáo 1,7m",
    }),
  ],
};

const cardOf = (name: RegExp) => screen.getByRole("article", { name });

/** [counted, total] of the M6 progress bar. */
const progress = () => {
  const bar = screen.getByRole("progressbar", { name: "Tiến độ kiểm kê" });
  return [
    Number(bar.getAttribute("aria-valuenow")),
    Number(bar.getAttribute("aria-valuemax")),
  ];
};

describe("M6", () => {
  it("counts blind, needs every condition, then sends with the uncounted warning", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(
      json({
        success: true,
        data: { code: "KK-2026-003", status: "SUBMITTED" },
      }),
    );
    render(<StocktakeCount view={VIEW} userId="vantung" canCancel />);
    await waitFor(() => expect(progress()).toEqual([0, 3]));
    expect(screen.queryByText(/sổ/i)).toBeNull();
    await user.click(
      within(cardOf(/Chéo giàn giáo/)).getByRole("button", {
        name: "Đếm mã này",
      }),
    );
    const counting = cardOf(/Chéo giàn giáo, đang đếm/);
    await user.type(
      within(counting).getByRole("textbox", {
        name: "Số chéo giàn giáo Tốt đếm được",
      }),
      "2450",
    );
    await user.click(
      within(counting).getByRole("button", { name: /Xong mã này/ }),
    );
    expect(within(counting).getByRole("alert")).toHaveTextContent(
      STOCKTAKE_MESSAGES.missingCondition("NEEDS_REPAIR"),
    );
    await user.click(
      within(counting).getAllByRole("button", {
        name: "Tăng 1",
      })[1] as HTMLElement,
    );
    await user.click(
      within(counting).getByRole("button", { name: /Xong mã này/ }),
    );
    await waitFor(() => expect(progress()).toEqual([2, 3]));
    expect(cardOf(/Chéo giàn giáo, đã đếm/)).toHaveTextContent("2.450");
    expect(
      screen.getByText(
        "Còn 1 dòng chưa đếm. Gửi luôn thì các dòng đó không điều chỉnh.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gửi văn phòng" }));
    await user.click(await screen.findByRole("button", { name: "Gửi luôn" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/stocktakes/KK-2026-003/submit");
    expect(JSON.parse(String(init?.body)).items).toEqual([
      expect.objectContaining({
        itemId: "ch",
        lines: [
          { condition: "GOOD", quantity: "2450.000" },
          { condition: "NEEDS_REPAIR", quantity: "1.000" },
        ],
      }),
    ]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("refuses part pieces and lets a finished item be edited", async () => {
    const user = userEvent.setup();
    render(<StocktakeCount view={VIEW} userId="vantung" canCancel />);
    await user.click(
      within(
        await screen.findByRole("article", { name: /Khung giàn giáo 1,7m/ }),
      ).getByRole("button", { name: "Đếm mã này" }),
    );
    const counting = cardOf(/Khung giàn giáo 1,7m, đang đếm/);
    await user.type(within(counting).getByRole("textbox"), "12,5");
    await user.click(
      within(counting).getByRole("button", { name: /Xong mã này/ }),
    );
    expect(within(counting).getByRole("alert")).toHaveTextContent(
      STOCKTAKE_MESSAGES.wholePieces("GG-K17"),
    );
    await user.clear(within(counting).getByRole("textbox"));
    await user.type(within(counting).getByRole("textbox"), "1226");
    await user.click(
      within(counting).getByRole("button", { name: /Xong mã này/ }),
    );
    const finished = cardOf(/Khung giàn giáo 1,7m, đã đếm/);
    expect(finished).toHaveTextContent(/Đã đếm lúc \d\d:\d\d/);
    await user.click(within(finished).getByRole("button", { name: "Sửa" }));
    expect(
      within(cardOf(/Khung giàn giáo 1,7m, đang đếm/)).getByRole("textbox"),
    ).toHaveValue("1226");
  });

  it("shows only the lines asked for in a recount, and the return reason", async () => {
    const recount: CountViewData = {
      ...VIEW,
      round: 2,
      lines: [
        line({ condition: "GOOD", counted: "2450.000" }),
        line({ condition: "NEEDS_REPAIR", recount: true }),
        line({
          itemId: "k17",
          itemCode: "GG-K17",
          itemName: "Khung giàn giáo 1,7m",
          counted: "1226.000",
        }),
      ],
    };
    const { unmount } = render(
      <StocktakeCount view={recount} userId="vantung" canCancel />,
    );
    expect(
      await screen.findByText("Văn phòng yêu cầu đếm lại 1 dòng."),
    ).toBeInTheDocument();
    const ch = cardOf(/Chéo giàn giáo, chưa đếm/);
    expect(within(ch).getByText("Cần đếm lại")).toBeInTheDocument();
    expect(
      within(cardOf(/Khung giàn giáo 1,7m, đã đếm/)).queryByRole("button", {
        name: "Sửa",
      }),
    ).toBeNull();
    unmount();
    render(
      <StocktakeCount
        view={{
          ...VIEW,
          round: 2,
          returnedReason: "Đếm lại cả khu chéo sau xưởng",
          code: "KK-2026-009",
        }}
        userId="vantung"
        canCancel
      />,
    );
    expect(
      await screen.findByText(
        "Văn phòng trả lại: Đếm lại cả khu chéo sau xưởng",
      ),
    ).toBeInTheDocument();
  });

  it("adds an item not in the list", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(
      json({
        success: true,
        data: {
          items: [
            { id: "ku", code: "PK-KU", name: "Kích tăng U", unit: "PIECE" },
          ],
        },
      }),
    );
    render(<StocktakeCount view={VIEW} userId="vantung" canCancel />);
    await user.click(
      await screen.findByRole("button", {
        name: /Thấy hàng không có trong danh sách/,
      }),
    );
    await user.type(
      screen.getByRole("searchbox", { name: "Tìm mã hoặc tên hàng" }),
      "kich",
    );
    await user.click(screen.getByRole("button", { name: "Tìm" }));
    await user.click(
      await screen.findByRole("button", { name: /Kích tăng U/ }),
    );
    expect(cardOf(/Kích tăng U, đang đếm/)).toBeInTheDocument();
    expect(progress()).toEqual([0, 4]);
  });
});

describe("M1 Kiểm kê", () => {
  const session = (overrides: Partial<OpenStocktake>): OpenStocktake => ({
    code: "KK-2026-003",
    locationCode: "BAI-01",
    locationName: "Bãi chính",
    status: "COUNTING",
    counted: 17,
    total: 28,
    recountLines: 0,
    returnedReason: null,
    ...overrides,
  });

  it("shows open sessions and the start button", () => {
    render(
      <StocktakeHome
        userId="vantung"
        sessions={[
          session({}),
          session({ code: "KK-2026-004", recountLines: 1 }),
          session({
            code: "KK-2026-005",
            returnedReason: "Đếm lại cả khu chéo sau xưởng",
          }),
          session({ code: "KK-2026-006", status: "SUBMITTED" }),
        ]}
      />,
    );
    const first = screen.getByRole("article", { name: "KK-2026-003" });
    expect(first).toHaveTextContent("KK-2026-003 · BAI-01 · Bãi chính");
    expect(first).toHaveTextContent("Đang đếm · 17 / 28 dòng");
    expect(
      within(first).getByRole("link", { name: "Tiếp tục đếm" }),
    ).toHaveAttribute("href", "/m/stocktake/KK-2026-003");
    const recount = screen.getByRole("article", { name: "KK-2026-004" });
    expect(recount).toHaveTextContent("Cần đếm lại 1 dòng");
    expect(
      within(recount).getByRole("link", { name: "Đếm lại" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "KK-2026-005" }),
    ).toHaveTextContent("Bị trả lại: Đếm lại cả khu chéo sau xưởng");
    const waiting = screen.getByRole("article", { name: "KK-2026-006" });
    expect(waiting).toHaveTextContent("Chờ Giám đốc duyệt");
    expect(within(waiting).queryByRole("link")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Bắt đầu kiểm kê" }),
    ).toHaveAttribute("href", "/m/stocktake/new");
  });

  it("is only the start button without sessions", () => {
    render(<StocktakeHome userId="vantung" sessions={[]} />);
    expect(screen.queryByRole("article")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Bắt đầu kiểm kê" }),
    ).toBeInTheDocument();
  });
});

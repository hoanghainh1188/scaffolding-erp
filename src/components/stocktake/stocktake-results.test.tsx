// D13 results and approval bar (stocktake tasks 7.2, 7.3).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  quantityText,
  signedMoney,
  signedQuantities,
  signedQuantity,
} from "./format";
import { StocktakeResults, type ResultRow } from "./stocktake-results";
import { StocktakeStatusBadge } from "./stocktake-status-badge";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
}));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json({ success: true, data: {} }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const K = 1000;
const row = (
  id: string,
  itemCode: string,
  condition: ResultRow["condition"],
  book: number | null,
  counted: number | null,
  unitCost: number | null,
  flags: ResultRow["flags"] = [],
): ResultRow => {
  const difference =
    book === null || counted === null ? null : (counted - book) * K;
  return {
    id,
    itemCode,
    itemName: itemCode,
    unit: "PIECE",
    condition,
    bookMilli: book === null ? null : book * K,
    countedMilli: counted === null ? null : counted * K,
    differenceMilli: difference,
    unitCost,
    needsCost: (difference ?? 0) > 0 && unitCost === null,
    value:
      difference === null || unitCost === null
        ? null
        : (difference / K) * unitCost,
    flags,
    recount: false,
  };
};

const ROWS: ResultRow[] = [
  row("a", "GG-CH", "GOOD", 2480, 2450, 31_000, ["OVER_PCT", "CONDITION_SWAP"]),
  row("b", "GG-CH", "NEEDS_REPAIR", 40, 50, 18_000, [
    "OVER_PCT",
    "CONDITION_SWAP",
  ]),
  row("c", "GG-K15", "GOOD", 860, 852, 167_116),
  row("d", "GG-K17", "GOOD", 1230, 1226, 195_282),
  row("e", "PK-KU", "GOOD", 500, 502, 40_000, ["MOVED"]),
  row("f", "GG-M16", "GOOD", 300, 300, 250_000),
  row("g", "OT-06", "GOOD", null, null, null),
];

function show(props: Partial<Parameters<typeof StocktakeResults>[0]> = {}) {
  return render(
    <StocktakeResults
      code="KK-2026-003"
      status="SUBMITTED"
      filter="diff"
      rows={ROWS}
      canApprove
      counterName="Văn Tùng"
      {...props}
    />,
  );
}

describe("format", () => {
  it("writes signed differences the D13 way", () => {
    expect(signedMoney(-2_788_056)).toBe("-2.788.056 ₫");
    expect(signedMoney(260_000)).toBe("+260.000 ₫");
    expect(signedMoney(0)).toBe("0 ₫");
    expect(signedQuantity(-30 * K, "PIECE")).toBe("-30");
    expect(signedQuantity(2_250, "KG")).toBe("+2,25");
    expect(signedQuantities({ PIECE: -42 * K, KG: 0 })).toBe("-42 cái");
    expect(signedQuantities({ PIECE: 12 * K, KG: -2_250 })).toBe(
      "+12 cái · -2,25 kg",
    );
    expect(signedQuantities({ PIECE: 0, KG: 0 })).toBe("0 cái");
    expect(quantityText(null, "PIECE")).toBe("–");
    expect(quantityText(1_226 * K, "PIECE")).toBe("1.226");
  });

  it("labels every status", () => {
    render(<StocktakeStatusBadge status="SUBMITTED" />);
    expect(screen.getByText("Chờ duyệt")).toBeInTheDocument();
  });
});

describe("D13 results", () => {
  it("lists the lines off the book with their flags and the total", () => {
    show();
    expect(screen.getByRole("link", { name: "Dòng lệch (5)" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Khớp (1)" })).toHaveAttribute(
      "href",
      "?filter=match",
    );
    expect(
      screen.getByRole("link", { name: "Tất cả (7)" }),
    ).toBeInTheDocument();
    const body = screen.getAllByRole("rowgroup")[1] as HTMLElement;
    expect(within(body).getAllByRole("row")).toHaveLength(5);
    const ch = within(body).getAllByRole("row")[0] as HTMLElement;
    expect(ch).toHaveTextContent("2.480");
    expect(ch).toHaveTextContent("2.450");
    expect(ch).toHaveTextContent("-30");
    expect(ch).toHaveTextContent("-930.000 ₫");
    expect(ch).toHaveTextContent("Lệch 1,2 %");
    expect(ch).toHaveTextContent("Nghi nhầm tình trạng");
    expect(screen.getByText("Có nhập/xuất trong lúc đếm")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Cộng/ })).toHaveTextContent(
      "-2.788.056 ₫",
    );
    expect(screen.getByText(/Duyệt sẽ ghi/)).toHaveTextContent("5 dòng");
  });

  it("shows lines not counted on the all tab", () => {
    show({ filter: "all" });
    expect(screen.getByRole("row", { name: /OT-06/ })).toHaveTextContent(
      "Chưa đếm",
    );
  });

  it("hides the approval bar from the accountant and after posting", () => {
    const { unmount } = show({ canApprove: false });
    expect(
      screen.queryByRole("button", { name: "Duyệt và ghi sổ" }),
    ).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    unmount();
    show({ status: "DONE" });
    expect(
      screen.queryByRole("button", { name: "Duyệt và ghi sổ" }),
    ).toBeNull();
    expect(screen.queryByText(/Duyệt sẽ ghi/)).toBeNull();
  });

  it("asks a recount of the chosen lines", async () => {
    const user = userEvent.setup();
    show();
    const ask = screen.getByRole("button", { name: "Yêu cầu đếm lại 0 dòng" });
    expect(ask).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", { name: "Chọn GG-CH NEEDS_REPAIR" }),
    );
    expect(screen.getByText(/được chọn để đếm lại/)).toHaveTextContent(
      "1 dòng được chọn để đếm lại. Gửi lại về điện thoại của Văn Tùng; các dòng khác giữ nguyên.",
    );
    await user.click(
      screen.getByRole("button", { name: "Yêu cầu đếm lại 1 dòng" }),
    );
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/stocktakes/KK-2026-003/recount");
    expect(JSON.parse(String(init?.body))).toEqual({ lineIds: ["b"] });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("approves with the unit cost typed for a surplus never priced", async () => {
    const user = userEvent.setup();
    show({
      rows: [...ROWS, row("h", "GG-K12", "NEW", 0, 5, null, ["OVER_PCT"])],
    });
    await user.type(
      screen.getByRole("textbox", { name: "Đơn giá GG-K12" }),
      "150.000",
    );
    await user.click(screen.getByRole("button", { name: "Duyệt và ghi sổ" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Duyệt và ghi sổ" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/stocktakes/KK-2026-003/approve");
    expect(JSON.parse(String(init?.body))).toEqual({
      unitCosts: { h: 150_000 },
    });
  });

  it("returns the session with a reason", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Trả lại" }));
    await user.type(
      screen.getByLabelText("Lý do trả lại"),
      "Đếm lại cả khu chéo sau xưởng",
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Trả lại",
      }),
    );
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/stocktakes/KK-2026-003/return");
    expect(JSON.parse(String(init?.body))).toEqual({
      reason: "Đếm lại cả khu chéo sau xưởng",
    });
  });
});

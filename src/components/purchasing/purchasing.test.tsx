// D2, D3, D3b components (purchase-orders tasks 5.1-5.3).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toMoney } from "@/domain/money";
import { PURCHASE_MESSAGES } from "@/domain/purchase-order";
import type { OrderListRow } from "@/lib/purchasing/queries";

import { OrderActions } from "./order-actions";
import { OrderForm, type EditedOrder } from "./order-form";
import { OrderHistory } from "./order-history";
import { OrderTable } from "./order-table";
import { OrderTabs, orderListHref } from "./order-tabs";
import type { ItemChoice } from "./preview";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push }),
  usePathname: () => "/purchasing",
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const ITEMS: ItemChoice[] = [
  {
    id: "k17",
    code: "GG-K17",
    name: "Khung giàn giáo 1,7m",
    unit: "PIECE",
    standardWeightKg: "13.500",
  },
  {
    id: "ch",
    code: "GG-CH",
    name: "Chéo giàn giáo",
    unit: "PIECE",
    standardWeightKg: "2.800",
  },
  {
    id: "m16",
    code: "GG-M16",
    name: "Mâm giàn giáo 1,6m",
    unit: "PIECE",
    standardWeightKg: "11.000",
  },
  {
    id: "pl",
    code: "PL-SAT",
    name: "Phế liệu sắt lẫn",
    unit: "KG",
    standardWeightKg: null,
  },
];
const SUPPLIERS = [{ id: "s2", code: "NCC-0002", name: "Chú Ba ve chai" }];

/** The D3 order as the edit page passes it (design D3 numbers). */
const D3: EditedOrder = {
  code: "PO-2026-055",
  status: "IN_PROGRESS",
  editable: "ALL",
  updatedAt: "2026-10-26T03:00:00.000Z",
  supplierId: "s2",
  kind: "USED",
  expectedDate: "2026-10-26",
  expectedTime: "09:30",
  vehicle: null,
  note: null,
  allocationMethod: "VALUE",
  lines: [
    { itemId: "k17", unit: "PIECE", quantity: 200_000, unitPrice: 185_000 },
    { itemId: "ch", unit: "PIECE", quantity: 400_000, unitPrice: 32_000 },
    { itemId: "m16", unit: "PIECE", quantity: 150_000, unitPrice: 145_000 },
    { itemId: "pl", unit: "KG", quantity: 1_250_500, unitPrice: 7_500 },
  ],
  costs: [
    { label: "Cước xe tải", amount: 3_500_000 },
    { label: "Bốc xếp", amount: 1_200_000 },
    { label: "Cầu đường", amount: 180_000 },
  ],
};

const rowOf = (name: string) =>
  screen
    .getByRole("combobox", { name: `Mã hàng dòng ${name}` })
    .closest("tr") as HTMLElement;

describe("D2", () => {
  const row: OrderListRow = {
    id: "1",
    code: "PO-2026-053",
    supplierName: "Chú Ba ve chai",
    kind: "USED",
    expectedDate: "2026-10-21",
    expectedTime: null,
    lineCount: 1,
    total: toMoney(9_600_000),
    status: "DONE",
    outcome: "CANCELLED",
    hasReceipts: false,
  };

  it("shows each tab with its count and keeps the filters in the link", () => {
    render(
      <OrderTabs
        active="waiting"
        counts={{ all: 5, draft: 1, waiting: 2, receiving: 0, done: 0 }}
        hrefOf={(tab) => orderListHref({ q: "chu ba", page: "2" }, { tab })}
      />,
    );
    const tab = screen.getByRole("link", { name: "Chờ xe về · 2" });
    expect(tab).toHaveAttribute("aria-current", "page");
    expect(tab).toHaveAttribute("href", "/purchasing?q=chu+ba&tab=waiting");
  });

  it("labels a cancelled order and links the code to D3b", () => {
    render(<OrderTable rows={[row]} />);
    const line = within(screen.getByRole("row", { name: /PO-2026-053/ }));
    expect(line.getByText("Hoàn thành")).toBeInTheDocument();
    expect(line.getByText("Đã hủy")).toBeInTheDocument();
    expect(line.getByText("9.600.000 ₫")).toBeInTheDocument();
    expect(line.getByText("21/10/2026")).toBeInTheDocument();
    expect(line.getByRole("link", { name: "PO-2026-053" })).toHaveAttribute(
      "href",
      "/purchasing/orders/PO-2026-053",
    );
  });
});

describe("D3 form", () => {
  it("previews the D3 costs by value, then by weight", async () => {
    render(<OrderForm suppliers={SUPPLIERS} items={ITEMS} order={D3} />);
    const frame = within(rowOf("1"));
    expect(frame.getByText("+2.231.098")).toBeInTheDocument();
    expect(frame.getByText("196.155 ₫")).toBeInTheDocument();
    expect(screen.getByTestId("order-total")).toHaveTextContent("85.808.750 ₫");
    await userEvent.click(screen.getByLabelText(/Theo trọng lượng/));
    expect(frame.getByText("+1.960.568")).toBeInTheDocument();
    expect(frame.getByText("194.803 ₫")).toBeInTheDocument();
  });

  it("shows the pieces in a kg line and only kg for a kg item", async () => {
    render(<OrderForm suppliers={SUPPLIERS} items={ITEMS} order={D3} />);
    const frame = within(rowOf("1"));
    await userEvent.click(frame.getByRole("button", { name: "kg" }));
    const quantity = frame.getByLabelText(/Số lượng Khung giàn giáo 1,7m/);
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "2000");
    expect(frame.getByText("≈ 148 cái")).toBeInTheDocument();
    const scrap = within(rowOf("4"));
    expect(scrap.queryByRole("button", { name: "cái" })).toBeNull();
    expect(scrap.getByRole("button", { name: "kg" })).toBeInTheDocument();
  });

  it("puts the server's message under the field it names", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          data: { field: "lines.0.quantity" },
          error: "Số lượng phải lớn hơn 0",
        }),
        { status: 422 },
      ),
    );
    render(<OrderForm suppliers={SUPPLIERS} items={ITEMS} order={D3} />);
    const quantity = within(rowOf("1")).getByLabelText(/Số lượng Khung/);
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "0");
    await userEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    const cell = quantity.closest("td") as HTMLElement;
    expect(
      await within(cell).findByText("Số lượng phải lớn hơn 0"),
    ).toBeInTheDocument();
    expect(
      JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string),
    ).toMatchObject({
      updatedAt: D3.updatedAt,
      lines: [{ quantity: "0.000" }, {}, {}, {}],
    });
  });

  it("shows a server error on its row even after a blank row", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          data: { field: "lines.0.quantity" },
          error: "GG-K17 tính theo cái, số lượng phải là số nguyên",
        }),
        { status: 422 },
      ),
    );
    render(
      <OrderForm
        suppliers={SUPPLIERS}
        items={ITEMS}
        order={{ ...D3, lines: [D3.lines[0]!] }}
      />,
    );
    // Row 1 becomes blank, row 2 holds the line: the server's lines.0.
    await userEvent.click(
      screen.getByRole("button", { name: /Thêm dòng hàng/ }),
    );
    await userEvent.selectOptions(rowOf("2").querySelector("select")!, "ch");
    await userEvent.type(within(rowOf("2")).getByLabelText(/Số lượng/), "3");
    await userEvent.type(within(rowOf("2")).getByLabelText(/Đơn giá/), "1");
    await userEvent.selectOptions(rowOf("1").querySelector("select")!, "");
    await userEvent.clear(within(rowOf("1")).getByLabelText(/Số lượng/));
    await userEvent.clear(within(rowOf("1")).getByLabelText(/Đơn giá/));
    await userEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(sent.lines).toHaveLength(1);
    expect(
      await within(rowOf("2")).findByText(
        "GG-K17 tính theo cái, số lượng phải là số nguyên",
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf("1")).queryByText(
        "GG-K17 tính theo cái, số lượng phải là số nguyên",
      ),
    ).toBeNull();
  });

  it("says the draft was saved when only placing it failed", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { code: D3.code },
            error: null,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            data: null,
            error: "Nhà cung cấp NCC-0002 đã ngừng dùng",
          }),
          { status: 409 },
        ),
      );
    render(
      <OrderForm
        suppliers={SUPPLIERS}
        items={ITEMS}
        order={{ ...D3, status: "DRAFT" }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Lưu đơn" }));
    expect(
      await screen.findByText(
        "Đã lưu nháp, nhưng chưa đặt được: Nhà cung cấp NCC-0002 đã ngừng dùng",
      ),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("offers a reload when someone else saved first", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: PURCHASE_MESSAGES.stale,
        }),
        { status: 409 },
      ),
    );
    render(<OrderForm suppliers={SUPPLIERS} items={ITEMS} order={D3} />);
    await userEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(
      await screen.findByText(PURCHASE_MESSAGES.stale),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tải lại trang" }),
    ).toBeInTheDocument();
  });

  it("locks all but the schedule once goods came in", () => {
    render(
      <OrderForm
        suppliers={SUPPLIERS}
        items={ITEMS}
        order={{ ...D3, editable: "SCHEDULE" }}
      />,
    );
    expect(
      screen.getByText(PURCHASE_MESSAGES.editLocked),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nhà cung cấp / cai thầu")).toBeDisabled();
    expect(within(rowOf("1")).getByLabelText(/Số lượng Khung/)).toBeDisabled();
    expect(screen.getByLabelText("Ngày dự kiến nhập")).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Thêm dòng hàng/ })).toBeNull();
  });

  it("creates with Lưu đơn and opens D3b", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { code: "PO-2026-056" },
          error: null,
        }),
        { status: 201 },
      ),
    );
    render(<OrderForm suppliers={SUPPLIERS} items={ITEMS} />);
    await userEvent.selectOptions(
      screen.getByLabelText("Nhà cung cấp / cai thầu"),
      "s2",
    );
    await userEvent.selectOptions(rowOf("1").querySelector("select")!, "k17");
    await userEvent.type(within(rowOf("1")).getByLabelText(/Số lượng/), "10");
    await userEvent.type(
      within(rowOf("1")).getByLabelText(/Đơn giá/),
      "185000",
    );
    await userEvent.click(screen.getByRole("button", { name: "Lưu đơn" }));
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(sent).toMatchObject({
      place: true,
      supplierId: "s2",
      lines: [
        {
          itemId: "k17",
          unit: "PIECE",
          quantity: "10.000",
          unitPrice: 185_000,
        },
      ],
    });
    expect(push).toHaveBeenCalledWith(
      "/purchasing/orders/PO-2026-056?saved=placed",
    );
  });
});

describe("D3b", () => {
  it("offers cancel, not close, before goods arrive, and asks for a reason", async () => {
    render(
      <OrderActions
        code="PO-2026-055"
        status="IN_PROGRESS"
        hasReceipts={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Đóng đơn, không chờ nữa" }),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Hủy đơn" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Lý do hủy")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers close once goods came in", () => {
    render(
      <OrderActions code="PO-2026-051" status="IN_PROGRESS" hasReceipts />,
    );
    expect(
      screen.getByRole("button", { name: "Đóng đơn, không chờ nữa" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hủy đơn" })).toBeNull();
  });

  it("offers place and delete on a draft, nothing on a finished order", () => {
    const { unmount } = render(
      <OrderActions code="PO-2026-054" status="DRAFT" hasReceipts={false} />,
    );
    expect(screen.getByRole("button", { name: "Đặt đơn" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Xóa nháp" }),
    ).toBeInTheDocument();
    unmount();
    const { container } = render(
      <OrderActions code="PO-2026-050" status="DONE" hasReceipts />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the history newest first", () => {
    render(
      <OrderHistory
        events={[
          {
            id: 2,
            kind: "PLACED",
            actorName: "Quốc Bảo",
            note: null,
            createdAt: new Date("2026-10-23T09:05:00Z"),
          },
          {
            id: 1,
            kind: "CREATED",
            actorName: "Quốc Bảo",
            note: null,
            createdAt: new Date("2026-10-23T08:50:00Z"),
          },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "23/10 16:05 · Quốc Bảo gửi đơn cho kho",
      "23/10 15:50 · Quốc Bảo tạo đơn",
    ]);
  });
});

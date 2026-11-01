// M3 (goods-receipt task 8.2, spec goods-receipts "Màn nhập hàng M3").
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toMoney } from "@/domain/money";
import { dict } from "@/locales";
import { resetDraftRuntime } from "@/lib/drafts/runtime";
import { memoryDraftStore, setDraftStore } from "@/lib/drafts/store";
import type { ReceivingOrder } from "@/lib/receiving/receiving-order";

import { ReceiptFormView } from "./receipt-form";

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

const line = (
  id: string,
  code: string,
  name: string,
  ordered: number,
  unit: "PIECE" | "KG" = "PIECE",
) => ({
  orderLineId: id,
  itemCode: code,
  itemName: name,
  itemUnit: unit,
  lineUnit: unit,
  standardWeightKg: unit === "PIECE" ? "13.500" : null,
  orderedMilli: ordered,
  receivedMilli: 0,
  lastAwaitsRest: null,
});

const ORDER: ReceivingOrder = {
  code: "PO-2026-052",
  supplierName: "Anh Trần Văn Hùng",
  kind: "USED",
  allocationMethod: "VALUE",
  vehicle: "29H-123.45",
  tripNo: 1,
  lines: [
    line("khung", "GG-K17", "Khung giàn giáo 1,7m", 200_000),
    line("cheo", "GG-CH", "Chéo giàn giáo", 400_000),
    line("mam", "GG-M16", "Mâm giàn giáo 1,6m", 150_000),
    line("sat", "PL-SAT", "Phế liệu sắt lẫn", 1_250_500, "KG"),
  ],
  prefilledCosts: [
    { label: "Cước xe tải", amount: toMoney(3_500_000) },
    { label: "Bốc xếp", amount: toMoney(1_200_000) },
    { label: "Cầu đường", amount: toMoney(180_000) },
  ],
  expectedCosts: toMoney(4_880_000),
  yards: [{ id: "bai", code: "BAI-01", name: "Bãi chính" }],
  scrapPrice: { pricePerKg: toMoney(7_500), updated: "20/10/2026" },
};

const card = (name: string) => screen.getByRole("region", { name });

async function setQuantity(
  user: ReturnType<typeof userEvent.setup>,
  field: HTMLElement,
  value: string,
) {
  await user.clear(field);
  await user.type(field, `${value}{Enter}`);
}

async function countPieces(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  total: string,
  split: [string, string, string],
) {
  const box = card(name);
  await user.click(within(box).getByRole("button", { name: "Đếm" }));
  await setQuantity(
    user,
    within(box).getByLabelText(`Thực nhận ${name}`),
    total,
  );
  const [good, repair, scrap] = split;
  await setQuantity(user, within(box).getByLabelText("Tốt"), good);
  await setQuantity(user, within(box).getByLabelText("Chờ sửa"), repair);
  await setQuantity(user, within(box).getByLabelText("Phế liệu"), scrap);
}

async function fillTripOne(user: ReturnType<typeof userEvent.setup>) {
  await countPieces(user, "Khung giàn giáo 1,7m", "196", ["150", "34", "12"]);
  await countPieces(user, "Chéo giàn giáo", "400", ["380", "20", "0"]);
  await user.click(
    within(card("Mâm giàn giáo 1,6m")).getByRole("button", {
      name: "Chuyến này không có",
    }),
  );
  const sat = card("Phế liệu sắt lẫn");
  await user.click(within(sat).getByRole("button", { name: "Đếm" }));
  await setQuantity(
    user,
    within(sat).getByLabelText("Cân thực tế Phế liệu sắt lẫn"),
    "1250,5",
  );
}

const confirmButton = () =>
  screen.getByRole("button", { name: "Xác nhận nhập kho" });

function renderForm() {
  return render(<ReceiptFormView order={ORDER} userId="vantung" />);
}

describe("ReceiptFormView (M3)", () => {
  it("opens trip 1 with every line to do and the confirm button off", async () => {
    renderForm();
    expect(
      await screen.findByText("Chuyến 1 · 0/4 mã xong"),
    ).toBeInTheDocument();
    for (const open of ORDER.lines) {
      expect(card(open.itemName)).toHaveAttribute("data-done", "false");
    }
    expect(confirmButton()).toBeDisabled();
    expect(
      screen.getByText(
        'Đếm Khung giàn giáo 1,7m hoặc chọn "Chuyến này không có" để xác nhận',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("4.880.000 ₫")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Đã điền sẵn chi phí dự kiến của đơn. Sửa theo số thật trả nhà xe, bốc xếp.",
      ),
    ).toBeInTheDocument();
  });

  it("splits Khung, defaults the waits and lets the trip be confirmed", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByText("Chuyến 1 · 0/4 mã xong");
    await fillTripOne(user);
    const khung = card("Khung giàn giáo 1,7m");
    expect(within(khung).getByText("Đã chia đủ 196 cái")).toBeInTheDocument();
    expect(within(khung).getByText("Thiếu 4 so với đơn")).toBeInTheDocument();
    expect(
      within(khung).getByRole("checkbox", { name: "Chờ giao bù 4 cái thiếu" }),
    ).not.toBeChecked();
    expect(
      within(khung).getByText("Không tích: đơn tính theo 196 cái thực nhận."),
    ).toBeInTheDocument();
    expect(
      within(card("Mâm giàn giáo 1,6m")).getByRole("checkbox", {
        name: "Chờ chuyến sau",
      }),
    ).toBeChecked();
    expect(
      screen.getByText("Giá sắt vụn 7.500 ₫/kg, cập nhật 20/10/2026"),
    ).toBeInTheDocument();
    expect(screen.getByText("Chuyến 1 · 4/4 mã xong")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(
      Response.json(
        { success: true, data: { code: "PN-2026-094" }, error: null },
        { status: 201 },
      ),
    );
    await user.click(confirmButton());
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/m/receipts/PN-2026-094?posted=1"),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      orderCode: "PO-2026-052",
      locationId: "bai",
      vehicle: "29H-123.45",
      confirmedOverrides: [],
    });
    expect(body.lines).toEqual([
      expect.objectContaining({
        orderLineId: "khung",
        status: "COUNTED",
        quantity: "196.000",
        split: {
          NEW: "0.000",
          GOOD: "150.000",
          NEEDS_REPAIR: "34.000",
          SCRAP: "12.000",
        },
        awaitsRest: false,
      }),
      expect.objectContaining({ orderLineId: "cheo", quantity: "400.000" }),
      expect.objectContaining({
        orderLineId: "mam",
        status: "NOT_IN_TRIP",
        awaitsRest: true,
      }),
      expect.objectContaining({
        orderLineId: "sat",
        quantity: "1250.500",
        split: expect.objectContaining({ SCRAP: "1250.500" }),
      }),
    ]);
    expect(typeof body.draftId).toBe("string");
  });

  it("asks again about a stray zero, and asks again after a change (D5b)", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByText("Chuyến 1 · 0/4 mã xong");
    await fillTripOne(user);
    const cheo = card("Chéo giàn giáo");
    await setQuantity(
      user,
      within(cheo).getByLabelText("Thực nhận Chéo giàn giáo"),
      "4000",
    );
    await setQuantity(user, within(cheo).getByLabelText("Tốt"), "3980");
    await user.click(confirmButton());
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      dict.receiving.anomalies.quantityOver("4.000", "400", "cái"),
    );
    await user.click(within(dialog).getByRole("button", { name: "Sửa lại" }));
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(
      Response.json(
        { success: true, data: { code: "PN-2026-094" }, error: null },
        {
          status: 201,
        },
      ),
    );
    await user.click(confirmButton());
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Đúng, nhập 4.000 cái",
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.confirmedOverrides).toEqual(["line:cheo"]);
  });

  it("asks about trip costs above the order's expected costs", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByText("Chuyến 1 · 0/4 mã xong");
    await fillTripOne(user);
    const amount = screen.getByLabelText("Số tiền Cước xe tải");
    await user.clear(amount);
    await user.type(amount, "35000000");
    await user.click(confirmButton());
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      dict.receiving.anomalies.costsOver("36.380.000 ₫", "4.880.000 ₫"),
    );
  });

  it("shows a server field error under its line", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByText("Chuyến 1 · 0/4 mã xong");
    await fillTripOne(user);
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          success: false,
          data: { field: "lines.1.quantity" },
          error: "GG-CH tính theo cái, số lượng phải là số nguyên",
        },
        { status: 422 },
      ),
    );
    await user.click(confirmButton());
    expect(
      await within(card("Chéo giàn giáo")).findByRole("alert"),
    ).toHaveTextContent("GG-CH tính theo cái, số lượng phải là số nguyên");
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the draft and says so when the network is down", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByText("Chuyến 1 · 0/4 mã xong");
    await fillTripOne(user);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.click(confirmButton());
    expect(
      await screen.findByText("Chưa gửi được, sẽ tự gửi khi có mạng"),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("jumps to the line of a scanned code and says when it is not on the order", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByText("Chuyến 1 · 0/4 mã xong");
    await user.click(screen.getByRole("button", { name: "Quét mã" }));
    const input = await screen.findByLabelText("Không quét được? Nhập mã");
    await user.type(input, "GG-K15");
    await user.click(screen.getByRole("button", { name: "Tìm" }));
    expect(
      await screen.findByText("GG-K15 không có trong đơn PO-2026-052"),
    ).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "gg-m16");
    await user.click(screen.getByRole("button", { name: "Tìm" }));
    const mam = card("Mâm giàn giáo 1,6m");
    await waitFor(() =>
      expect(
        within(mam).getByLabelText("Thực nhận Mâm giàn giáo 1,6m"),
      ).toHaveFocus(),
    );
  });
});

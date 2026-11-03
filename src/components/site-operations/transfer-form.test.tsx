// D6b (site-operations task 6.2; spec site-transfers "Phiếu chuyển trên
// Desktop", "Ngày chuyển với tiền thuê hai hợp đồng", "Thuê tối thiểu khi
// chuyển công trình").
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import type { TransferForm as FormData } from "@/lib/site-transfers/queries";

import { TransferForm } from "./transfer-form";
import { minimumText, previewTransfer } from "./transfer-model";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const K = 1000;
const data: FormData = {
  from: {
    id: "a",
    code: "102026/ANPHAT-MINHPHAT",
    siteName: "An Phú",
    customerId: "minhphat",
    customerName: "Minh Phát",
  },
  items: [
    {
      itemId: "h17",
      code: "H1,7",
      name: "Khung giàn giáo 1,7m",
      unit: "PIECE",
      newMilli: 20 * K,
      goodMilli: 100 * K,
      dailyPrice: 1_200,
    },
    {
      itemId: "cheo",
      code: "CHEO1,7",
      name: "Chéo giàn giáo",
      unit: "PIECE",
      newMilli: 0,
      goodMilli: 260 * K,
      dailyPrice: 300,
    },
  ],
  targets: [
    {
      id: "b",
      code: "112026/ANPHAT-MINHPHAT",
      siteName: "Dương Nội",
      customerId: "minhphat",
      customerName: "Minh Phát",
      status: "APPROVED",
      prices: { h17: 1_200, cheo: 300 },
      remaining: { h17: 600 * K, cheo: 600 * K },
    },
    {
      id: "c",
      code: "112026/ANPHAT-HUNG",
      siteName: "Nhà anh Hùng",
      customerId: "hung",
      customerName: "Anh Hùng",
      status: "ACTIVE",
      prices: { h17: 1_200 },
      remaining: { h17: 10 * K },
    },
  ],
};
const today = "2026-11-05" as BusinessDate;

describe("previewTransfer", () => {
  it("works out the draw, the rent drop and còn phải giao", () => {
    const preview = previewTransfer(
      data.items,
      { h17: "50", cheo: "40" },
      data.targets[0] ?? null,
      "minhphat",
    );
    expect(preview.lines.map((line) => line.draw)).toEqual([
      "20 Mới · 30 Tốt",
      "40 Tốt",
    ]);
    expect(preview.dailyDrop).toBe(-72_000);
    expect(preview.lines[0]?.remainingAfter).toBe(550 * K);
    expect(preview.sameCustomer).toBe(true);
  });

  it("flags too many, items missing and going over", () => {
    const preview = previewTransfer(
      data.items,
      { h17: "130", cheo: "5" },
      data.targets[1] ?? null,
      "minhphat",
    );
    expect(preview.anyTooMany).toBe(true);
    expect(preview.anyMissing).toBe(true);
    expect(preview.anyOver).toBe(true);
    expect(preview.sameCustomer).toBe(false);
  });

  it("words the 45-day rule", () => {
    expect(minimumText(true, "An Phú", "Dương Nội")).toBe(
      "Cùng nhà thầu: hàng chuyển không tính tối thiểu 45 ngày ở An Phú, thuê nối tiếp sang Dương Nội.",
    );
    expect(minimumText(false, "An Phú", "Nhà anh Hùng")).toBe(
      "Khác nhà thầu: mỗi hợp đồng tính tối thiểu 45 ngày riêng.",
    );
  });
});

describe("TransferForm", () => {
  it("shows the draw and the effect on rent as counts are typed", async () => {
    const user = userEvent.setup();
    render(<TransferForm data={data} today={today} />);
    await user.selectOptions(screen.getByLabelText("Công trình nhận"), "b");
    await user.type(screen.getByLabelText("Số chuyển H1,7"), "50");
    await user.type(screen.getByLabelText("Số chuyển CHEO1,7"), "40");
    expect(screen.getByText("20 Mới · 30 Tốt")).toBeInTheDocument();
    expect(
      screen.getByText("Tiền thuê 1 ngày ở An Phú giảm 72.000 ₫"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Còn phải giao ở Dương Nội H1,7 600 → 550"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("An Phú (hợp đồng đi) tính đến hết 05/11"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Dương Nội (hợp đồng nhận) tính từ 06/11"),
    ).toBeInTheDocument();
  });

  it("asks for the tick of another customer", async () => {
    const user = userEvent.setup();
    render(<TransferForm data={data} today={today} />);
    await user.selectOptions(screen.getByLabelText("Công trình nhận"), "c");
    expect(
      screen.getByLabelText(/Hàng chuyển sang nhà thầu khác/),
    ).toBeInTheDocument();
  });

  it("shows the server's refusal", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error:
            "H1,7: số chuyển (130 cái) nhiều hơn số đang ở công trình An Phú (120 cái).",
        }),
        { status: 409 },
      ),
    );
    const user = userEvent.setup();
    render(<TransferForm data={data} today={today} />);
    await user.selectOptions(screen.getByLabelText("Công trình nhận"), "b");
    await user.type(screen.getByLabelText("Số chuyển H1,7"), "130");
    await user.click(screen.getByRole("button", { name: "Xác nhận chuyển" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "nhiều hơn số đang ở công trình",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("posts at once from the office", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { code: "CCT-2026-005" } }),
        { status: 201 },
      ),
    );
    const user = userEvent.setup();
    render(<TransferForm data={data} today={today} />);
    await user.selectOptions(screen.getByLabelText("Công trình nhận"), "b");
    await user.type(screen.getByLabelText("Số chuyển H1,7"), "50");
    await user.click(screen.getByRole("button", { name: "Xác nhận chuyển" }));
    expect(push).toHaveBeenCalledWith("/sales/site-transfers/CCT-2026-005");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ confirm: true });
  });
});

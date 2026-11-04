// D6d and M4 "Phiếu này là hàng đổi" (site-operations task 6.5; spec
// site-exchanges).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bodyOf } from "@/components/returns/return-model";
import { ReturnScreen } from "@/components/returns/return-screen";
import { resetDraftRuntime } from "@/lib/drafts/runtime";
import { memoryDraftStore, setDraftStore } from "@/lib/drafts/store";
import type { ExchangeForm as FormData } from "@/lib/exchanges/queries";

import { ExchangeForm } from "./exchange-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  setDraftStore(memoryDraftStore());
  resetDraftRuntime();
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  setDraftStore(null);
  vi.unstubAllGlobals();
});

const K = 1000;
const data: FormData = {
  contract: { id: "a", code: "102026/ANPHAT-MINHPHAT", siteName: "An Phú" },
  give: [
    {
      itemId: "c12",
      code: "CHEO1,2",
      name: "Chéo giàn giáo 1,2m",
      unit: "PIECE",
      dailyPrice: 280,
      yardStock: { bai: 1_840 * K },
    },
  ],
  take: [
    {
      itemId: "c17",
      code: "CHEO1,7",
      name: "Chéo giàn giáo 1,7m",
      unit: "PIECE",
      onSiteMilli: 260 * K,
      dailyPrice: 300,
    },
  ],
  yards: [{ id: "bai", code: "BAI-01", name: "Bãi chính" }],
  companyTruck: true,
  freightPerTrip: 1_800_000,
  nextBatchNo: 4,
};

describe("ExchangeForm", () => {
  it("previews the rent a day after the swap", async () => {
    const user = userEvent.setup();
    render(<ExchangeForm data={data} />);
    expect(screen.getByText("1.840 cái")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Số giao CHEO1,2"), "100");
    await user.type(screen.getByLabelText("Số nhận CHEO1,7"), "100");
    expect(screen.getByText("−2.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("100 × 300 ₫ → 100 × 280 ₫")).toBeInTheDocument();
    expect(screen.getByLabelText("Cước một chiều")).toHaveValue("1800000");
  });

  it("sends the batch and the items expected back", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { deliveryCode: "PX-2026-152" },
        }),
        { status: 201 },
      ),
    );
    const user = userEvent.setup();
    render(<ExchangeForm data={data} />);
    await user.type(screen.getByLabelText("Số giao CHEO1,2"), "100");
    await user.type(screen.getByLabelText("Số nhận CHEO1,7"), "100");
    await user.click(
      screen.getByRole("button", { name: "Tạo đợt xuất + chờ thu hồi" }),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/exchanges");
    expect(JSON.parse(String(init.body))).toMatchObject({
      contractId: "a",
      lines: [{ itemId: "c12", quantity: "100" }],
      expected: [{ itemId: "c17", quantity: "100" }],
      freightAmount: 1_800_000,
    });
    expect(push).toHaveBeenCalledWith("/sales/contracts/a/deliveries");
  });
});

describe("M4 with a waiting exchange", () => {
  const props = {
    userId: "vantung",
    contractId: "a",
    contractCode: "102026/ANPHAT-MINHPHAT",
    siteName: "An Phú",
    customerName: "Minh Phát",
    yards: [{ id: "bai", code: "BAI-01", name: "Bãi chính" }],
    items: [
      {
        itemId: "c17",
        code: "CHEO1,7",
        name: "Chéo giàn giáo 1,7m",
        unit: "PIECE" as const,
        onSiteMilli: 260 * K,
      },
    ],
    exchanges: [
      { id: "x1", deliveryCode: "PX-2026-152", expectedText: "100 CHEO1,7" },
    ],
  };

  it("shows the exchange and ticks it", async () => {
    render(<ReturnScreen {...props} />);
    expect(
      await screen.findByText("Đổi hàng PX-2026-152: dự kiến nhận 100 CHEO1,7"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Phiếu này là hàng đổi")).toBeChecked();
  });

  it("sends the exchange id only while ticked", () => {
    const payload = {
      contractId: "a",
      yardLocationId: "bai",
      vehiclePlate: "",
      note: "",
      opened: [],
      lines: {},
      photos: [],
      savedOnDeviceAt: null,
    };
    expect(bodyOf([], { ...payload, exchangeId: "x1" }, "t")).toMatchObject({
      exchangeId: "x1",
    });
    expect(
      bodyOf([], { ...payload, exchangeId: null }, "t"),
    ).not.toHaveProperty("exchangeId");
  });
});

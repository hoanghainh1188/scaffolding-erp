// /settings/scrap-price form (goods-receipt task 9.1).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScrapPriceForm } from "./scrap-price-form";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("ScrapPriceForm", () => {
  it("saves a new price and refreshes the page", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, data: {}, error: null }, { status: 201 }),
    );
    render(<ScrapPriceForm />);
    await user.type(screen.getByLabelText("Giá mới (₫/kg)"), "7.800");
    await user.type(
      screen.getByLabelText("Ghi chú (không bắt buộc)"),
      "Giá vựa tháng 11",
    );
    await user.click(screen.getByRole("button", { name: "Lưu giá" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      pricePerKg: 7_800,
      note: "Giá vựa tháng 11",
    });
  });

  it("refuses a price with a decimal before sending", async () => {
    const user = userEvent.setup();
    render(<ScrapPriceForm />);
    await user.type(screen.getByLabelText("Giá mới (₫/kg)"), "7500,5");
    await user.click(screen.getByRole("button", { name: "Lưu giá" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Giá sắt vụn phải là số nguyên lớn hơn 0",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's answer under its field", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          success: false,
          data: { field: "pricePerKg" },
          error: "Giá sắt vụn phải là số nguyên lớn hơn 0",
        },
        { status: 422 },
      ),
    );
    render(<ScrapPriceForm />);
    await user.type(screen.getByLabelText("Giá mới (₫/kg)"), "0");
    await user.click(screen.getByRole("button", { name: "Lưu giá" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Giá sắt vụn phải là số nguyên lớn hơn 0",
    );
  });
});

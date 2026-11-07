import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RepairLaborRate } from "./repair-labor-rate";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const k17 = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "GG-K17",
  unitLabel: "cái",
  repairLaborRate: 40_000,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RepairLaborRate (spec item-catalog: đơn giá công sửa / cái)", () => {
  it("shows the rate read-only without repairs.manage", () => {
    render(<RepairLaborRate item={k17} canEdit={false} />);
    expect(screen.getByText(/Công sửa:/).parentElement).toHaveTextContent(
      "Công sửa: 40.000 ₫ / cái",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows Chưa đặt when no rate is set", () => {
    render(
      <RepairLaborRate
        item={{ ...k17, repairLaborRate: null }}
        canEdit={false}
      />,
    );
    expect(screen.getByText(/Chưa đặt/)).toBeInTheDocument();
  });

  it("saves the rate through its own route for the accountant", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ success: true, data: {}, error: null }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairLaborRate item={k17} canEdit />);
    const input = screen.getByLabelText("Đơn giá công sửa / cái (GG-K17)");
    await userEvent.clear(input);
    await userEvent.type(input, "45.000");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`/api/catalog/items/${k17.id}/repair-labor-rate`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ repairLaborRate: 45_000 });
  });
});

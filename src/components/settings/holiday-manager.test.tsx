// /settings/holidays (rental-billing task 6.1).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HolidayManager, type HolidayItem } from "./holiday-manager";

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

const row = (extra: Partial<HolidayItem> = {}): HolidayItem => ({
  id: "h1",
  name: "Giỗ Tổ Hùng Vương",
  startDate: "2027-04-16",
  endDate: "2027-04-16",
  days: 1,
  updatedAt: "2026-11-04T02:00:00.000Z",
  locked: false,
  ...extra,
});

describe("HolidayManager", () => {
  it("lists the year with links to the years around it", () => {
    render(
      <HolidayManager
        year={2027}
        rows={[
          row({
            id: "t",
            name: "Tết Nguyên đán",
            startDate: "2027-02-05",
            endDate: "2027-02-13",
            days: 9,
          }),
        ]}
        lockReason={null}
      />,
    );
    expect(screen.getByText("Năm 2027")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 2026" })).toHaveAttribute(
      "href",
      "/settings/holidays?year=2026",
    );
    expect(screen.getByText("05/02/2027 – 13/02/2027")).toBeInTheDocument();
  });

  it("asks before deleting and sends the version it saw", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, data: { id: "h1" }, error: null }),
    );
    render(<HolidayManager year={2027} rows={[row()]} lockReason={null} />);
    await user.click(
      screen.getByRole("button", { name: "Xóa Giỗ Tổ Hùng Vương" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        'Xóa ngày nghỉ "Giỗ Tổ Hùng Vương" (16/04/2027)? Tiền thuê kỳ chưa chốt sẽ tính lại ngày đó.',
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Xóa" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/holidays/h1");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      updatedAt: "2026-11-04T02:00:00.000Z",
    });
  });

  it("locks a row of a closed period", () => {
    render(
      <HolidayManager
        year={2027}
        rows={[row({ locked: true })]}
        lockReason="Đã có kỳ chốt đến 30/04/2027 nên ngày nghỉ trước ngày đó không đổi được."
      />,
    );
    expect(screen.getByText("Đã khóa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sửa Giỗ Tổ/ })).toBeNull();
  });

  it("shows the overlap the server refuses", async () => {
    const user = userEvent.setup();
    const error =
      'Ngày 13/02/2027 đã nằm trong "Tết Nguyên đán". Bạn sửa dòng đó hoặc chọn ngày khác.';
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { success: false, data: { field: "startDate" }, error },
        { status: 422 },
      ),
    );
    render(<HolidayManager year={2027} rows={[]} lockReason={null} />);
    await user.click(screen.getByRole("button", { name: "Thêm ngày nghỉ" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Tên"), "Nghỉ bù");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await within(dialog).findByText(error)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

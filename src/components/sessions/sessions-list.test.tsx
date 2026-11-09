import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeviceSessionRow } from "@/domain/device-session";
import { callApi } from "@/lib/api-client";

import { SessionsList } from "./sessions-list";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("@/lib/api-client", () => ({ callApi: vi.fn() }));

const api = vi.mocked(callApi);

const row = (
  id: string,
  deviceName: string,
  isCurrent = false,
): DeviceSessionRow => ({
  id,
  deviceName,
  signedIn: "Hôm nay, 07:52",
  lastActive: "Hôm nay, 06:50",
  isCurrent,
});

const THREE = [
  row("a", "Máy tính · Edge", true),
  row("b", "Điện thoại · Chrome"),
  row("c", "Máy tính · Chrome"),
];

beforeEach(() => {
  api.mockReset();
  refresh.mockReset();
});

const button = (name: string | RegExp) => screen.getByRole("button", { name });

describe("SessionsList", () => {
  it("marks this device and gives it no sign-out button", () => {
    render(<SessionsList rows={THREE} twoFactorEnabled={false} />);
    expect(screen.getByText("Máy này")).toBeInTheDocument();
    expect(screen.getByText(/Đang dùng/)).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Đăng xuất máy này" }),
    ).toHaveLength(2);
    expect(
      screen.getByText("Bạn đang đăng nhập ở 3 thiết bị.", { exact: false }),
    ).toBeInTheDocument();
  });

  it("turns the bulk button off with no other device", () => {
    render(
      <SessionsList rows={[row("a", "Máy tính", true)]} twoFactorEnabled />,
    );
    expect(button("Đăng xuất mọi máy khác")).toBeDisabled();
    expect(screen.getByText("Không có máy nào khác.")).toBeInTheDocument();
  });

  it("confirms, signs one device out and refreshes", async () => {
    api.mockResolvedValue({ ok: true, data: { signedOut: true } });
    render(<SessionsList rows={THREE} twoFactorEnabled={false} />);
    await userEvent.click(
      screen.getAllByRole("button", { name: "Đăng xuất máy này" })[0]!,
    );
    expect(api).not.toHaveBeenCalled();
    await userEvent.click(button("Đăng xuất"));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/me/sessions/b/sign-out", {
        method: "POST",
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("reminds a 2FA user about trusted devices for one device", async () => {
    render(<SessionsList rows={THREE} twoFactorEnabled />);
    await userEvent.click(
      screen.getAllByRole("button", { name: "Đăng xuất máy này" })[0]!,
    );
    expect(
      screen.getByRole("link", { name: "Xác thực 2 lớp" }),
    ).toHaveAttribute("href", "/two-factor");
  });

  it("has no trusted-device reminder without 2FA", async () => {
    render(<SessionsList rows={THREE} twoFactorEnabled={false} />);
    await userEvent.click(
      screen.getAllByRole("button", { name: "Đăng xuất máy này" })[0]!,
    );
    expect(screen.queryByRole("link", { name: "Xác thực 2 lớp" })).toBeNull();
  });

  it("says trusted devices go too, for a 2FA user", async () => {
    render(<SessionsList rows={THREE} twoFactorEnabled />);
    await userEvent.click(button("Đăng xuất mọi máy khác"));
    expect(
      screen.getByText("Các máy đã tin cũng bị quên, lần sau phải nhập mã", {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("does not mention trusted devices without 2FA", async () => {
    render(<SessionsList rows={THREE} twoFactorEnabled={false} />);
    await userEvent.click(button("Đăng xuất mọi máy khác"));
    expect(screen.queryByText(/Các máy đã tin/)).toBeNull();
  });

  it("reports both counts after the bulk sign-out", async () => {
    api.mockResolvedValue({ ok: true, data: { count: 2, forgotten: 2 } });
    render(<SessionsList rows={THREE} twoFactorEnabled />);
    await userEvent.click(button("Đăng xuất mọi máy khác"));
    await userEvent.click(button("Đăng xuất 2 máy"));
    expect(
      await screen.findByText("Đã đăng xuất 2 máy. Đã quên 2 máy đã tin."),
    ).toBeInTheDocument();
  });

  it("reports a device already signed out and refreshes", async () => {
    api.mockResolvedValue({
      ok: false,
      error: "Thiết bị này đã đăng xuất. Danh sách đã cập nhật.",
    });
    render(<SessionsList rows={THREE} twoFactorEnabled={false} />);
    await userEvent.click(
      screen.getAllByRole("button", { name: "Đăng xuất máy này" })[0]!,
    );
    await userEvent.click(button("Đăng xuất"));
    expect(
      await screen.findByText(/Thiết bị này đã đăng xuất/),
    ).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });
});

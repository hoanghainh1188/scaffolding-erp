import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TwoFactorManage } from "./two-factor-manage";

vi.mock("@/lib/api-client", () => ({ callApi: vi.fn() }));

describe("TwoFactorManage", () => {
  it("shows counts and never a code", () => {
    render(<TwoFactorManage backupCodesLeft={9} trustedDevices={2} />);
    expect(screen.getByText("Còn 9 mã dự phòng")).toBeInTheDocument();
    expect(screen.getByText(/Đang tin 2 thiết bị/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("offers the three actions", () => {
    render(<TwoFactorManage backupCodesLeft={10} trustedDevices={0} />);
    for (const name of [
      "Tạo lại mã",
      "Quên mọi thiết bị đã tin",
      "Đổi điện thoại",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });
});

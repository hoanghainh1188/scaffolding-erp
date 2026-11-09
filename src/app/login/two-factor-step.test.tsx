import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TwoFactorStep } from "./two-factor-step";

const renderStep = (error: string | null = null) =>
  render(
    <TwoFactorStep
      action={vi.fn()}
      pending={false}
      error={error}
      username="minhanh"
      next={null}
    />,
  );

describe("TwoFactorStep", () => {
  it("asks for six digits with the phone keypad", () => {
    renderStep();
    const input = screen.getByLabelText("Mã 6 số");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("maxlength", "6");
    expect(screen.getByText(/tài khoản minhanh/)).toBeInTheDocument();
  });

  it("offers to trust the device, unticked", () => {
    renderStep();
    expect(
      screen.getByRole("checkbox", { name: /Tin thiết bị này 30 ngày/ }),
    ).not.toBeChecked();
  });

  it("switches to a backup code, without the trust box", async () => {
    renderStep();
    await userEvent.click(
      screen.getByRole("button", { name: "Dùng mã dự phòng" }),
    );
    expect(screen.getByLabelText("Mã dự phòng")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Dùng mã từ ứng dụng" }),
    );
    expect(screen.getByLabelText("Mã 6 số")).toBeInTheDocument();
  });

  it("announces an error", () => {
    renderStep("Mã xác thực không đúng");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Mã xác thực không đúng",
    );
  });
});

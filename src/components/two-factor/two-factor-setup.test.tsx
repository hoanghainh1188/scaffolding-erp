import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callApi } from "@/lib/api-client";

import { TwoFactorSetup } from "./two-factor-setup";

vi.mock("@/lib/api-client", () => ({ callApi: vi.fn() }));
vi.mock("@/lib/auth/actions", () => ({ signOutAction: vi.fn() }));

const api = vi.mocked(callApi);
const SETUP = {
  totpUri: "otpauth://totp/A:b?secret=JBSWY3DP&issuer=A",
  secretText: "JBSW Y3DP",
  backupCodes: ["7KQ2-M9XA-P4TR-H6ZD", "3JW8-R2NB-F7VC-Q5KY"],
};

beforeEach(() => api.mockReset());

async function toScan() {
  render(<TwoFactorSetup doneHref="/dashboard" />);
  api.mockResolvedValueOnce({ ok: true, data: SETUP });
  await userEvent.type(screen.getByLabelText("Mật khẩu hiện tại"), "bai sau");
  await userEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
  await screen.findByTestId("two-factor-secret");
}

describe("TwoFactorSetup", () => {
  it("stays on the first step and shows a wrong password", async () => {
    render(<TwoFactorSetup doneHref="/dashboard" />);
    api.mockResolvedValueOnce({
      ok: false,
      error: "Mật khẩu hiện tại không đúng",
    } as never);
    await userEvent.type(screen.getByLabelText("Mật khẩu hiện tại"), "sai");
    await userEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mật khẩu hiện tại không đúng",
    );
  });

  it("shows the QR code and the key to type", async () => {
    await toScan();
    expect(screen.getByRole("img", { name: /Mã QR/ })).toBeInTheDocument();
    expect(screen.getByTestId("two-factor-secret")).toHaveTextContent(
      "JBSW Y3DP",
    );
  });

  it("shows the backup codes only after the code is right", async () => {
    await toScan();
    expect(screen.queryByText("7KQ2-M9XA-P4TR-H6ZD")).toBeNull();
    api.mockResolvedValueOnce({ ok: true, data: { enabled: true } });
    await userEvent.type(screen.getByLabelText(/Mã 6 số/), "492817");
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByText("7KQ2-M9XA-P4TR-H6ZD")).toBeInTheDocument();
  });

  it("will not finish before the codes are marked as saved", async () => {
    await toScan();
    api.mockResolvedValueOnce({ ok: true, data: { enabled: true } });
    await userEvent.type(screen.getByLabelText(/Mã 6 số/), "492817");
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    const finish = await screen.findByRole("button", { name: "Hoàn tất" });
    expect(finish).toBeDisabled();
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Tôi đã lưu các mã này" }),
    );
    await waitFor(() => expect(finish).toBeEnabled());
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CompanyProfile } from "@/domain/company";

import { CompanyProfileForm } from "./company-profile-form";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const initial: CompanyProfile = {
  name: "Công ty Cổ phần Cơ khí An Phát",
  shortName: "An Phát",
  taxId: "0101234567",
  address: "123 Đường Giải Phóng, Hà Nội",
  phone: "0243888888",
  email: "contact@anphat.vn",
  website: "https://anphat.vn",
  bankAccount: "1903123456789",
  bankName: "Techcombank",
  logoUrl: "https://anphat.vn/logo.png",
  updatedBy: "u1",
  updatedAt: "2026-10-31T10:00:00Z",
};

describe("CompanyProfileForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders form with initial profile data", () => {
    render(<CompanyProfileForm initialProfile={initial} />);
    expect(screen.getByLabelText(/Tên công ty/)).toHaveValue(
      "Công ty Cổ phần Cơ khí An Phát",
    );
    expect(screen.getByLabelText(/Mã số thuế/)).toHaveValue("0101234567");
    expect(screen.getByLabelText(/Số điện thoại/)).toHaveValue("0243888888");
  });

  it("shows validation error and prevents submit when required name is cleared", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<CompanyProfileForm initialProfile={initial} />);

    const nameInput = screen.getByLabelText(/Tên công ty/);
    await user.clear(nameInput);

    await user.click(screen.getByRole("button", { name: "Lưu thông tin" }));

    expect(screen.getByText("Tên công ty không được để trống")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits updated data to /api/settings/company and shows success alert", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: initial }),
    } as Response);

    render(<CompanyProfileForm initialProfile={initial} />);

    const shortNameInput = screen.getByLabelText(/Tên viết tắt/);
    await user.clear(shortNameInput);
    await user.type(shortNameInput, "An Phát Mới");

    await user.click(screen.getByRole("button", { name: "Lưu thông tin" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/settings/company",
        expect.objectContaining({
          method: "PUT",
          headers: { "content-type": "application/json" },
        }),
      );
    });

    expect(
      screen.getByText("Đã lưu thông tin công ty thành công."),
    ).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("displays server error message on failure", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: "Lỗi lưu dữ liệu máy chủ" }),
    } as Response);

    render(<CompanyProfileForm initialProfile={initial} />);

    await user.click(screen.getByRole("button", { name: "Lưu thông tin" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Lỗi lưu dữ liệu máy chủ",
      );
    });
  });
});

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CustomerRow, SupplierRow } from "@/lib/catalog/partners";
import type { SiteRow } from "@/lib/catalog/places";

import { CustomerDetail, SupplierDetail } from "./partner-details";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

const MINH_PHAT: CustomerRow = {
  id: "c1",
  code: "NT-0001",
  kind: "COMPANY",
  name: "Cty TNHH Xây dựng Minh Phát",
  taxCode: "0109876543",
  contactName: "Anh Đỗ Mạnh · chỉ huy trưởng",
  phone: "0912345678",
  address: "Số 18, ngõ 72 Nguyễn Trãi, Thanh Xuân, Hà Nội",
  paymentTermsDays: 30,
  note: null,
  status: "ACTIVE",
  siteCount: 2,
};

const site = (id: string, code: string, name: string): SiteRow => ({
  id,
  code,
  name,
  address: "Hà Nội",
  customerId: "c1",
  customerCode: "NT-0001",
  customerName: MINH_PHAT.name,
  locationId: `l-${id}`,
  status: "ACTIVE",
});

const SELLER: SupplierRow = {
  id: "s1",
  code: "NCC-0002",
  kind: "PERSON",
  name: "Chú Ba ve chai",
  phone: null,
  address: null,
  taxCode: null,
  idNumberMasked: "•••• •••• 2345",
  bankAccountMasked: "•••• 5678",
  bankName: null,
  note: null,
  status: "ACTIVE",
};

describe("D16 customer detail", () => {
  it("shows the term, the grouped phone and the sites", () => {
    render(
      <CustomerDetail
        customer={MINH_PHAT}
        sites={[
          site("s1", "CT-0001", "Chung cư An Phú – Block B"),
          site("s2", "CT-0002", "Trường THCS Dương Nội"),
        ]}
        canEdit
      />,
    );
    expect(screen.getByText("30 ngày")).toBeInTheDocument();
    expect(screen.getByText("0912 345 678")).toBeInTheDocument();
    expect(screen.getByText("0109876543")).toBeInTheDocument();
    const list = within(screen.getByRole("region", { name: "Công trình" }));
    expect(list.getAllByRole("link")).toHaveLength(2);
    expect(list.getByText("Chung cư An Phú – Block B")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Thêm công trình" }),
    ).toBeInTheDocument();
  });

  it("offers no edit to someone who may only read", () => {
    render(<CustomerDetail customer={MINH_PHAT} sites={[]} canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Sửa thông tin" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Thêm công trình" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Ngừng dùng" })).toBeNull();
  });
});

describe("D16 supplier detail", () => {
  it("shows only the last 4 digits of the CCCD and the bank account", () => {
    render(
      <SupplierDetail
        supplier={{ ...SELLER, bankName: "Vietcombank" }}
        canEdit
      />,
    );
    expect(screen.getByText("•••• •••• 2345")).toBeInTheDocument();
    expect(screen.getByText("•••• 5678 · Vietcombank")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{12}/);
  });

  it("leaves out the CCCD line when there is none", () => {
    render(
      <SupplierDetail supplier={{ ...SELLER, idNumberMasked: null }} canEdit />,
    );
    expect(screen.queryByText("Số CCCD")).toBeNull();
  });
});

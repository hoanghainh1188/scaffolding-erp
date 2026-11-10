import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CustomerRow, SupplierRow } from "@/lib/catalog/partners";
import type { SiteRow } from "@/lib/catalog/places";

import { CustomerDetail, SiteDetail, SupplierDetail } from "./partner-details";
import { SITE_FIELDS, SUPPLIER_FIELDS } from "./partner-form-fields";
import { RecordFormSheet } from "./record-form-sheet";
import { UrlSelect } from "./url-select";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace }),
  usePathname: () => "/catalog/partners",
  useSearchParams: () => new URLSearchParams("tab=sites"),
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
  salesUser: null,
  status: "ACTIVE",
  siteCount: 2,
};

const site = (id: string, code: string, name: string): SiteRow => ({
  id,
  code,
  name,
  address: "Hà Nội",
  province: "BNI",
  provinceName: "Bắc Ninh",
  region: "NORTH",
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
  bankAccountLast4: "5678",
  anonymized: false,
  paymentTermsDays: 0,
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
  it("shows an account without a bank name", () => {
    render(<SupplierDetail supplier={SELLER} canEdit />);
    expect(screen.getByText("···5678")).toBeInTheDocument();
  });

  it("offers an erased seller no edit, reuse or erasure", () => {
    render(
      <SupplierDetail
        supplier={{ ...SELLER, anonymized: true, status: "ARCHIVED" }}
        canEdit
        canAnonymize
      />,
    );
    expect(screen.queryByRole("button", { name: "Sửa thông tin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dùng lại" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Ẩn danh theo yêu cầu" }),
    ).toBeNull();
  });

  it("offers erasure only with the permission, only for a person", () => {
    const button = () =>
      screen.queryByRole("button", { name: "Ẩn danh theo yêu cầu" });
    const { rerender } = render(
      <SupplierDetail supplier={SELLER} canEdit canAnonymize={false} />,
    );
    expect(button()).toBeNull();
    rerender(
      <SupplierDetail
        supplier={{ ...SELLER, kind: "COMPANY" }}
        canEdit
        canAnonymize
      />,
    );
    expect(button()).toBeNull();
    rerender(<SupplierDetail supplier={SELLER} canEdit canAnonymize />);
    expect(button()).toBeInTheDocument();
  });

  it("asks for the code and the date, and sends them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {}, error: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SupplierDetail
        supplier={SELLER}
        canEdit
        canAnonymize
        today="2026-11-10"
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Ẩn danh theo yêu cầu" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/Không hoàn tác được/)).toBeInTheDocument();
    await userEvent.type(dialog.getByLabelText(/Nhập mã NCC-0002/), "NCC-0002");
    await userEvent.type(
      dialog.getByLabelText("Ngày nhận yêu cầu"),
      "09/11/2026",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Ẩn danh" }));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/catalog/suppliers/s1/anonymize");
    expect(JSON.parse(String(init.body))).toEqual({
      confirmCode: "NCC-0002",
      requestedOn: "2026-11-09",
    });
    vi.unstubAllGlobals();
  });
});

describe("D16 seller form notice", () => {
  const NOTICE = "An Phát lưu các thông tin sau của ông/bà.";

  function openForm(extra: Record<string, unknown> = {}) {
    render(
      <RecordFormSheet
        title="Thêm nhà cung cấp"
        trigger={<button type="button">Mở</button>}
        fields={SUPPLIER_FIELDS}
        values={{ kind: "PERSON" }}
        withDataNotice
        noticeText={NOTICE}
        path="/api/catalog/suppliers"
        method="POST"
        submitLabel="Lưu"
        {...extra}
      />,
    );
    return userEvent.click(screen.getByRole("button", { name: "Mở" }));
  }

  const tick = () => screen.queryByLabelText("Đã thông báo cho người bán");

  it("is hidden with only a name", async () => {
    await openForm();
    await userEvent.type(screen.getByLabelText("Tên nhà cung cấp"), "Chú Ba");
    expect(tick()).toBeNull();
  });

  it("appears when a person's phone is typed", async () => {
    await openForm();
    await userEvent.type(screen.getByLabelText("Điện thoại"), "0912345678");
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(tick()).toBeInTheDocument();
  });

  it("follows the kind of seller", async () => {
    await openForm();
    await userEvent.type(screen.getByLabelText("Điện thoại"), "0912345678");
    expect(tick()).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Loại"), "COMPANY");
    expect(tick()).toBeNull();
  });

  it("appears for any CCCD, even a company's", async () => {
    await openForm({ values: { kind: "COMPANY" } });
    await userEvent.type(
      screen.getByLabelText("Số CCCD (cá nhân)"),
      "000203012345",
    );
    expect(tick()).toBeInTheDocument();
  });

  it("sends the tick", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {}, error: null }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await openForm();
    await userEvent.type(screen.getByLabelText("Tên nhà cung cấp"), "Anh Tâm");
    await userEvent.type(screen.getByLabelText("Điện thoại"), "0912345678");
    await userEvent.click(tick() as HTMLElement);
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      dataNoticeConfirmed: true,
    });
    vi.unstubAllGlobals();
  });

  it("does not send the tick when no notice is needed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {}, error: null }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await openForm();
    await userEvent.type(screen.getByLabelText("Tên nhà cung cấp"), "Chú Ba");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty(
      "dataNoticeConfirmed",
    );
    vi.unstubAllGlobals();
  });

  it("shows who recorded the notice instead of asking again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              kind: "PERSON",
              phone: "0912345678",
              notice: { text: NOTICE },
              dataNotice: { at: "2026-11-10T08:00:00Z", byName: "Thu Hà" },
            },
            error: null,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    await openForm({ loadValues: "/api/x/edit", method: "PATCH" });
    expect(
      await screen.findByText(/Đã thông báo ngày\s+10\/11\/2026,\s+Thu Hà/),
    ).toBeInTheDocument();
    expect(tick()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("renders a checkbox field and sends a boolean", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {}, error: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RecordFormSheet
        title="T"
        trigger={<button type="button">Mở</button>}
        fields={[{ name: "flag", label: "Cờ", kind: "checkbox" }]}
        path="/x"
        method="POST"
        submitLabel="Lưu"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mở" }));
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    let [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ flag: false });
    await userEvent.click(screen.getByRole("button", { name: "Mở" }));
    await userEvent.click(screen.getByLabelText("Cờ"));
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ flag: true });
    vi.unstubAllGlobals();
  });
  it("shows only the last 4 digits of the CCCD and the bank account", () => {
    render(
      <SupplierDetail
        supplier={{ ...SELLER, bankName: "Vietcombank" }}
        canEdit
      />,
    );
    expect(screen.getByText("•••• •••• 2345")).toBeInTheDocument();
    expect(screen.getByText("Vietcombank ···5678")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{12}/);
  });

  it("shows the payment terms of the seller (payables, 0.2 #99)", () => {
    const { rerender } = render(
      <SupplierDetail supplier={SELLER} canEdit={false} />,
    );
    expect(screen.getByText("Trả ngay khi nhập")).toBeInTheDocument();
    rerender(
      <SupplierDetail
        supplier={{ ...SELLER, paymentTermsDays: 30 }}
        canEdit={false}
      />,
    );
    expect(screen.getByText("Nợ 30 ngày")).toBeInTheDocument();
  });

  it("leaves out the CCCD line when there is none", () => {
    render(
      <SupplierDetail supplier={{ ...SELLER, idNumberMasked: null }} canEdit />,
    );
    expect(screen.queryByText("Số CCCD")).toBeNull();
  });
});

describe("D16 catalog-extensions", () => {
  it("shows a locked person in charge with (đã khóa)", () => {
    render(
      <CustomerDetail
        customer={{
          ...MINH_PHAT,
          salesUser: { id: "u1", name: "Khang", active: false },
        }}
        sites={[]}
        canEdit={false}
      />,
    );
    expect(screen.getByText("Khang (đã khóa)")).toBeInTheDocument();
  });

  it("shows the province and region of a site, or Chưa chọn", () => {
    const { rerender } = render(
      <SiteDetail site={site("s1", "CT-0001", "An Phú")} canEdit={false} />,
    );
    expect(screen.getByText("Bắc Ninh")).toBeInTheDocument();
    expect(screen.getByText("Miền Bắc")).toBeInTheDocument();
    rerender(
      <SiteDetail
        site={{
          ...site("s1", "CT-0001", "An Phú"),
          province: null,
          provinceName: null,
          region: null,
        }}
        canEdit={false}
      />,
    );
    expect(screen.getByText("Chưa chọn")).toBeInTheDocument();
    expect(screen.getByText("Chưa rõ")).toBeInTheDocument();
  });

  it("puts ?region=SOUTH on the URL for Miền Nam", async () => {
    const user = userEvent.setup();
    replace.mockClear();
    render(
      <UrlSelect
        id="filter-region"
        label="Khu vực"
        param="region"
        allLabel="Tất cả khu vực"
        clears={["province"]}
        options={[
          { value: "NORTH", label: "Miền Bắc" },
          { value: "SOUTH", label: "Miền Nam" },
        ]}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Khu vực"), "SOUTH");
    expect(replace).toHaveBeenCalledWith(
      "/catalog/partners?tab=sites&region=SOUTH",
    );
  });

  it("puts ?sales=none on the URL for customers nobody is in charge of", async () => {
    const user = userEvent.setup();
    replace.mockClear();
    render(
      <UrlSelect
        id="filter-sales"
        label="Nhân viên phụ trách"
        param="sales"
        allLabel="Tất cả nhân viên"
        options={[
          { value: "none", label: "Chưa có người phụ trách" },
          { value: "u1", label: "Khang" },
        ]}
      />,
    );
    await user.selectOptions(
      screen.getByLabelText("Nhân viên phụ trách"),
      "none",
    );
    expect(replace).toHaveBeenCalledWith(
      "/catalog/partners?tab=sites&sales=none",
    );
  });

  it("asks for a province before sending a new site", async () => {
    const user = userEvent.setup();
    const fetch = vi.spyOn(globalThis, "fetch");
    render(
      <RecordFormSheet
        title="Thêm công trình"
        trigger={<button type="button">Thêm công trình</button>}
        fields={SITE_FIELDS}
        path="/api/catalog/sites"
        method="POST"
        submitLabel="Lưu công trình"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Thêm công trình" }));
    await user.type(screen.getByLabelText("Tên công trình"), "Long Hậu");
    await user.click(screen.getByRole("button", { name: "Lưu công trình" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Chọn tỉnh/thành của công trình",
    );
    expect(fetch).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Tìm tỉnh/thành"), "tay ninh");
    const select = screen.getByLabelText("Tỉnh/thành");
    expect(within(select).getAllByRole("option")).toHaveLength(2);
    await user.selectOptions(select, "TNI");
    expect(select).toHaveValue("TNI");
  });
});

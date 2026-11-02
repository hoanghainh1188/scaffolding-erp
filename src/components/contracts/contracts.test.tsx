// D4, D5, D5a, D5b components (contracts tasks 7.1–7.5).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContractListRow } from "@/lib/contracts/list";
import type {
  AmendmentDetail,
  FormOptions,
  RevisionView,
} from "@/lib/contracts/queries";

import { AmendmentForm } from "./amendment-form";
import { ApprovalBar } from "./approval-bar";
import { ContractFilters } from "./contract-filters";
import { ContractForm } from "./contract-form";
import { ContractGroups, contractListHref } from "./contract-groups";
import { ContractTable } from "./contract-table";
import { printTitle } from "./print-title";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push }),
  usePathname: () => "/sales/contracts",
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

const item = (
  id: string,
  code: string,
  name: string,
  dailyRentalPrice: number | null,
): FormOptions["items"][number] => ({
  id,
  code,
  name,
  unit: "PIECE",
  standardWeightKg: "13.5",
  dailyRentalPrice,
  lostPrice: 350_000,
  damagePrice: 60_000,
});

const OPTIONS: FormOptions = {
  customers: [
    {
      id: "c1",
      code: "NT-0001",
      name: "Cty TNHH Xây dựng Minh Phát",
      paymentTermsDays: 30,
      salesUserName: "Quốc Bảo",
    },
  ],
  sites: [
    {
      id: "s1",
      code: "CT-0002",
      name: "Trường THCS Dương Nội",
      customerId: "c1",
      address: "Hà Đông, Hà Nội",
    },
  ],
  items: [
    item("k17", "GG-K17", "Khung giàn giáo 1,7m", 1200),
    item("ch", "GG-CH", "Chéo giàn giáo", 300),
    item("m16", "GG-M16", "Mâm giàn giáo 1,6m", 900),
    item("ku", "PK-KU", "Kích tăng U", 450),
  ],
  kits: [
    {
      id: "bo17",
      code: "BO-17",
      name: "Bộ giàn giáo 1,7m",
      components: [
        { itemId: "k17", quantity: 2 },
        { itemId: "ch", quantity: 2 },
        { itemId: "m16", quantity: 1 },
      ],
    },
  ],
  types: ["RENTAL", "SALE"],
};

describe("D4", () => {
  it("shows the four tiles with their counts", () => {
    render(
      <ContractGroups
        active="pending"
        counts={{ all: 42, pending: 2, active: 9, ended: 31 }}
        hrefOf={(group) => `/sales/contracts?group=${group}`}
      />,
    );
    const links = screen.getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual([
      "Tất cả · 42",
      "Chờ duyệt · 2",
      "Đang hiệu lực · 9",
      "Đã kết thúc · 31",
    ]);
    expect(screen.getByRole("link", { name: "Chờ duyệt · 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the filters and drops the page when changing the group", () => {
    expect(
      contractListHref({ q: "MINHPHAT", page: "3" }, { group: "active" }),
    ).toBe("/sales/contracts?q=MINHPHAT&group=active");
  });

  it("hides the type filter from a one-type seller", () => {
    const { rerender } = render(
      <ContractFilters types={["RENTAL"]} sellers={[]} />,
    );
    expect(screen.queryByLabelText("Loại")).toBeNull();
    rerender(<ContractFilters types={["RENTAL", "SALE"]} sellers={[]} />);
    expect(screen.getByLabelText("Loại")).toBeInTheDocument();
  });

  it("shows a row with its period, value and guarantee warning", () => {
    const row: ContractListRow = {
      id: "1",
      code: "112026/ANPHAT-MINHPHAT",
      type: "RENTAL",
      customerName: "Cty TNHH Xây dựng Minh Phát",
      siteName: "Trường THCS Dương Nội",
      status: "APPROVED",
      startDate: "2026-11-01",
      endDate: "2027-03-21",
      value: 186_200_000,
      warnings: ["Bảo lãnh BL-2026-1188 còn 30 ngày (hết hạn 31/03/2027)"],
    };
    render(
      <ContractTable
        rows={[
          row,
          {
            ...row,
            id: "2",
            code: "102026/ANPHAT-PDLONG",
            type: "SALE",
            siteName: null,
            warnings: [],
          },
        ]}
      />,
    );
    const [, first, second] = screen.getAllByRole("row");
    expect(
      within(first!).getByText("01/11/2026 – 21/03/2027"),
    ).toBeInTheDocument();
    expect(within(first!).getByText("186.200.000 ₫")).toBeInTheDocument();
    expect(
      within(first!).getByText(
        "Bảo lãnh BL-2026-1188 còn 30 ngày (hết hạn 31/03/2027)",
      ),
    ).toBeInTheDocument();
    expect(within(second!).getByText("Nhận hàng tại bãi")).toBeInTheDocument();
  });
});

describe("D5a", () => {
  it("splits a kit into parts and updates the day's rent and months", async () => {
    const user = userEvent.setup();
    render(<ContractForm options={OPTIONS} today="2026-10-30" />);
    await user.selectOptions(screen.getByLabelText("Thêm bộ"), "bo17");
    await user.click(screen.getByRole("button", { name: "Thêm bộ" }));
    const count = screen.getByLabelText("Số bộ Bộ giàn giáo 1,7m");
    await user.clear(count);
    await user.type(count, "300");
    expect(screen.getAllByText("600 cái", { selector: "td" })).toHaveLength(2);
    // 600 × 1.200 + 600 × 300 + 300 × 900 = 1.170.000 ₫
    expect(
      screen.getByText("1.170.000 ₫", { selector: "td" }),
    ).toBeInTheDocument();
    const price = screen.getByLabelText("Giá thuê / ngày GG-CH");
    await user.clear(price);
    await user.type(price, "400");
    expect(
      screen.getByText("1.230.000 ₫", { selector: "td" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /tháng 30 ngày ≈ 36\.900\.000 ₫, tháng 31 ngày ≈ 38\.130\.000 ₫/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Danh mục: 300 ₫")).toBeInTheDocument();
  });

  it("forces scrap to be sold by kg", async () => {
    const user = userEvent.setup();
    render(<ContractForm options={OPTIONS} today="2026-10-30" />);
    await user.click(screen.getByRole("radio", { name: "Bán" }));
    await user.click(screen.getByRole("button", { name: "Thêm mã hàng" }));
    await user.selectOptions(screen.getByLabelText("Tình trạng"), "SCRAP");
    const unit = screen.getByLabelText("Tính theo");
    expect(unit).toHaveValue("KG");
    expect(unit).toBeDisabled();
  });

  it("shows the server's message and keeps the form when saving fails", async () => {
    fetchMock.mockImplementation(() =>
      reply(422, {
        success: false,
        data: null,
        error: "Hợp đồng cho thuê cần một công trình.",
        field: "siteId",
      }),
    );
    const user = userEvent.setup();
    render(<ContractForm options={OPTIONS} today="2026-10-30" />);
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    expect(
      await screen.findAllByText("Hợp đồng cho thuê cần một công trình."),
    ).not.toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("approval bar", () => {
  it("asks for the reason while the customer is overdue", () => {
    render(
      <ApprovalBar
        path="/api/contracts/1"
        what="Hợp đồng"
        submittedBy="Quốc Bảo"
        submittedAt="2026-10-25T09:20:00.000Z"
        overdue={{ amount: 96_000_000, days: 7 }}
      />,
    );
    expect(
      screen.getByText("Hợp đồng này đang chờ bạn duyệt"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Quốc Bảo gửi lúc 25/10/2026 16:20. Duyệt xong mới tạo được phiếu xuất.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        /bắt buộc vì nhà thầu đang nợ quá hạn 96\.000\.000 ₫ \(7 ngày\)/,
      ),
    ).toBeInTheDocument();
  });

  it("shows the server's refusal", async () => {
    fetchMock.mockImplementation(() =>
      reply(409, {
        success: false,
        data: null,
        error:
          "Nhà thầu đang nợ quá hạn 96.000.000 ₫ (7 ngày). Bạn ghi lý do vẫn duyệt.",
      }),
    );
    const user = userEvent.setup();
    render(
      <ApprovalBar
        path="/api/contracts/1"
        what="Hợp đồng"
        submittedBy={null}
        submittedAt={null}
        overdue={{ amount: 96_000_000, days: 7 }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Duyệt hợp đồng" }));
    expect(
      await screen.findByText(
        "Nhà thầu đang nợ quá hạn 96.000.000 ₫ (7 ngày). Bạn ghi lý do vẫn duyệt.",
      ),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

const line = (
  itemId: string,
  code: string,
  name: string,
  quantity: string,
  price: number,
) => ({
  itemId,
  code,
  name,
  unit: "PIECE",
  condition: null,
  pricingUnit: "ITEM",
  ownQuantity: quantity,
  quantity,
  price,
  catalogPrice: price,
});

function revision(
  lines: RevisionView["lines"],
  extra: Partial<RevisionView> = {},
): RevisionView {
  return {
    id: "r",
    number: 0,
    kind: "ORIGINAL",
    code: "112026/ANPHAT-MINHPHAT",
    status: "APPROVED",
    effectiveFrom: "2026-11-01",
    reason: null,
    terms: {
      signedDate: "2026-10-28",
      startDate: "2026-11-01",
      endDate: "2027-03-21",
      minRentalDays: 45,
      billingCycle: "MONTH_END",
      paymentTermsDays: 30,
      vatEnabled: false,
      vatRate: null,
      companyTruck: false,
      freightPerTrip: null,
      note: null,
    },
    kits: [],
    lines,
    compensations: [],
    deposits: [],
    batches: [],
    dayRent: 0,
    months: [],
    value: null,
    expectedDays: null,
    submitted: null,
    approved: null,
    approvalReason: null,
    overdueAmount: null,
    overdueDays: null,
    returnedReason: null,
    cancelledReason: null,
    updatedAt: "2026-11-02T00:00:00.000Z",
    ...extra,
  };
}

describe("D5b", () => {
  it("marks the changed price and shows the day's rent before and after", () => {
    const baseLines = [
      line("k17", "GG-K17", "Khung giàn giáo 1,7m", "600.000", 1200),
      line("ch", "GG-CH", "Chéo giàn giáo", "600.000", 300),
      line("m16", "GG-M16", "Mâm giàn giáo 1,6m", "300.000", 900),
      line("ku", "PK-KU", "Kích tăng U", "400.000", 400),
    ];
    const base = revision(baseLines, { dayRent: 1_330_000 });
    const amendment = revision(
      [
        ...baseLines.map((entry) =>
          entry.itemId === "ch" ? { ...entry, price: 400 } : entry,
        ),
        line("cc3", "CC3", "Cây chống tăng 3m", "200.000", 700),
      ],
      {
        id: "a",
        number: 1,
        kind: "AMENDMENT",
        code: "112026/ANPHAT-MINHPHAT/01",
        status: "DRAFT",
        effectiveFrom: "2026-12-15",
      },
    );
    const detail: AmendmentDetail = {
      head: {
        id: "c",
        code: "112026/ANPHAT-MINHPHAT",
        type: "RENTAL",
        status: "APPROVED",
        customer: {
          id: "c1",
          code: "NT-0001",
          name: "Minh Phát",
          paymentTermsDays: 30,
        },
        site: null,
        salesUser: null,
        createdBy: "Quốc Bảo",
        createdAt: "2026-10-28T00:00:00.000Z",
        updatedAt: "2026-10-28T00:00:00.000Z",
      },
      amendment,
      base,
      changes: [],
      impact: {
        lastClosedEnd: "2026-11-30",
        oldPriceFrom: "2026-12-01",
        oldPriceTo: "2026-12-14",
        newPriceFrom: "2026-12-15",
      },
      revisions: [],
      can: { edit: true, approve: false, amend: false, cancel: true },
    };
    const options = {
      ...OPTIONS,
      items: [...OPTIONS.items, item("cc3", "CC3", "Cây chống tăng 3m", 700)],
    };
    render(<AmendmentForm detail={detail} options={options} />);
    expect(
      screen.getByText("1.530.000 ₫", { selector: "p" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Trước đó 1\.330\.000 ₫ · tăng 200\.000 ₫/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Giá thuê / ngày GG-CH").className).toContain(
      "border-warning",
    );
    expect(
      screen.getByLabelText("Giá thuê / ngày GG-K17").className,
    ).not.toContain("border-warning");
    expect(
      screen.getByText("Không trước ngày chốt kỳ gần nhất (30/11/2026)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("01/12/2026 – 14/12/2026 · Giá cũ"),
    ).toBeInTheDocument();
    // Lines already on the contract cannot be removed by an amendment.
    expect(screen.queryByRole("button", { name: "Bỏ GG-K17" })).toBeNull();
    expect(screen.getByRole("button", { name: "Bỏ CC3" })).toBeInTheDocument();
  });
});

describe("print", () => {
  it("titles a draft as a quote and an approved one as a contract", () => {
    expect(
      printTitle("DRAFT", "112026/ANPHAT-MINHPHAT", "112026/ANPHAT-MINHPHAT"),
    ).toBe("Báo giá 112026/ANPHAT-MINHPHAT");
    expect(
      printTitle("PENDING", "112026/ANPHAT-MINHPHAT", "112026/ANPHAT-MINHPHAT"),
    ).toBe("Báo giá 112026/ANPHAT-MINHPHAT");
    expect(
      printTitle(
        "ACTIVE",
        "112026/ANPHAT-MINHPHAT",
        "112026/ANPHAT-MINHPHAT/01",
      ),
    ).toBe("Hợp đồng 112026/ANPHAT-MINHPHAT/01");
  });

  it("writes no company name in the print page (0.2 #33)", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/(desktop)/sales/contracts/[id]/print/page.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("getCompanyProfile");
    expect(source).not.toMatch(/An Phát|ANPHAT|Cty TNHH|Công ty Cổ phần/);
  });
});

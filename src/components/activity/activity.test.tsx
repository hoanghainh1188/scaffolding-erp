import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import type { ActivityRow } from "@/lib/activity/queries";

import { ActivityFilters } from "./activity-filters";
import { ActivityTable } from "./activity-table";
import { actionLabel } from "@/domain/activity";

import { dayHeading, documentHref, rangeText } from "./format";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/settings/activity",
  useSearchParams: () => new URLSearchParams("from=2026-10-27&to=2026-10-28"),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
});

const row = (id: number, at: string, extra: Partial<ActivityRow> = {}) =>
  ({
    id,
    at,
    userId: "u1",
    userName: "Thu Hà",
    username: "thuha",
    role: "ACCOUNTANT",
    device: "DESKTOP",
    browser: "EDGE",
    action: "UPDATE",
    documentType: "PURCHASE_ORDER",
    documentCode: "PO-2026-055",
    summary: "Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫",
    changes: [
      {
        field: "lines.GG-K17.unitPrice",
        label: "Đơn giá GG-K17",
        before: "190.000 ₫",
        after: "185.000 ₫",
      },
    ],
    flags: ["OFF_HOURS"],
    ...extra,
  }) satisfies ActivityRow as ActivityRow;

const FIRST = [
  row(11, "2026-10-28T15:47:13.000Z"),
  row(10, "2026-10-27T16:05:00.000Z", {
    userName: "Quốc Bảo",
    username: "quocbao",
    role: "SALES",
    documentType: "SUPPLIER",
    documentCode: "NCC-0004",
    summary: "Số tài khoản: •••• 1234 → •••• 5678",
    flags: ["OFF_HOURS", "SENSITIVE"],
  }),
];

const DAYS = [
  { date: "2026-10-28" as BusinessDate, count: 84 },
  { date: "2026-10-27" as BusinessDate, count: 112 },
];

function table(nextCursor: string | null = "c1") {
  return render(
    <ActivityTable
      rows={FIRST}
      days={DAYS}
      total={196}
      nextCursor={nextCursor}
      query="?from=2026-10-27&to=2026-10-28"
    />,
  );
}

describe("ActivityTable (D18)", () => {
  it("groups rows by Vietnam day with the day's count", () => {
    table();
    expect(
      screen.getByRole("columnheader", {
        name: "Thứ Tư, 28/10/2026 · 84 thao tác",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: "Thứ Ba, 27/10/2026 · 112 thao tác",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("22:47")).toBeInTheDocument();
    expect(screen.getByText("Kế toán · máy tính")).toBeInTheDocument();
    expect(screen.getByText("Dữ liệu nhạy cảm")).toBeInTheDocument();
    expect(screen.getByText("Đang hiện 2 / 196 thao tác")).toBeInTheDocument();
  });

  it("opens and closes a row by mouse and by keyboard", async () => {
    const user = userEvent.setup();
    table();
    const toggles = screen.getAllByRole("button", { name: "Xem chi tiết" });
    await user.click(screen.getByText("22:47"));
    const detail = screen.getByRole("heading", {
      name: "Thay đổi trên PO-2026-055",
    }).parentElement as HTMLElement;
    expect(
      within(detail).getByRole("rowheader", { name: "Đơn giá GG-K17" }),
    ).toBeInTheDocument();
    expect(screen.getByText("28/10/2026 22:47:13")).toBeInTheDocument();
    expect(screen.getByText("Thu Hà (thuha)")).toBeInTheDocument();
    expect(screen.getByText("Máy tính · Edge")).toBeInTheDocument();
    const open = screen.getByRole("button", { name: "Ẩn chi tiết" });
    expect(open).toHaveAttribute("aria-expanded", "true");
    open.focus();
    await user.keyboard("{Enter}");
    expect(
      screen.queryByRole("heading", { name: "Thay đổi trên PO-2026-055" }),
    ).not.toBeInTheDocument();
    toggles[1]?.focus();
    await user.keyboard(" ");
    expect(
      screen.getByRole("heading", { name: "Thay đổi trên NCC-0004" }),
    ).toBeInTheDocument();
  });

  it("Xem thêm appends the next page and hides itself at the end", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
        error: null,
        data: {
          rows: [
            row(9, "2026-10-27T10:20:00.000Z", {
              action: "CREATE",
              summary: "Hòa Phát mẫu · 5 mã hàng · 52.942.500 ₫",
              flags: [],
            }),
          ],
          nextCursor: null,
          total: 196,
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    table();
    await user.click(screen.getByRole("button", { name: "Xem thêm" }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/activity?from=2026-10-27&to=2026-10-28&cursor=c1",
      expect.anything(),
    );
    expect(
      await screen.findByText("Hòa Phát mẫu · 5 mã hàng · 52.942.500 ₫"),
    ).toBeInTheDocument();
    expect(screen.getByText("Đang hiện 3 / 196 thao tác")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Xem thêm" }),
    ).not.toBeInTheDocument();
  });

  it("says so when nothing matches", () => {
    render(
      <ActivityTable
        rows={[]}
        days={[]}
        total={0}
        nextCursor={null}
        query=""
      />,
    );
    expect(
      screen.getByText("Không có thao tác nào trong bộ lọc này."),
    ).toBeInTheDocument();
  });
});

describe("ActivityFilters (D18)", () => {
  const values = {
    from: "2026-10-27",
    to: "2026-10-28",
    userId: null,
    type: null,
    code: null,
    group: null,
    review: false,
  };

  it("puts the filter in the URL and links the chips", async () => {
    const user = userEvent.setup();
    render(
      <ActivityFilters
        values={values}
        people={[
          { id: "u1", name: "Thu Hà", username: "thuha", role: "ACCOUNTANT" },
        ]}
        reviewCount={3}
      />,
    );
    expect(screen.getByRole("option", { name: "Tất cả (1)" })).toBeVisible();
    await user.type(screen.getByLabelText("Mã chứng từ"), "KK-2026-003");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    expect(replace).toHaveBeenCalledWith(
      "/settings/activity?from=2026-10-27&to=2026-10-28&code=KK-2026-003",
    );
    expect(
      screen.getByRole("switch", { name: "Chỉ cần xem kỹ (3)" }),
    ).toHaveAttribute(
      "href",
      "/settings/activity?from=2026-10-27&to=2026-10-28&review=1",
    );
    expect(screen.getByRole("link", { name: "Duyệt, ghi sổ" })).toHaveAttribute(
      "href",
      "/settings/activity?from=2026-10-27&to=2026-10-28&group=APPROVAL",
    );
  });
});

describe("format", () => {
  it("writes days and ranges like D18", () => {
    expect(dayHeading("2026-10-28" as BusinessDate)).toBe("Thứ Tư, 28/10/2026");
    expect(
      rangeText("2026-10-27" as BusinessDate, "2026-10-28" as BusinessDate),
    ).toBe("27–28/10");
    expect(
      rangeText("2026-09-30" as BusinessDate, "2026-10-28" as BusinessDate),
    ).toBe("30/09–28/10");
  });
});

describe("D18 with site operations (site-operations task 6.6)", () => {
  it("lists transfers and buy-backs among the document types", () => {
    render(
      <ActivityFilters
        values={{
          from: "2026-11-01",
          to: "2026-11-05",
          userId: null,
          type: null,
          code: null,
          group: null,
          review: false,
        }}
        people={[]}
        reviewCount={0}
      />,
    );
    expect(
      screen.getByRole("option", { name: "Phiếu chuyển công trình" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Phiếu mua lại" }),
    ).toBeInTheDocument();
  });

  it("links the rows to their screens and labels the phone send", () => {
    expect(documentHref("SITE_TRANSFER", "CCT-2026-004")).toBe(
      "/sales/site-transfers/CCT-2026-004",
    );
    expect(documentHref("BUY_BACK", "MLA-2026-003")).toBe(
      "/sales/buy-backs/MLA-2026-003",
    );
    expect(documentHref("SCRAP_PRICE", "PL-SATVUN")).toBe(
      "/settings/scrap-price",
    );
    expect(actionLabel("SEND", "SITE_TRANSFER")).toBe("Gửi điện thoại");
  });
});

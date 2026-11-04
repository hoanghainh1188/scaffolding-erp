// D7 pieces and the printed statement (rental-billing tasks 6.2–6.4).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import {
  buildStatement,
  periodOf,
  type BillingTerms,
} from "@/domain/rental-billing";
import { buildPieces, type RentalEvent } from "@/domain/rental-lots";
import type { ContractStatementView } from "@/lib/billing/queries";

import { ClosePanel } from "./close-panel";
import { HolidayBand } from "./holiday-band";
import { PeriodContracts } from "./period-contracts";
import { PrintedStatement } from "./printed-statement";
import { StatementTable } from "./statement-table";
import { AmountDue } from "./statement-totals";

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

const d = (value: string) => value as BusinessDate;
const TET = {
  name: "Tết Nguyên đán",
  startDate: d("2027-02-05"),
  endDate: d("2027-02-13"),
};
let order = 0;
const event = (
  direction: "IN" | "OUT",
  code: string,
  date: string,
  pieces: number,
  item: string,
  extra: Partial<RentalEvent> = {},
): RentalEvent => ({
  itemId: item,
  direction,
  milli: pieces * 1000,
  date: d(date),
  order: ++order,
  doc: {
    type: direction === "IN" ? "DELIVERY_NOTE" : "RETURN_NOTE",
    id: code,
    code,
  },
  ...(direction === "OUT" ? { endKind: "RETURN" as const } : {}),
  ...extra,
});
const terms = (number: number, from: string, h17: number): BillingTerms => ({
  number,
  status: "APPROVED",
  effectiveFrom: from,
  code:
    number === 0
      ? "102026/ANPHAT-MINHPHAT"
      : `102026/ANPHAT-MINHPHAT/0${number}`,
  minRentalDays: 45,
  paymentTermsDays: 30,
  vatBasisPoints: 800,
  prices: new Map(
    Object.entries({
      "H1,7": h17,
      "CHEO1,7": 300,
      "KU0,5": 400,
      "MAM1,6": 900,
      "CHEO1,2": 280,
    }),
  ),
});

/** The D7 drawing for 02/2027. */
function d7Statement(today = "2027-03-02") {
  return buildStatement({
    period: periodOf("2027-02"),
    today: d(today),
    pieces: buildPieces([
      event("IN", "PX-2026-031", "2026-11-15", 100, "H1,7"),
      event("IN", "PX-2026-031", "2026-11-15", 260, "CHEO1,7"),
      event("IN", "PX-2026-031", "2026-11-15", 2, "KU0,5"),
      event("IN", "PX-2027-003", "2027-01-10", 60, "MAM1,6"),
      event("OUT", "PTH-2027-004", "2027-02-04", 60, "MAM1,6"),
      event("OUT", "PTH-2027-012", "2027-02-20", 260, "CHEO1,7"),
      event("OUT", "PTH-2027-012", "2027-02-20", 2, "KU0,5", {
        endKind: "LOSS",
      }),
      event("IN", "PX-2027-018", "2027-02-22", 100, "CHEO1,2"),
    ]),
    terms: [
      terms(0, "2026-10-01", 1200),
      terms(1, "2026-11-15", 1400),
      terms(2, "2027-02-15", 1300),
    ],
    holidays: [TET],
    items: new Map(
      [
        ["H1,7", "Khung giàn giáo 1,7m"],
        ["CHEO1,7", "Chéo giàn giáo"],
        ["KU0,5", "Kích tăng U"],
        ["MAM1,6", "Mâm giàn giáo 1,6m"],
        ["CHEO1,2", "Chéo giàn giáo 1,2m"],
      ].map(([code, name]) => [
        code as string,
        { code: code as string, name: name as string },
      ]),
    ),
    freight: [
      {
        deliveryNoteId: "px18",
        code: "PX-2027-018",
        batchNo: 5,
        vehiclePlate: "51X-000.02",
        date: d("2027-02-22"),
        amount: 1_800_000,
      },
    ],
    adjustments: [
      {
        id: "adj",
        refMonth: "2027-01",
        amount: 93_000,
        reason: "Kỳ 01 thiếu 10 CHEO1,7 × 31 ngày (giao 31/12 chưa ghi)",
        createdByName: "Thu Hà",
        createdAt: new Date("2027-03-02T02:00:00Z"),
        updatedAt: new Date("2027-03-02T02:00:00Z"),
      },
    ],
  });
}

describe("StatementTable and AmountDue", () => {
  it("show the D7 drawing: 7.283.304 ₫", () => {
    const statement = d7Statement();
    render(
      <>
        <StatementTable statement={statement} />
        <AmountDue statement={statement} />
      </>,
    );
    expect(screen.getAllByText("7.283.304 ₫").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("VAT 8 %")).toBeInTheDocument();
    expect(screen.getByText("Tối thiểu 45 ngày")).toBeInTheDocument();
    expect(screen.getByText("Đổi giá")).toBeInTheDocument();
    expect(screen.getByText("Mất")).toBeInTheDocument();
    expect(screen.getByText("Điều chỉnh kỳ 01/2027")).toBeInTheDocument();
    expect(screen.getByText("4.943.800 ₫")).toBeInTheDocument();
    expect(screen.getByText("Hạn trả 30/03/2027")).toBeInTheDocument();
  });

  it("says a running period is an estimate", () => {
    render(<AmountDue statement={d7Statement("2027-02-15")} />);
    expect(screen.getByText("Tạm tính đến 15/02/2027")).toBeInTheDocument();
  });
});

describe("PeriodContracts and HolidayBand", () => {
  it("counts the closed contracts", () => {
    const contract = (code: string, closed: boolean) => ({
      id: code,
      code,
      status: "ACTIVE",
      customerName: "Minh Phát",
      customerTaxCode: null,
      customerAddress: null,
      siteName: "An Phú – Block B",
      totalAmount: 1_000,
      closed,
    });
    render(
      <PeriodContracts
        month="2027-02"
        contracts={[
          contract("A", false),
          contract("B", false),
          contract("C", true),
          contract("D", false),
        ]}
        closedCount={1}
        selectedId="A"
      />,
    );
    expect(
      screen.getByRole("heading", { name: /1\/4 đã chốt/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^A/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("links to the holiday settings for the director only", () => {
    const holidays = [{ ...TET, days: 9 }];
    const { rerender } = render(
      <HolidayBand holidays={holidays} canEdit={false} />,
    );
    expect(
      screen.getByText(/Tết Nguyên đán 05\/02 – 13\/02\/2027 \(9 ngày\)/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    rerender(<HolidayBand holidays={holidays} canEdit />);
    expect(
      screen.getByRole("link", { name: "Sửa ở Cài đặt → Ngày nghỉ" }),
    ).toHaveAttribute("href", "/settings/holidays");
  });
});

describe("ClosePanel", () => {
  const props = {
    contractId: "c1",
    contractCode: "102026/ANPHAT-MINHPHAT",
    month: "2027-02",
    totalAmount: 7_283_304,
    block: null,
    canClose: true,
    closed: false,
  };

  it("is off with the reason while the period runs", () => {
    render(
      <ClosePanel
        {...props}
        block="Kỳ 02/2027 chưa hết. Bạn chốt từ ngày 01/03/2027."
      />,
    );
    expect(
      screen.getByRole("button", { name: /Chốt kỳ và ghi công nợ/ }),
    ).toBeDisabled();
    expect(
      screen.getByText("Kỳ 02/2027 chưa hết. Bạn chốt từ ngày 01/03/2027."),
    ).toBeInTheDocument();
  });

  it("is hidden from sales", () => {
    render(<ClosePanel {...props} canClose={false} />);
    expect(screen.queryByRole("button", { name: /Chốt kỳ/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: /In bảng kê/ }),
    ).toBeInTheDocument();
  });

  it("asks again with the amount and sends what the user saw", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, data: {}, error: null }, { status: 201 }),
    );
    render(<ClosePanel {...props} />);
    await user.click(
      screen.getByRole("button", { name: /Chốt kỳ và ghi công nợ/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/Phải thu 7\.283\.304 ₫ sẽ ghi vào công nợ/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Chốt kỳ" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/billing/periods/2027-02/contracts/c1/close",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      expectedTotal: 7_283_304,
    });
  });

  it("shows the refusal of the server", async () => {
    const user = userEvent.setup();
    const error =
      "Số phải thu đã đổi từ 7.283.304 ₫ thành 7.294.104 ₫ từ lúc bạn mở. Bạn xem lại rồi chốt.";
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: false, data: null, error }, { status: 409 }),
    );
    render(<ClosePanel {...props} />);
    await user.click(
      screen.getByRole("button", { name: /Chốt kỳ và ghi công nợ/ }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Chốt kỳ",
      }),
    );
    expect(await screen.findByText(error)).toBeInTheDocument();
  });
});

describe("PrintedStatement", () => {
  const view = (closed: boolean): ContractStatementView => ({
    contract: {
      id: "c1",
      code: "102026/ANPHAT-MINHPHAT",
      status: "ACTIVE",
      customerName: "Cty TNHH Xây dựng Minh Phát",
      customerTaxCode: "0109876543",
      customerAddress: null,
      siteName: "Chung cư An Phú – Block B",
    },
    statement: d7Statement(),
    holidays: [{ ...TET, days: 9 }],
    closed: closed
      ? { at: new Date("2027-03-02T02:12:00Z"), byName: "Thu Hà" }
      : null,
    closeBlock: null,
    pending: [],
    closedMonths: [],
    vatBasisPoints: 800,
  });
  const company = {
    name: "Cty TNHH An Phát",
    taxId: "0101234567",
    address: "Hà Nội",
    phone: "0900000000",
    logoUrl: null,
  };

  it("heads the page with the company of Cài đặt and stamps an open month", () => {
    render(
      <PrintedStatement company={company} view={view(false)} contractId="c1" />,
    );
    expect(screen.getByText("Cty TNHH An Phát")).toBeInTheDocument();
    expect(screen.getByText("Mã số thuế: 0101234567")).toBeInTheDocument();
    expect(screen.getByText("TẠM TÍNH – CHƯA CHỐT")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Bảng kê tiền thuê vật tư · Kỳ 02\/2027/,
      }),
    ).toBeInTheDocument();
  });

  it("has no stamp once closed", () => {
    render(
      <PrintedStatement company={company} view={view(true)} contractId="c1" />,
    );
    expect(screen.queryByText("TẠM TÍNH – CHƯA CHỐT")).toBeNull();
  });
});

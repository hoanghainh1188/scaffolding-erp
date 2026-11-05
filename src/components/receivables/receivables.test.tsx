// D14 and D14b pieces (receivables tasks 7.1–7.4): the tiles with the
// numbers of the drawing, URL links of the filters, the receipt form's
// preview, the cancel dialog, the settlement block and the D5 deposit line.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { toMoney } from "@/domain/money";
import type {
  BalanceTotals,
  CustomerBalance,
} from "@/lib/receivables/balances";

import { CancelReceipt } from "./cancel-receipt";
import { CustomerTable } from "./customer-table";
import { DepositReceived } from "./deposit-received";
import { ReceiptForm } from "./receipt-form";
import { SettlePanel } from "./settle-panel";
import { SummaryTiles } from "./summary-tiles";

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

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status < 400, data, error: null }), {
    status,
    headers: { "content-type": "application/json" },
  });

const m = toMoney;

describe("SummaryTiles", () => {
  it("shows the four tiles of the drawing", () => {
    const totals: BalanceTotals = {
      owed: m(320_900_000),
      owingCount: 4,
      overdue: m(189_700_000),
      overdueCount: 2,
      longestOverdueDays: 36,
      dueSoon: m(78_750_000),
      dueSoonNames: ["Thành Công", "Minh Phát"],
      prepaid: m(5_000_000),
      prepaidNames: ["Đông Á"],
    };
    render(<SummaryTiles totals={totals} />);
    expect(screen.getByText("320.900.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("4 nhà thầu đang nợ")).toBeInTheDocument();
    expect(screen.getByText("189.700.000 ₫")).toBeInTheDocument();
    expect(
      screen.getByText("2 nhà thầu · lâu nhất 36 ngày"),
    ).toBeInTheDocument();
    expect(screen.getByText("Thành Công, Minh Phát")).toBeInTheDocument();
    expect(screen.getByText("Đông Á · tự trừ khoản sau")).toBeInTheDocument();
  });
});

describe("CustomerTable", () => {
  const row: CustomerBalance = {
    id: "c1",
    code: "NT-0001",
    name: "Cty TNHH Xây dựng Minh Phát",
    paymentTermsDays: 15,
    contractCount: 3,
    rentAndFreight: m(37_300_000),
    sale: m(21_500_000),
    compensationAndBuyBack: m(10_250_000),
    owed: m(69_050_000),
    overdue: { amount: m(21_500_000), days: 19 },
    dueSoon: m(0),
    prepaid: m(0),
    status: { kind: "OVERDUE", label: "Quá hạn 19 ngày" },
  };

  it("links filters with their counts and keeps the search in the URL", () => {
    render(
      <CustomerTable
        state={{
          filter: "owing",
          q: "minh",
          page: 1,
          customer: null,
          paid: false,
        }}
        counts={{ owing: 4, overdue: 2, prepaid: 1, all: 18 }}
        rows={[row]}
        page={1}
        pageCount={3}
      />,
    );
    expect(screen.getByRole("link", { name: "Quá hạn (2)" })).toHaveAttribute(
      "href",
      "/receivables?filter=overdue&q=minh",
    );
    expect(screen.getByRole("link", { name: "Đang nợ (4)" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Quá hạn 19 ngày")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trang sau" })).toHaveAttribute(
      "href",
      "/receivables?q=minh&page=2",
    );
  });
});

describe("ReceiptForm", () => {
  const debts = [
    {
      key: "SALE:px041",
      label: "PX-2026-041",
      kindLabel: "Bán",
      dueDate: "2026-10-17",
      remaining: 21_500_000,
    },
  ];

  it("previews the split from the server and records the receipt", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        lines: [
          {
            debtKey: "SALE:px041",
            label: "PX-2026-041",
            amount: 21_500_000,
            mode: "AUTO",
            left: 0,
          },
        ],
        prepaid: 8_500_000,
        owedBefore: 69_050_000,
        owedAfter: 47_550_000,
      }),
    );
    render(
      <ReceiptForm
        customerId="c1"
        customerName="Minh Phát"
        today={"2026-11-05" as BusinessDate}
        debts={debts}
        depositContracts={[]}
      />,
    );
    await userEvent.type(screen.getByLabelText("Số tiền"), "30000000");
    expect(await screen.findByText("Hết nợ")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Trả dư 8.500.000 ₫ giữ làm tiền trả trước, tự trừ vào khoản phát sinh sau.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sau khi ghi, Minh Phát còn nợ 47.550.000 ₫."),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Nộp cọc tiền" })).toBeDisabled();
    fetchMock.mockResolvedValueOnce(
      json({ id: "r1", code: "PT-2026-132" }, 201),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Ghi phiếu thu 30\.000\.000 ₫/ }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const sent = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/receivables/receipts",
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toMatchObject({
      customerId: "c1",
      kind: "PAYMENT",
      amount: 30_000_000,
      method: "TRANSFER",
      receivedDate: "2026-11-05",
      allocations: [],
    });
  });
});

describe("CancelReceipt", () => {
  it("needs a reason before calling the server", async () => {
    render(
      <CancelReceipt id="r1" code="PT-2026-131" amountText="60.000.000 ₫" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Hủy" }));
    await userEvent.click(screen.getByRole("button", { name: "Hủy phiếu" }));
    expect(
      await screen.findByText("Bạn ghi lý do hủy phiếu thu."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SettlePanel", () => {
  it("shows the set-off of D14b and disables settling until ready", () => {
    render(
      <SettlePanel
        contractId="k1"
        contractCode="082026/ANPHAT-MINHPHAT"
        deposit={50_000_000}
        offset={33_900_000}
        refund={16_100_000}
        debtCount={3}
        today="2026-12-04"
        ready={false}
        canSettle
      />,
    );
    expect(screen.getAllByText("16.100.000 ₫").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Cọc 50.000.000 ₫ − nợ 33.900.000 ₫"),
    ).toBeInTheDocument();
    expect(screen.getByText("Trừ vào 3 khoản còn nợ")).toBeInTheDocument();
    expect(screen.getByLabelText("Ngày hoàn")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Thanh lý và ghi cấn trừ cọc/ }),
    ).toBeDisabled();
  });
});

describe("DepositReceived", () => {
  it("shows what was received and what is missing", () => {
    render(
      <DepositReceived
        status={{
          received: m(30_000_000),
          receiptCodes: ["PT-2026-104"],
          settlement: null,
        }}
        agreed={50_000_000}
        settleHref="/receivables/contracts/k1/close"
      />,
    );
    expect(
      screen.getByText(
        "Cọc tiền 50.000.000 ₫ · đã nhận 30.000.000 ₫ (PT-2026-104) · còn thiếu 20.000.000 ₫",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Thanh lý hợp đồng" }),
    ).toHaveAttribute("href", "/receivables/contracts/k1/close");
  });
});

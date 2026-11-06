// D14c pieces (payables tasks 7.1–7.4): the tab bar, the tiles with the
// numbers of the drawing, the seller table and its links, the payment
// form's preview and refusal, the cancel dialog, and the D16 terms line.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LedgerTabs } from "@/components/finance/ledger-tabs";
import type { BusinessDate } from "@/domain/business-date";
import { toMoney } from "@/domain/money";
import type { PayableTotals, SupplierBalance } from "@/lib/payables/balances";
import type { PaymentView } from "@/lib/payables/queries";

import { CancelPayment } from "./cancel-payment";
import { PaymentForm } from "./payment-form";
import { PaymentTable, paidInto } from "./payment-table";
import { payablesHref, SupplierTable } from "./supplier-table";
import { PayableTiles } from "./summary-tiles";

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

const json = (data: unknown, status = 200, error: string | null = null) =>
  new Response(JSON.stringify({ success: status < 400, data, error }), {
    status,
    headers: { "content-type": "application/json" },
  });

const m = toMoney;

describe("LedgerTabs", () => {
  it("shows both tabs to the accountant and marks the open one", () => {
    render(<LedgerTabs role="ACCOUNTANT" active="payables" />);
    expect(screen.getByRole("link", { name: "Phải trả" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Phải thu" })).toHaveAttribute(
      "href",
      "/receivables",
    );
  });

  it("shows nothing to sales", () => {
    const { container } = render(<LedgerTabs role="SALES" active="payables" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PayableTiles", () => {
  it("shows the four tiles of the drawing", () => {
    const totals: PayableTotals = {
      owed: m(293_950_000),
      owingCount: 3,
      overdue: m(55_050_000),
      overdueCount: 2,
      longestOverdueDays: 5,
      dueSoon: m(52_500_000),
      dueSoonNames: ["Cty CP Thép Nam Sơn"],
      advance: m(10_000_000),
      advanceNames: ["Chị Nguyễn Thị Hoa"],
    };
    render(<PayableTiles totals={totals} />);
    expect(screen.getByText("293.950.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("3 người bán")).toBeInTheDocument();
    expect(
      screen.getByText("2 người bán · lâu nhất 5 ngày"),
    ).toBeInTheDocument();
    expect(screen.getByText("Cty CP Thép Nam Sơn")).toBeInTheDocument();
    expect(
      screen.getByText("Chị Nguyễn Thị Hoa · tự trừ khi nhập"),
    ).toBeInTheDocument();
  });
});

describe("SupplierTable", () => {
  const row = (patch: Partial<SupplierBalance>): SupplierBalance => ({
    id: "s1",
    code: "NCC-0001",
    name: "Cty TNHH Vật tư Hưng Thịnh",
    kind: "COMPANY",
    paymentTermsDays: 30,
    owed: m(186_400_000),
    overdue: { amount: m(0), days: 0 },
    dueSoon: m(0),
    advance: m(0),
    status: { kind: "NOT_DUE", label: "Chưa đến hạn" },
    ...patch,
  });
  const state = {
    filter: "owing" as const,
    q: "",
    page: 1,
    supplier: null,
    paid: false,
  };

  it("shows terms and the D14 status, and links keep the URL state", () => {
    render(
      <SupplierTable
        state={state}
        counts={{ owing: 3, overdue: 2, advance: 1, all: 24 }}
        rows={[
          row({}),
          row({
            id: "s2",
            name: "Anh Lê Văn Tâm",
            kind: "PERSON",
            paymentTermsDays: 0,
            overdue: { amount: m(42_750_000), days: 2 },
            status: { kind: "OVERDUE", label: "Quá hạn 2 ngày" },
          }),
        ]}
        page={1}
        pageCount={1}
      />,
    );
    expect(screen.getByText("Công ty · nợ 30 ngày")).toBeInTheDocument();
    expect(screen.getByText("Cá nhân · trả ngay")).toBeInTheDocument();
    expect(screen.getByText("Chưa đến hạn")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quá hạn/ })).toHaveAttribute(
      "href",
      "/payables?filter=overdue",
    );
    expect(
      screen.getByRole("link", { name: "Anh Lê Văn Tâm" }),
    ).toHaveAttribute("href", "/payables?supplier=s2");
    expect(payablesHref(state, { paid: true, q: "nam son" })).toBe(
      "/payables?q=nam+son&paid=1",
    );
  });
});

describe("PaymentForm", () => {
  const payables = [
    {
      id: "pn090",
      code: "PN-2026-090",
      issuedDate: "2026-11-04",
      dueDate: "2026-11-04",
      remaining: 26_500_000,
    },
    {
      id: "pn091",
      code: "PN-2026-091",
      issuedDate: "2026-11-05",
      dueDate: "2026-11-05",
      remaining: 16_250_000,
    },
  ];
  const form = () =>
    render(
      <PaymentForm
        supplierId="s2"
        supplierName="Anh Tâm"
        today={"2026-11-06" as BusinessDate}
        payables={payables}
      />,
    );

  it("previews 42.750.000 ₫ and records the payment", async () => {
    fetchMock.mockResolvedValue(
      json({
        parts: [
          {
            goodsReceiptId: "pn090",
            code: "PN-2026-090",
            amount: 26_500_000,
            mode: "AUTO",
            left: 0,
          },
          {
            goodsReceiptId: "pn091",
            code: "PN-2026-091",
            amount: 16_250_000,
            mode: "AUTO",
            left: 0,
          },
        ],
        advance: 0,
        owedBefore: 42_750_000,
        owedAfter: 0,
      }),
    );
    form();
    await userEvent.type(screen.getByLabelText("Số tiền"), "42750000");
    await waitFor(() => expect(screen.getAllByText("Hết nợ")).toHaveLength(2));
    expect(
      screen.getByText("Sau khi ghi, Anh Tâm hết nợ."),
    ).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(
      json({ id: "p1", code: "PC-2026-045" }, 201),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Ghi phiếu chi 42\.750\.000 ₫/ }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const sent = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/payables/payments",
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toMatchObject({
      supplierId: "s2",
      kind: "PAYMENT",
      amount: 42_750_000,
      paidDate: "2026-11-06",
      allocations: [],
    });
  });

  it("shows the server's refusal of an advance while owing", async () => {
    const message =
      "Anh Lê Văn Tâm còn phải trả 42.750.000 ₫. Bạn chọn Trả tiền hàng: phần dư tự thành tiền ứng trước.";
    fetchMock.mockResolvedValue(json(null, 422, message));
    form();
    await userEvent.click(screen.getByRole("radio", { name: "Ứng trước" }));
    await userEvent.type(screen.getByLabelText("Số tiền"), "5000000");
    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});

describe("PaymentTable and CancelPayment", () => {
  const payment = (patch: Partial<PaymentView>): PaymentView => ({
    id: "p44",
    code: "PC-2026-044",
    supplierId: "s2",
    kind: "PAYMENT",
    amount: m(38_000_000),
    method: "CASH",
    paidDate: "2026-10-22" as BusinessDate,
    note: null,
    createdByName: "Thu Hà",
    createdAt: new Date("2026-10-22T03:00:00Z"),
    cancelled: null,
    parts: [
      {
        receiptCode: "PN-2026-087",
        amount: m(38_000_000),
        fromAdvance: false,
        at: new Date("2026-10-22T03:00:00Z"),
      },
    ],
    advanceLeft: m(0),
    ...patch,
  });

  it("writes what each payment paid", () => {
    render(
      <PaymentTable
        supplierName="Anh Tâm"
        rows={[payment({})]}
        canCancel
        moreHref={null}
      />,
    );
    expect(screen.getByText("PN-2026-087 38.000.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("22/10 · Tiền mặt · Thu Hà")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hủy" })).toBeInTheDocument();
    expect(
      paidInto(
        payment({
          kind: "ADVANCE",
          code: "PC-2026-041",
          amount: m(20_000_000),
          parts: [
            {
              receiptCode: "PN-2026-087",
              amount: m(20_000_000),
              fromAdvance: true,
              at: new Date("2026-10-22T03:00:00Z"),
            },
          ],
        }),
      ),
    ).toBe("Ứng trước · đã tự trừ vào PN-2026-087 ngày 22/10");
  });

  it("hides Hủy without payments.manage", () => {
    render(
      <PaymentTable
        supplierName="Anh Tâm"
        rows={[payment({})]}
        canCancel={false}
        moreHref={null}
      />,
    );
    expect(screen.queryByRole("button", { name: "Hủy" })).toBeNull();
  });

  it("needs a reason before calling the server", async () => {
    render(
      <CancelPayment id="p44" code="PC-2026-044" amountText="38.000.000 ₫" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Hủy" }));
    await userEvent.click(screen.getByRole("button", { name: "Hủy phiếu" }));
    expect(
      await screen.findByText("Bạn ghi lý do hủy phiếu chi."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

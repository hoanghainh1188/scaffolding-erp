// D6c (site-operations task 6.4; spec buy-backs "Đơn giá mua lại", "Màn D6c
// Phiếu mua lại").
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import type {
  BuyBackForm as FormData,
  BuyBackView as View,
} from "@/lib/buy-backs/queries";

import { BuyBackForm } from "./buy-back-form";
import { BuyBackView } from "./buy-back-view";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const K = 1000;
const data: FormData = {
  contract: {
    id: "a",
    code: "102026/ANPHAT-MINHPHAT",
    siteName: "An Phú",
    customerName: "Minh Phát",
    customerId: "minhphat",
  },
  items: [
    {
      itemId: "tr16",
      code: "TR16",
      name: "Ty ren D16 dài 0,5m",
      unit: "PIECE",
      onSiteMilli: 120 * K,
      lostPrice: 35_000,
      dailyPrice: 100,
    },
    {
      itemId: "bch",
      code: "BCH",
      name: "Bát chuồn",
      unit: "PIECE",
      onSiteMilli: 300 * K,
      lostPrice: 12_000,
      dailyPrice: 20,
    },
  ],
  paymentTermsDays: 30,
};

const view: View = {
  id: "n1",
  code: "MLA-2026-003",
  status: "PENDING",
  contractId: "a",
  contractCode: "102026/ANPHAT-MINHPHAT",
  customerId: "minhphat",
  customerName: "Cty TNHH Xây dựng Minh Phát",
  siteName: "An Phú",
  reason: "Ty ren, bát chuồn đã đổ bê tông, không tháo ra được",
  approvalReason: null,
  rejectedReason: null,
  amountDue: null,
  approvedDate: null,
  dueDate: null,
  approvedByName: null,
  createdByName: "Quốc Bảo",
  createdAt: "2026-11-04T09:20:00.000Z",
  updatedAt: "2026-11-04T09:20:00.000Z",
  lines: [
    {
      itemId: "tr16",
      itemCode: "TR16",
      itemName: "Ty ren D16 dài 0,5m",
      unit: "PIECE",
      milli: 20 * K,
      unitPrice: 35_000,
      contractPrice: 35_000,
    },
    {
      itemId: "bch",
      itemCode: "BCH",
      itemName: "Bát chuồn",
      unit: "PIECE",
      milli: 50 * K,
      unitPrice: 12_000,
      contractPrice: 12_000,
    },
  ],
};

describe("BuyBackForm", () => {
  it("prefills the lost price and adds up", async () => {
    const user = userEvent.setup();
    render(<BuyBackForm data={data} />);
    expect(screen.getByLabelText("Đơn giá TR16")).toHaveValue("35000");
    await user.type(screen.getByLabelText("Số mua TR16"), "20");
    await user.type(screen.getByLabelText("Số mua BCH"), "50");
    expect(screen.getAllByText("1.300.000 ₫").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Tiền thuê 1 ngày ở An Phú giảm 3.000 ₫ từ hôm sau ngày duyệt.",
      ),
    ).toBeInTheDocument();
  });

  it("marks a price that differs from the contract", async () => {
    const user = userEvent.setup();
    render(<BuyBackForm data={data} />);
    const price = screen.getByLabelText("Đơn giá TR16");
    await user.clear(price);
    await user.type(price, "30000");
    expect(
      screen.getByText("khác giá hợp đồng (35.000 ₫)"),
    ).toBeInTheDocument();
  });
});

describe("BuyBackView", () => {
  const props = {
    view,
    createdAtText: "16:20 04/11/2026",
    today: "2026-11-05" as BusinessDate,
    dailyDrop: -3_000,
    overdue: { amount: 0, days: 0 },
  };

  it("gives the director the bar with the rent reminder", () => {
    render(<BuyBackView {...props} canApprove />);
    expect(
      screen.getByText("Phiếu mua lại đang chờ bạn duyệt"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Duyệt 1.300.000 ₫" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Tính thuê tới khi duyệt/)).toBeInTheDocument();
    expect(
      screen.getByText("Sổ kho: ra 20 TR16, 50 BCH ở công trình"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tiền thuê 1 ngày ở An Phú giảm 3.000 ₫"),
    ).toBeInTheDocument();
  });

  it("shows no bar to sales or the accountant", () => {
    render(<BuyBackView {...props} canApprove={false} />);
    expect(screen.queryByRole("button", { name: /Duyệt/ })).toBeNull();
  });

  it("asks for a reason when the customer is overdue", () => {
    render(
      <BuyBackView
        {...props}
        canApprove
        overdue={{ amount: 96_000_000, days: 7 }}
      />,
    );
    expect(
      screen.getByLabelText(
        /bắt buộc vì nhà thầu đang nợ quá hạn 96.000.000 ₫/,
      ),
    ).toBeInTheDocument();
  });
});

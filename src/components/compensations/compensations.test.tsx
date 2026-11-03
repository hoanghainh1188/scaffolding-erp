// D8, the return note blocks, D6 return rows and the photo storage warning
// (returns-and-compensation tasks 4.3, 5.1–5.4).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DeliveryChecks,
  DeliveryTimeline,
  SiteTable,
} from "@/components/deliveries/d6-view";
import { PhotoGallery } from "@/components/returns/photo-gallery";
import { ReturnLines } from "@/components/returns/return-lines";
import { PhotoStorage } from "@/components/settings/photo-storage";
import type { BusinessDate } from "@/domain/business-date";
import type { ContractDeliveries } from "@/lib/deliveries/queries";

import {
  CompensationView,
  type CompensationViewProps,
} from "./compensation-view";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: {}, error: null })),
  );
  vi.stubGlobal("fetch", fetchMock);
});

const K = 1000;
const line = (
  itemCode: string,
  kind: "DAMAGED" | "SCRAPPED" | "LOST",
  count: number,
  price: number | null,
) => ({
  itemId: itemCode,
  itemCode,
  itemName: itemCode,
  unit: "PIECE" as const,
  kind,
  quantityMilli: count * K,
  unitPrice: price,
  contractPrice: price,
});

const D8: CompensationViewProps = {
  id: "c1",
  status: "PENDING",
  updatedAt: "2026-11-05T02:40:00.000Z",
  createdAtText: "05/11/2026 09:40",
  contractCode: "112026/ANPHAT-MINHPHAT",
  returnCode: "PTH-2026-071",
  returnDate: "2026-11-05",
  lines: [
    line("H1,7", "DAMAGED", 15, 50_000),
    line("H1,7", "SCRAPPED", 3, 450_000),
    line("H1,7", "LOST", 2, 450_000),
    line("CHEO1,7", "DAMAGED", 5, 15_000),
    line("MAM1,6", "DAMAGED", 2, 40_000),
    line("MAM1,6", "LOST", 2, 380_000),
  ],
  discountAmount: 0,
  discountReason: null,
  approvalReason: null,
  rejectedReason: null,
  amountDue: null,
  approvedByName: null,
  approvedDate: null,
  dueDate: null,
  paymentTermsDays: 15,
  overdue: { amount: 0, days: 0 },
  canApprove: true,
};

describe("D8", () => {
  it("shows the pending bar and the total on the approve button", () => {
    render(<CompensationView {...D8} />);
    expect(
      screen.getByText(
        "Tự tạo từ phiếu thu hồi PTH-2026-071 lúc 05/11/2026 09:40. Duyệt xong mới cộng vào công nợ.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Duyệt 3.915.000 ₫" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Chờ sửa · 22 cái")).toBeInTheDocument();
    expect(screen.getByText("Mất · 4 cái")).toBeInTheDocument();
  });

  it("follows the discount on the button and sends it with the approval", async () => {
    const user = userEvent.setup();
    render(<CompensationView {...D8} />);
    await user.type(screen.getByLabelText("Số tiền giảm"), "415000");
    await user.type(
      screen.getByLabelText(/Lý do giảm/),
      "Khách quen, bớt phần chéo cong",
    );
    const button = screen.getByRole("button", { name: "Duyệt 3.500.000 ₫" });
    expect(screen.getByLabelText("Số tiền đền bù")).toHaveTextContent(
      "3.500.000 ₫",
    );
    await user.click(button);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      discountAmount: 415_000,
      discountReason: "Khách quen, bớt phần chéo cong",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("names the amount given up when rejecting", async () => {
    const user = userEvent.setup();
    render(<CompensationView {...D8} />);
    await user.click(screen.getByRole("button", { name: "Từ chối" }));
    expect(
      screen.getByText(
        "Từ chối thì không thu 3.915.000 ₫ đền bù của PTH-2026-071. Bạn không mở lại được phiếu này.",
      ),
    ).toBeInTheDocument();
  });

  it("lets the director type a missing price", () => {
    render(
      <CompensationView {...D8} lines={[line("MAM1,6", "LOST", 2, null)]} />,
    );
    expect(
      screen.getByRole("textbox", { name: "Đơn giá MAM1,6 Mất" }),
    ).toHaveAttribute("placeholder", "Chưa có giá");
  });

  it("asks for a reason while overdue", () => {
    render(
      <CompensationView {...D8} overdue={{ amount: 96_000_000, days: 7 }} />,
    );
    expect(
      screen.getByLabelText(/nợ quá hạn 96\.000\.000 ₫ \(7 ngày\)/),
    ).toBeInTheDocument();
  });

  it("gives the accountant no buttons and no discount box", () => {
    render(<CompensationView {...D8} canApprove={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Số tiền giảm")).not.toBeInTheDocument();
  });

  it("shows an approved note read only with its due date", () => {
    render(
      <CompensationView
        {...D8}
        status="APPROVED"
        amountDue={3_500_000}
        discountAmount={415_000}
        discountReason="Khách quen"
        approvedByName="Minh Anh"
        approvedDate="2026-11-06"
        dueDate="2026-11-21"
      />,
    );
    expect(screen.getByLabelText("Số tiền đền bù")).toHaveTextContent(
      "3.500.000 ₫",
    );
    expect(
      screen.getByText("Đã cộng vào công nợ · hạn trả 21/11/2026"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("return note blocks", () => {
  it("lists the split of each item", () => {
    render(
      <ReturnLines
        lines={[
          {
            itemId: "h",
            itemCode: "H1,7",
            itemName: "Khung giàn giáo 1,7m",
            unit: "PIECE",
            goodMilli: 80 * K,
            repairMilli: 15 * K,
            scrapMilli: 3 * K,
            lostMilli: 2 * K,
          },
        ]}
      />,
    );
    const row = screen.getByRole("row", { name: /H1,7/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Khung giàn giáo 1,7m H1,7", "cái", "98", "80", "15", "3", "2"]);
  });

  it("links each photo to its private route", () => {
    render(<PhotoGallery photos={[{ id: "p1", caption: "Khung móp chân" }]} />);
    expect(screen.getByRole("img", { name: "Khung móp chân" })).toHaveAttribute(
      "src",
      "/api/returns/photos/p1",
    );
  });
});

describe("D6 with returns", () => {
  const site: ContractDeliveries["site"] = [
    {
      itemId: "h17",
      itemCode: "H1,7",
      itemName: "Khung giàn giáo 1,7m",
      unit: "PIECE",
      deliveredMilli: 320 * K,
      returnedMilli: 100 * K,
      lostMilli: 2 * K,
      onSiteMilli: 218 * K,
      dayRent: 98_100,
    },
  ];

  it("shows Lost as its own column", () => {
    render(<SiteTable rows={site} />);
    expect(
      screen.getByRole("columnheader", { name: "Mất" }),
    ).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /H1,7/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["320", "100", "2", "218 cái", "98.100 ₫"]);
  });

  it("puts a return above the batch it followed", () => {
    render(
      <DeliveryTimeline
        entries={[
          {
            id: "d1",
            code: "PX-2026-140",
            batchNo: 3,
            status: "POSTED",
            date: "2026-11-03" as BusinessDate,
            plannedDate: null,
            businessDate: "2026-11-03" as BusinessDate,
            phoneDifferentDay: null,
            requested: "",
            delivered: "260 cái",
            short: "",
            freightAmount: null,
            companyTruck: false,
            pickingByName: null,
            returnedReason: null,
            cancelledReason: null,
          },
        ]}
        returns={[
          {
            id: "r1",
            code: "PTH-2026-071",
            businessDate: "2026-11-05" as BusinessDate,
            text: "trả 100 cái, mất 2 cái",
            phoneDifferentDay: null,
            compensation: { code: "ĐB-2026-009", status: "PENDING" },
          },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(
      "Thu hồi PTH-2026-071Chờ duyệttrả 100 cái, mất 2 cái · Đền bù Chờ duyệt",
    );
    expect(within(items[0] as HTMLElement).getByRole("link")).toHaveAttribute(
      "href",
      "/sales/returns/PTH-2026-071",
    );
    expect(items[1]).toHaveTextContent("PX-2026-140");
  });

  it("lists a return saved late on the phone", () => {
    render(
      <DeliveryChecks
        checks={[
          {
            kind: "RETURN",
            code: "PTH-2026-072",
            businessDate: "2026-11-06" as BusinessDate,
            phoneDate: "2026-11-05" as BusinessDate,
          },
        ]}
      />,
    );
    expect(
      screen.getByText(
        "PTH-2026-072 · ngày trả 06/11/2026, lưu trên máy 05/11/2026",
      ),
    ).toBeInTheDocument();
  });
});

describe("photo storage on Cài đặt", () => {
  const MB = 1024 * 1024;

  it("warns above 200 MB", () => {
    render(<PhotoStorage bytes={210 * MB} />);
    expect(
      screen.getByText(
        "Ảnh thu hồi đang dùng 210 MB, vượt ngưỡng 200 MB. Cần chuyển ảnh sang kho riêng trước khi cơ sở dữ liệu đầy.",
      ),
    ).toBeInTheDocument();
  });

  it("only shows the figures below it", () => {
    render(<PhotoStorage bytes={35 * MB} />);
    expect(
      screen.getByText("35 MB / ngưỡng cảnh báo 200 MB"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

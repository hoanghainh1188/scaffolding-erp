// D6 with site transfers, buy-backs and exchanges (site-operations task 6.1;
// spec deliveries "D6 có chuyển công trình, mua lại và đổi hàng").
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeliveryTimeline, SiteTable } from "@/components/deliveries/d6-view";
import type { BusinessDate } from "@/domain/business-date";
import type { ContractDeliveries } from "@/lib/deliveries/queries";

const K = 1000;
const day = (value: string) => value as BusinessDate;

const row = (
  overrides: Partial<ContractDeliveries["site"][number]> = {},
): ContractDeliveries["site"][number] => ({
  itemId: "h17",
  itemCode: "H1,7",
  itemName: "Khung giàn giáo 1,7m",
  unit: "PIECE",
  deliveredMilli: 120 * K,
  returnedMilli: 0,
  lostMilli: 0,
  transferredInMilli: 0,
  transferredOutMilli: 0,
  boughtMilli: 0,
  onSiteMilli: 120 * K,
  dayRent: 144_000,
  ...overrides,
});

describe("SiteTable", () => {
  it("adds the transfer and buy-back columns when they are used", () => {
    render(
      <SiteTable
        rows={[
          row({ transferredOutMilli: 50 * K, onSiteMilli: 70 * K }),
          row({
            itemId: "tr16",
            itemCode: "TR16",
            itemName: "Ty ren",
            deliveredMilli: 120 * K,
            boughtMilli: 20 * K,
            onSiteMilli: 100 * K,
          }),
        ]}
      />,
    );
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual([
      "Hàng",
      "Đã xuất",
      "Đã trả",
      "Chuyển đi",
      "Mua lại",
      "Mất",
      "Đang ở công trình",
      "Tiền 1 ngày",
    ]);
  });

  it("keeps the old columns when nothing moved between sites", () => {
    render(<SiteTable rows={[row()]} />);
    expect(
      screen.queryByRole("columnheader", { name: "Chuyển đến" }),
    ).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Mua lại" })).toBeNull();
  });
});

describe("DeliveryTimeline", () => {
  it("shows transfers both ways and buy-backs", () => {
    render(
      <DeliveryTimeline
        entries={[]}
        transfers={[
          {
            id: "t1",
            code: "CCT-2026-004",
            status: "POSTED",
            direction: "OUT",
            otherSite: "Trường THCS Dương Nội",
            date: day("2026-11-05"),
            text: "86 cái",
          },
        ]}
        buyBacks={[
          {
            id: "b1",
            code: "MLA-2026-003",
            status: "PENDING",
            date: day("2026-11-04"),
            text: "20 ty, 50 bát",
            total: 1_300_000,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Chuyển đi CCT-2026-004" }),
    ).toHaveAttribute("href", "/sales/site-transfers/CCT-2026-004");
    expect(
      screen.getByText("86 cái → Trường THCS Dương Nội"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Chờ duyệt · 20 ty, 50 bát · 1.300.000 ₫"),
    ).toBeInTheDocument();
  });

  it("labels the batch of an exchange still waiting", () => {
    render(
      <DeliveryTimeline
        entries={[
          {
            id: "d4",
            code: "PX-2026-152",
            batchNo: 4,
            status: "POSTED",
            date: day("2026-11-06"),
            plannedDate: null,
            businessDate: day("2026-11-06"),
            phoneDifferentDay: null,
            requested: "",
            delivered: "100 cái",
            short: "",
            freightAmount: null,
            companyTruck: false,
            pickingByName: null,
            returnedReason: null,
            cancelledReason: null,
          },
        ]}
        exchanges={[
          {
            status: "WAITING",
            deliveryNoteId: "d4",
            deliveryCode: "PX-2026-152",
            returnNoteId: null,
            returnCode: null,
            expectedText: "100 CHEO1,7",
          },
        ]}
      />,
    );
    expect(screen.getByText("Đổi hàng")).toBeInTheDocument();
    expect(screen.getByText("Chờ thu hồi 100 CHEO1,7")).toBeInTheDocument();
  });
});

// D3b receiving part and history (goods-receipt task 9.2), numbers of D3b.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { toMoney } from "@/domain/money";
import type { OrderLineRow } from "@/lib/purchasing/queries";
import type { ReceiptView } from "@/lib/receiving/queries";

import { historyLines } from "./order-history";
import {
  ReceivedCell,
  ReceivingTrips,
  receivingOf,
  waitingOf,
} from "./order-receiving";

const m = toMoney;

const row = (
  code: string,
  name: string,
  unit: "PIECE" | "KG",
  quantity: number,
  price: number,
): OrderLineRow => ({
  lineNo: 0,
  itemId: code,
  itemCode: code,
  itemName: name,
  itemUnit: unit,
  standardWeightKg: null,
  unit,
  quantity,
  unitPrice: m(price),
  amount: m(0),
  received: 0,
});

/** PO-2026-051 of drawing D3b. */
const LINES = [
  row("GG-K17", "Khung giàn giáo 1,7m", "PIECE", 200_000, 190_000),
  row("GG-CH", "Chéo giàn giáo", "PIECE", 200_000, 22_500),
  row("GG-M16", "Mâm giàn giáo 1,6m", "PIECE", 100_000, 145_000),
  row("PK-KU", "Kích tăng U", "PIECE", 50_000, 40_000),
  row("PL-SAT", "Phế liệu sắt lẫn", "KG", 200_000, 8_200),
];

const got = (
  itemCode: string,
  quantity: number,
  awaitsRest = false,
  unit: "PIECE" | "KG" = "PIECE",
) => ({
  itemCode,
  itemName: LINES.find((line) => line.itemCode === itemCode)?.itemName ?? "",
  itemUnit: unit,
  lineUnit: unit,
  status: quantity === 0 ? ("NOT_IN_TRIP" as const) : ("COUNTED" as const),
  quantityMilli: quantity,
  weighedKgMilli: null,
  split: { NEW: 0, GOOD: quantity, NEEDS_REPAIR: 0, SCRAP: 0 },
  awaitsRest,
});

function trip(
  code: string,
  tripNo: number,
  lines: ReturnType<typeof got>[],
  costs: [string, number][],
): ReceiptView {
  return {
    id: code,
    code,
    orderCode: "PO-2026-051",
    supplierName: "Anh Trần Văn Hùng (cai thầu)",
    kind: "USED",
    tripNo,
    businessDate: "2026-10-24" as never,
    arrivedAt: null,
    createdAt: new Date("2026-10-24T02:10:00Z"),
    vehicle: "29C-123.45",
    createdByName: tripNo === 1 ? "Văn Tùng" : "Đức Thắng",
    locationName: "Bãi chính",
    scrapPricePerKg: null,
    lines,
    costs: costs.map(([label, amount]) => ({ label, amount: m(amount) })),
    totalCosts: m(costs.reduce((sum, [, amount]) => sum + amount, 0)),
  };
}

const TRIPS = [
  trip(
    "PN-2026-090",
    1,
    [
      got("GG-K17", 120_000, true),
      got("GG-CH", 200_000),
      got("GG-M16", 60_000, true),
      got("PK-KU", 0, true),
      got("PL-SAT", 212_500, false, "KG"),
    ],
    [
      ["Cước xe tải", 1_500_000],
      ["Bốc xếp", 300_000],
    ],
  ),
  trip(
    "PN-2026-093",
    2,
    [got("GG-K17", 80_000), got("GG-M16", 0, true), got("PK-KU", 50_000)],
    [["Cước xe tải", 500_000]],
  ),
];

describe("D3b receiving", () => {
  const summary = receivingOf(LINES, TRIPS, m(1_500_000));

  it("owes the seller the goods received and lists what is awaited", () => {
    expect(summary.payable).toBe(54_942_500);
    expect(summary.expectedGoods).toBe(60_640_000);
    expect(summary.actualCosts).toBe(2_300_000);
    expect(waitingOf(summary, LINES)).toBe("40 mâm giàn giáo 1,6m");
  });

  it("labels each line", () => {
    const byCode = new Map(
      summary.lines.map((line) => [line.orderLineId, line]),
    );
    const cell = (code: string) =>
      render(
        <ReceivedCell
          line={LINES.find((line) => line.itemCode === code) as OrderLineRow}
          summary={byCode.get(code)}
        />,
      ).container;
    expect(cell("GG-K17")).toHaveTextContent("200 cáiđủ");
    expect(cell("GG-M16")).toHaveTextContent("60 cáithiếu 40Chờ giao bù");
    expect(cell("PL-SAT")).toHaveTextContent("212,5 kgNhận dưcân dư 12,5 kg");
    expect(
      render(
        <ReceivedCell
          line={LINES[0] as OrderLineRow}
          summary={{
            orderLineId: "GG-K17",
            receivedMilli: 196_000,
            state: "SHORT_CLOSED",
            gapMilli: 4_000,
            amount: m(0),
            difference: m(0),
          }}
        />,
      ).container,
    ).toHaveTextContent("thiếu 4 · Không chờ");
  });

  it("shows each trip, its costs, and the next trip awaited", () => {
    render(<ReceivingTrips trips={TRIPS} waiting="40 mâm giàn giáo 1,6m" />);
    const first = screen.getByRole("listitem", { name: "PN-2026-090" });
    expect(first).toHaveTextContent("Đã ghi sổ");
    expect(first).toHaveTextContent("Văn Tùng");
    expect(first).toHaveTextContent("Khung giàn giáo 1,7m120 cái");
    expect(first).toHaveTextContent("Phế liệu sắt lẫn212,5 kg");
    expect(first).not.toHaveTextContent("Kích tăng U");
    expect(within(first).getByText("1.800.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("Chuyến tiếp theo")).toBeInTheDocument();
    expect(
      screen.getByText("Người bán hẹn giao bù 40 mâm giàn giáo 1,6m."),
    ).toBeInTheDocument();
  });

  it("says when no trip came yet", () => {
    render(<ReceivingTrips trips={[]} waiting={null} />);
    expect(
      screen.getByText(
        "Chưa có chuyến nhập. Thủ kho nhập hàng trên điện thoại khi xe về.",
      ),
    ).toBeInTheDocument();
  });
});

describe("historyLines", () => {
  const at = new Date("2026-10-24T02:10:00Z");
  it("reads a receipt and its backorder as one line", () => {
    expect(
      historyLines([
        {
          id: 3,
          kind: "BACKORDER_MARKED",
          actorName: "Văn Tùng",
          note: "40 mâm giàn giáo 1,6m",
          createdAt: at,
        },
        {
          id: 2,
          kind: "RECEIPT_POSTED",
          actorName: "Văn Tùng",
          note: "PN-2026-090",
          createdAt: at,
        },
        {
          id: 1,
          kind: "PLACED",
          actorName: "Quốc Bảo",
          note: null,
          createdAt: at,
        },
      ]).map((line) => line.text),
    ).toEqual([
      "Văn Tùng ghi sổ PN-2026-090, đánh dấu chờ giao bù 40 mâm giàn giáo 1,6m",
      "Quốc Bảo gửi đơn cho kho",
    ]);
  });

  it("names the storekeeper who closed the order short", () => {
    expect(
      historyLines([
        {
          id: 5,
          kind: "CLOSED",
          actorName: "Đức Thắng",
          note: "Nhận thiếu, không chờ giao bù",
          createdAt: at,
        },
        {
          id: 4,
          kind: "RECEIPT_POSTED",
          actorName: "Đức Thắng",
          note: "PN-2026-095 · đã xác nhận chi phí cao 35.000.000 ₫",
          createdAt: at,
        },
      ]).map((line) => line.text),
    ).toEqual([
      "Đức Thắng đóng đơn: Nhận thiếu, không chờ giao bù",
      "Đức Thắng ghi sổ PN-2026-095 · đã xác nhận chi phí cao 35.000.000 ₫",
    ]);
  });
});

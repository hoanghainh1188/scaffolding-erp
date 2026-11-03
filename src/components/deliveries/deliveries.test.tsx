// D6, the batch form, the note detail and the print lines (deliveries
// tasks 5.1–5.4).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import type {
  ContractDeliveries,
  DeliveryDetail,
} from "@/lib/deliveries/queries";

import { BatchForm } from "./batch-form";
import { bodyOf, fromPlan, preview } from "./batch-model";
import {
  DeliveryChecks,
  DeliveryTimeline,
  OnRentCard,
  RemainingTable,
  SiteTable,
} from "./d6-view";
import { NoteActions } from "./note-actions";
import { NoteLines } from "./note-lines";

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

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const items: ContractDeliveries["items"] = [
  {
    id: "h17",
    code: "H1,7",
    name: "Khung giàn giáo 1,7m",
    unit: "PIECE",
    condition: null,
    pricingUnit: null,
  },
  {
    id: "cheo",
    code: "CHEO1,7",
    name: "Chéo giàn giáo",
    unit: "PIECE",
    condition: null,
    pricingUnit: null,
  },
  {
    id: "mam",
    code: "MAM1,6",
    name: "Mâm giàn giáo 1,6m",
    unit: "PIECE",
    condition: null,
    pricingUnit: null,
  },
];
const kits: ContractDeliveries["kits"] = [
  {
    id: "bo17",
    code: "BO-1,7",
    name: "Bộ giàn giáo 1,7m",
    components: [
      { itemId: "h17", itemCode: "H1,7", quantity: 2 },
      { itemId: "cheo", itemCode: "CHEO1,7", quantity: 2 },
      { itemId: "mam", itemCode: "MAM1,6", quantity: 1 },
    ],
  },
];

describe("D6 blocks", () => {
  const site: ContractDeliveries["site"] = [
    {
      itemId: "h17",
      itemCode: "H1,7",
      itemName: "Khung giàn giáo 1,7m",
      unit: "PIECE",
      deliveredMilli: 320_000,
      returnedMilli: 200_000,
      lostMilli: 0,
      transferredInMilli: 0,
      transferredOutMilli: 0,
      boughtMilli: 0,
      onSiteMilli: 120_000,
      dayRent: 144_000,
    },
    {
      itemId: "cheo",
      itemCode: "CHEO1,7",
      itemName: "Chéo giàn giáo",
      unit: "PIECE",
      deliveredMilli: 360_000,
      returnedMilli: 100_000,
      lostMilli: 0,
      transferredInMilli: 0,
      transferredOutMilli: 0,
      boughtMilli: 0,
      onSiteMilli: 260_000,
      dayRent: 78_000,
    },
    {
      itemId: "mam",
      itemCode: "MAM1,6",
      itemName: "Mâm giàn giáo 1,6m",
      unit: "PIECE",
      deliveredMilli: 160_000,
      returnedMilli: 100_000,
      lostMilli: 0,
      transferredInMilli: 0,
      transferredOutMilli: 0,
      boughtMilli: 0,
      onSiteMilli: 60_000,
      dayRent: 54_000,
    },
  ];

  it("adds up the goods on site", () => {
    render(<SiteTable rows={site} />);
    const total = screen.getByRole("row", { name: /Cộng/ });
    expect(total).toHaveTextContent("840");
    expect(total).toHaveTextContent("400");
    expect(total).toHaveTextContent("440 cái");
    expect(total).toHaveTextContent("276.000 ₫");
  });

  it("shows what is on rent a day", () => {
    render(<OnRentCard rows={site} />);
    expect(screen.getByText("440 cái")).toBeInTheDocument();
    expect(screen.getByText("276.000 ₫ mỗi ngày")).toBeInTheDocument();
  });

  it("marks a line delivered past the contract", () => {
    const line = items[1] as (typeof items)[number];
    render(
      <RemainingTable
        type="RENTAL"
        rows={[
          {
            key: "cheo",
            line: {
              itemId: line.id,
              itemCode: line.code,
              unit: "PIECE",
              condition: null,
              pricingUnit: null,
              quantityMilli: 300_000,
            },
            contractMilli: 300_000,
            doneMilli: 320_000,
            remainingMilli: 0,
            overMilli: 20_000,
            openMilli: 0,
            unplannedMilli: 0,
            itemName: line.name,
            unit: "PIECE",
          },
        ]}
      />,
    );
    expect(screen.getByText("đã giao vượt 20")).toBeInTheDocument();
  });

  it("lists a note sent late from the phone", () => {
    render(
      <DeliveryChecks
        checks={[
          {
            kind: "DELIVERY",
            code: "PX-2026-142",
            businessDate: "2026-11-06" as BusinessDate,
            phoneDate: "2026-11-05" as BusinessDate,
          },
        ]}
      />,
    );
    expect(
      screen.getByText(
        "PX-2026-142 · ngày giao 06/11/2026, xác nhận trên máy 05/11/2026",
      ),
    ).toBeInTheDocument();
  });

  it("writes the timeline newest first with picking and shortage", () => {
    const base = {
      plannedDate: null,
      phoneDifferentDay: null,
      freightAmount: 1_800_000,
      companyTruck: true,
      pickingByName: null,
      returnedReason: null,
      cancelledReason: null,
      short: "",
      delivered: "",
    };
    render(
      <DeliveryTimeline
        entries={[
          {
            ...base,
            id: "3",
            code: "PX-2026-140",
            batchNo: 3,
            status: "PICKING",
            date: "2026-10-26" as BusinessDate,
            businessDate: null,
            requested: "60 bộ giàn giáo 1,7m = 120 khung, 120 chéo, 60 mâm",
            pickingByName: "Văn Tùng",
          },
          {
            ...base,
            id: "1",
            code: "PX-2026-061",
            batchNo: 1,
            status: "POSTED",
            date: "2026-06-15" as BusinessDate,
            businessDate: "2026-06-15" as BusinessDate,
            requested: "",
            delivered: "200 khung, 160 chéo, 100 mâm",
            short: "40 chéo",
          },
        ]}
      />,
    );
    expect(
      screen.getByText(
        "60 bộ giàn giáo 1,7m = 120 khung, 120 chéo, 60 mâm · Văn Tùng đang nhặt hàng · cước 1.800.000 ₫",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Xuất 200 khung, 160 chéo, 100 mâm · xuất thiếu 40 chéo · cước 1.800.000 ₫",
      ),
    ).toBeInTheDocument();
  });
});

describe("batch form model", () => {
  it("splits kits for the preview and flags what goes over", () => {
    const shown = preview(
      items,
      kits,
      [{ key: "k", kitId: "bo17", quantity: "60" }],
      [{ key: "l", lineKey: "cheo", quantity: "40" }],
      { h17: 600_000, cheo: 100_000, mam: 300_000 },
    );
    expect(shown.map((line) => [line.key, line.milli, line.overMilli])).toEqual(
      [
        ["h17", 120_000, 0],
        ["cheo", 160_000, 60_000],
        ["mam", 60_000, 0],
      ],
    );
  });

  it("builds the body with the freight only when the company calls the truck", () => {
    const state = {
      type: "RENTAL" as const,
      kits: [{ key: "k", kitId: "bo17", quantity: "60" }],
      lines: [],
      sourceLocationId: "",
      plannedDate: "2026-11-05",
      companyTruck: false,
      freight: "1800000",
      vehiclePlate: "",
      note: "",
      overConfirmed: false,
    };
    expect(bodyOf(state, items)).toMatchObject({
      kits: [{ kitId: "bo17", quantity: 60 }],
      plannedDate: "2026-11-05",
      companyTruck: false,
      freightAmount: null,
    });
    expect(bodyOf({ ...state, companyTruck: true }, items).freightAmount).toBe(
      1_800_000,
    );
  });

  it("fills rows from a plan batch", () => {
    const rows = fromPlan({
      seq: 2,
      plannedDate: "2026-11-15",
      kits: [{ kitId: "bo17", quantity: 150 }],
      lines: [{ itemId: "ku", quantity: "400.000" }],
    });
    expect(rows.kits.map((row) => [row.kitId, row.quantity])).toEqual([
      ["bo17", "150"],
    ]);
    expect(rows.lines.map((row) => [row.lineKey, row.quantity])).toEqual([
      ["ku", "400"],
    ]);
  });
});

describe("BatchForm", () => {
  const props = {
    contractId: "c1",
    type: "RENTAL" as const,
    items,
    kits,
    yards: [{ id: "bai", code: "BAI-01", name: "Bãi chính" }],
    plan: [
      {
        seq: 1,
        plannedDate: "2026-11-01",
        kits: [{ kitId: "bo17", quantity: 150 }],
        lines: [],
      },
    ],
    unplanned: { h17: 80_000, cheo: 0, mam: 0 },
    defaults: { companyTruck: true, freightPerTrip: 1_800_000 },
    onDone: vi.fn(),
  };

  it("starts from what is not on a note yet with the contract freight", () => {
    render(<BatchForm {...props} />);
    expect(screen.getByLabelText("Số lượng H1,7")).toHaveValue("80");
    expect(screen.getByLabelText("Cước chiều đi (₫)")).toHaveValue("1800000");
  });

  it("asks to confirm going over on a rental", async () => {
    render(<BatchForm {...props} />);
    await userEvent.selectOptions(
      screen.getByLabelText("Theo kế hoạch giao của hợp đồng"),
      "1",
    );
    expect(
      screen.getByLabelText(/Tôi xác nhận xuất vượt số trên hợp đồng/),
    ).toBeInTheDocument();
  });

  it("shows the server's message and goes to the new note", async () => {
    fetchMock.mockReturnValueOnce(
      reply(422, {
        success: false,
        data: null,
        error: "Cước vận chuyển không được âm.",
        field: "freightAmount",
      }),
    );
    render(<BatchForm {...props} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Lưu và gửi thủ kho" }),
    );
    expect(
      await screen.findByText("Cước vận chuyển không được âm."),
    ).toBeInTheDocument();
    fetchMock.mockReturnValueOnce(
      reply(201, { success: true, data: { code: "PX-2026-001" }, error: null }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Lưu và gửi thủ kho" }),
    );
    expect(push).toHaveBeenCalledWith("/sales/deliveries/PX-2026-001");
  });
});

describe("note detail", () => {
  it.each([
    ["PLANNED", ["In phiếu nhặt hàng", "Hủy phiếu"]],
    ["PICKING", ["In phiếu nhặt hàng", "Rút về để sửa", "Hủy phiếu"]],
    ["POSTED", ["In phiếu xuất"]],
    ["CANCELLED", []],
  ] as const)("shows the buttons of %s", (status, names) => {
    render(
      <NoteActions id="n1" code="PX-2026-140" status={status} canManage />,
    );
    const shown = screen
      .queryAllByRole("button")
      .concat(screen.queryAllByRole("link"));
    expect(shown.map((node) => node.textContent?.trim()).sort()).toEqual(
      [...names].sort(),
    );
  });

  it("hides office buttons from the accountant", () => {
    render(
      <NoteActions
        id="n1"
        code="PX-2026-140"
        status="PICKING"
        canManage={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Hủy phiếu" })).toBeNull();
  });
});

describe("note lines", () => {
  const line: DeliveryDetail["lines"][number] = {
    id: "l1",
    itemId: "h17",
    itemCode: "H1,7",
    itemName: "Khung H 1,7m có đầu",
    unit: "PIECE",
    lineUnit: "KG",
    condition: "GOOD",
    pricingUnit: "KG",
    standardWeightMilli: 13_600,
    requestedMilli: 1_250_500,
    picks: [
      {
        condition: "GOOD",
        quantityMilli: 90_000,
        weighedMilli: 1_250_500,
        piecesEstimated: false,
      },
    ],
    pickedMilli: 1_250_500,
    unitPrice: 14_000,
    amount: 17_507_000,
  };

  it("prints a sale by kg with price and money", () => {
    render(<NoteLines lines={[line]} posted prices />);
    expect(screen.getByText("90 cái · 1.250,5 kg")).toBeInTheDocument();
    expect(screen.getByText("14.000 ₫/kg")).toBeInTheDocument();
    expect(screen.getAllByText("17.507.000 ₫")).toHaveLength(2);
  });

  it("leaves the picked column blank on the picking list", () => {
    render(
      <NoteLines
        lines={[
          { ...line, picks: [], pickedMilli: 0, unitPrice: null, amount: null },
        ]}
        posted={false}
        prices={false}
        blankPicks
      />,
    );
    expect(screen.queryByText(/₫/)).toBeNull();
    expect(screen.getByText("1.250,5 kg")).toBeInTheDocument();
  });

  it("marks pieces estimated from the weighed kg", () => {
    render(
      <NoteLines
        lines={[
          {
            ...line,
            condition: "SCRAP",
            picks: [
              {
                condition: "SCRAP",
                quantityMilli: 42_000,
                weighedMilli: 570_500,
                piecesEstimated: true,
              },
            ],
          },
        ]}
        posted
        prices={false}
      />,
    );
    expect(
      screen.getByText("≈ 42 cái (ước tính từ 570,5 kg)"),
    ).toBeInTheDocument();
  });
});

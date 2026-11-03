// Planning batches and their statuses (deliveries spec "Phiếu xuất theo đợt
// của hợp đồng", "Chỉ xuất cho hợp đồng đang hiệu lực", "Mã xuất phải có
// trên bản hợp đồng đang áp dụng", "Lập đợt theo bộ hoặc theo mã", "Số cần
// vượt số còn phải giao", "Trạng thái phiếu xuất", "Chỉ sửa phiếu Chờ
// nhặt", "Cước vận chuyển…", "Nhật ký thao tác phiếu xuất"; tasks 3.1,
// 3.2, 3.7).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import {
  contract,
  deliveryNote,
  deliveryNoteLine,
  inventoryLedger,
  kitComponent,
  location,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { d5Rental, kgSale } from "@/test/contracts";
import {
  approvedContract,
  approvedRental,
  confirm,
  NOW,
  planned,
  setupDeliveryFixture,
  started,
  type DeliveryFixture,
} from "@/test/deliveries";
import {
  approveAmendment,
  createAmendment,
  submitAmendment,
  updateAmendment,
} from "@/lib/contracts/amendments";
import { cancelContract, submitContract } from "@/lib/contracts/approval";
import { createContract } from "@/lib/contracts/service";

import {
  changeDeliveryStatus,
  createDelivery,
  updateDelivery,
} from "./service";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

let fx: DeliveryFixture;
beforeEach(async () => {
  fx = await setupDeliveryFixture(ctx);
});

const kits = (quantity: number) => [{ kitId: fx.kit("BO-17"), quantity }];

async function linesOf(noteId: string) {
  const rows = await ctx.db
    .select({
      itemId: deliveryNoteLine.itemId,
      quantity: deliveryNoteLine.requestedQuantity,
    })
    .from(deliveryNoteLine)
    .where(eq(deliveryNoteLine.noteId, noteId));
  return Object.fromEntries(
    rows.map((row) => [row.itemId, row.quantity]),
  ) as Record<string, string>;
}

async function noteRow(id: string) {
  const [row] = await ctx.db
    .select()
    .from(deliveryNote)
    .where(eq(deliveryNote.id, id));
  return row;
}

describe("planning a batch", () => {
  it("numbers the note and the batch, waiting to be picked", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(60),
    });
    expect(note).toMatchObject({
      code: "PX-2026-001",
      batchNo: 1,
      status: "PLANNED",
    });
    const row = await noteRow(note.id);
    expect(row?.sourceLocationId).toBe(fx.yard);
  });

  it("splits kits into parts and merges loose lines", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(60),
      lines: [{ itemId: fx.item("GG-CH"), quantity: "40" }],
    });
    expect(await linesOf(note.id)).toEqual({
      [fx.item("GG-K17")]: "120.000",
      [fx.item("GG-CH")]: "160.000",
      [fx.item("GG-M16")]: "60.000",
    });
  });

  it("keeps its lines when the kit changes in the catalog later", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(60),
    });
    await ctx.db
      .update(kitComponent)
      .set({ quantity: 4 })
      .where(eq(kitComponent.itemId, fx.item("GG-K17")));
    expect((await linesOf(note.id))[fx.item("GG-K17")]).toBe("120.000");
  });

  it("gives batch 3 after a cancelled batch 2", async () => {
    const deal = await approvedRental(ctx, fx);
    await planned(ctx, fx, { contractId: deal.id, kits: kits(10) });
    const second = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
    });
    await changeDeliveryStatus(
      ctx.db,
      fx.sales,
      second.id,
      "CANCEL",
      "Công trình dời lịch",
    );
    const third = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
    });
    expect(third.batchNo).toBe(3);
  });

  it("refuses a contract waiting for approval", async () => {
    const saved = await createContract(ctx.db, fx.sales, d5Rental(fx));
    if (!saved.ok) throw new Error(saved.error);
    await submitContract(ctx.db, fx.sales, saved.data.id);
    const result = await createDelivery(ctx.db, fx.sales, {
      contractId: saved.data.id,
      kits: kits(10),
    });
    expect(result).toMatchObject({
      ok: false,
      error: "Hợp đồng chưa được duyệt nên chưa xuất hàng được.",
    });
  });

  it("refuses a cancelled contract", async () => {
    const deal = await approvedRental(ctx, fx);
    await ctx.db
      .update(contract)
      .set({ status: "CANCELLED" })
      .where(eq(contract.id, deal.id));
    const result = await createDelivery(ctx.db, fx.sales, {
      contractId: deal.id,
      kits: kits(10),
    });
    expect(result).toMatchObject({
      ok: false,
      error: "Hợp đồng đã hủy nên không xuất hàng được.",
    });
  });

  it("refuses an item not on the contract", async () => {
    const deal = await approvedRental(ctx, fx);
    const result = await createDelivery(ctx.db, fx.sales, {
      contractId: deal.id,
      lines: [{ itemId: fx.item("GG-K15"), quantity: "20" }],
    });
    expect(result).toMatchObject({
      ok: false,
      error:
        "Mã GG-K15 chưa có trên hợp đồng. Bạn lập phụ lục nếu khách cần thêm mã này.",
    });
  });

  it("ships an item an amendment adds only from its effective date", async () => {
    const deal = await approvedRental(ctx, fx);
    const draft = await createAmendment(ctx.db, fx.sales, deal.id, {
      today: "2026-11-05" as BusinessDate,
    });
    if (!draft.ok) throw new Error(draft.error);
    const saved = await updateAmendment(
      ctx.db,
      fx.sales,
      deal.id,
      draft.data.number,
      {
        ...d5Rental(fx),
        lines: [
          { itemId: fx.item("PK-KU"), quantity: "400" },
          { itemId: fx.item("GG-K17"), quantity: "0" },
          { itemId: fx.item("GG-K15"), quantity: "20", price: 1100 },
        ],
        effectiveFrom: "2026-12-15",
        reason: "Khách thuê thêm khung 1,5m",
        updatedAt: draft.data.updatedAt,
      },
    );
    if (!saved.ok) throw new Error(saved.error);
    const sent = await submitAmendment(
      ctx.db,
      fx.sales,
      deal.id,
      draft.data.number,
    );
    if (!sent.ok) throw new Error(sent.error);
    const done = await approveAmendment(
      ctx.db,
      fx.director,
      deal.id,
      draft.data.number,
      null,
    );
    if (!done.ok) throw new Error(done.error);
    const body = {
      contractId: deal.id,
      lines: [{ itemId: fx.item("GG-K15"), quantity: "20" }],
    };
    const early = await createDelivery(ctx.db, fx.sales, body, {
      now: new Date("2026-12-10T03:00:00Z"),
    });
    expect(early).toMatchObject({
      ok: false,
      error: "Mã GG-K15 chỉ có trên hợp đồng từ 15/12/2026.",
    });
    const onTime = await createDelivery(ctx.db, fx.sales, body, {
      now: new Date("2026-12-15T03:00:00Z"),
    });
    expect(onTime.ok).toBe(true);
  });

  it("refuses a kit whose part is not on the contract", async () => {
    const deal = await approvedContract(ctx, fx, {
      ...d5Rental(fx),
      kits: [],
      lines: [
        { itemId: fx.item("GG-K17"), quantity: "600" },
        { itemId: fx.item("GG-CH"), quantity: "600" },
      ],
      batches: [],
    });
    const result = await createDelivery(ctx.db, fx.sales, {
      contractId: deal.id,
      kits: kits(60),
    });
    expect(result).toMatchObject({
      ok: false,
      error:
        "Bộ BO-17 có mã GG-M16 chưa có trên hợp đồng. Bạn chọn từng mã hoặc lập phụ lục thêm mã này.",
    });
  });

  it("refuses the workshop and an archived yard", async () => {
    const deal = await approvedRental(ctx, fx);
    const workshop = await fx.place("XUONG-01");
    expect(
      await createDelivery(ctx.db, fx.sales, {
        contractId: deal.id,
        kits: kits(10),
        sourceLocationId: workshop,
      }),
    ).toMatchObject({
      ok: false,
      status: 422,
      error: "Phiếu xuất chỉ lấy hàng từ bãi.",
    });
    const [second] = await ctx.db
      .insert(location)
      .values({
        code: "BAI-02",
        name: "Bãi phụ",
        type: "YARD",
        status: "ARCHIVED",
      })
      .returning({ id: location.id });
    expect(
      await createDelivery(ctx.db, fx.sales, {
        contractId: deal.id,
        kits: kits(10),
        sourceLocationId: second?.id,
      }),
    ).toMatchObject({
      ok: false,
      error: "Bãi BAI-02 đã ngừng dùng. Bạn chọn bãi khác.",
    });
  });

  it("takes the freight from the contract and lets the office change it", async () => {
    const deal = await approvedContract(ctx, fx, {
      ...d5Rental(fx),
      companyTruck: true,
      freightPerTrip: 1_800_000,
    });
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
    });
    const row = await noteRow(note.id);
    expect([row?.companyTruck, row?.freightAmount]).toEqual([true, 1_800_000]);
    const edited = await updateDelivery(ctx.db, fx.sales, note.id, {
      kits: kits(10),
      freightAmount: 2_400_000,
      updatedAt: note.updatedAt,
    });
    expect(edited.ok).toBe(true);
    expect((await noteRow(note.id))?.freightAmount).toBe(2_400_000);
    const negative = await createDelivery(ctx.db, fx.sales, {
      contractId: deal.id,
      kits: kits(10),
      freightAmount: -100_000,
    });
    expect(negative).toMatchObject({
      ok: false,
      status: 422,
      error: "Cước vận chuyển không được âm.",
      field: "freightAmount",
    });
  });

  it("keeps the plate of a customer truck without freight", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
      vehiclePlate: "51C-456.78",
    });
    const row = await noteRow(note.id);
    expect([row?.companyTruck, row?.freightAmount, row?.vehiclePlate]).toEqual([
      false,
      null,
      "51C-456.78",
    ]);
  });
});

describe("going over what is left", () => {
  // The D5 rental has 600 GG-CH. 520 delivered leaves 80 to plan.
  async function eightyLeft() {
    const deal = await approvedRental(ctx, fx);
    const first = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [{ itemId: fx.item("GG-CH"), quantity: "520" }],
    });
    const version = await started(ctx, fx, first.id);
    const [line] = await ctx.db
      .select({ id: deliveryNoteLine.id })
      .from(deliveryNoteLine)
      .where(eq(deliveryNoteLine.noteId, first.id));
    const posted = await confirm(ctx, fx, first.id, version, [
      { lineId: line?.id, condition: "GOOD", quantity: "520" },
    ]);
    if (!posted.ok) throw new Error(posted.error);
    return deal;
  }

  it("asks a rental to confirm, then logs it as an anomaly", async () => {
    const deal = await eightyLeft();
    const body = {
      contractId: deal.id,
      lines: [{ itemId: fx.item("GG-CH"), quantity: "100" }],
    };
    expect(
      await createDelivery(ctx.db, fx.sales, body, { now: NOW }),
    ).toMatchObject({
      ok: false,
      error:
        "Đợt này xuất GG-CH nhiều hơn số còn phải giao 20 cái. Bạn tích xác nhận nếu vẫn muốn xuất.",
    });
    const saved = await createDelivery(
      ctx.db,
      fx.sales,
      { ...body, overContractConfirmed: true },
      { now: NOW },
    );
    if (!saved.ok) throw new Error(saved.error);
    const [row] = await activityRows(ctx.db, saved.data.code);
    expect(row?.flags).toContain("ANOMALY");
    expect(row?.summary).toContain("vượt hợp đồng 20 GG-CH");
  });

  it("refuses a sale going over", async () => {
    const deal = await approvedContract(ctx, fx, {
      ...kgSale(fx),
      lines: [
        {
          itemId: fx.item("GG-K17"),
          condition: "NEW",
          pricingUnit: "ITEM",
          quantity: "150",
          price: 320_000,
        },
      ],
    });
    const result = await createDelivery(ctx.db, fx.sales, {
      contractId: deal.id,
      lines: [
        {
          itemId: fx.item("GG-K17"),
          condition: "NEW",
          pricingUnit: "ITEM",
          quantity: "160",
        },
      ],
    });
    expect(result).toMatchObject({
      ok: false,
      error:
        "Hợp đồng bán chỉ còn phải giao 150 cái GG-K17 Mới. Bạn lập phụ lục nếu khách mua thêm.",
    });
  });
});

describe("statuses", () => {
  it("records who started picking", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
    });
    await started(ctx, fx, note.id);
    const row = await noteRow(note.id);
    expect([row?.status, row?.pickingBy]).toEqual(["PICKING", fx.warehouse.id]);
  });

  it("needs a reason to give a note back", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
    });
    await started(ctx, fx, note.id);
    const blank = await changeDeliveryStatus(
      ctx.db,
      fx.warehouse,
      note.id,
      "RETURN",
      "  ",
    );
    expect(blank).toMatchObject({
      ok: false,
      error: "Bạn ghi lý do để văn phòng biết cần đổi gì.",
    });
    expect((await noteRow(note.id))?.status).toBe("PICKING");
    const given = await changeDeliveryStatus(
      ctx.db,
      fx.warehouse,
      note.id,
      "RETURN",
      "Bãi hết chéo, văn phòng đổi đợt",
    );
    expect(given.ok).toBe(true);
    const row = await noteRow(note.id);
    expect([row?.status, row?.returnedReason]).toEqual([
      "PLANNED",
      "Bãi hết chéo, văn phòng đổi đợt",
    ]);
  });

  it("refuses to edit a note being picked", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
    });
    const version = await started(ctx, fx, note.id);
    const result = await updateDelivery(ctx.db, fx.sales, note.id, {
      kits: kits(20),
      updatedAt: version,
    });
    expect(result).toMatchObject({
      ok: false,
      error: `Thủ kho đang nhặt phiếu ${note.code}. Bạn rút phiếu về để sửa.`,
    });
  });

  it("answers 409 to the second of two edits", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
    });
    const first = await updateDelivery(
      ctx.db,
      fx.director,
      note.id,
      {
        kits: kits(12),
        updatedAt: note.updatedAt,
      },
      { now: new Date(NOW.getTime() + 60_000) },
    );
    expect(first.ok).toBe(true);
    const second = await updateDelivery(ctx.db, fx.sales, note.id, {
      kits: kits(14),
      updatedAt: note.updatedAt,
    });
    expect(second).toEqual({
      ok: false,
      status: 409,
      error: "Phiếu vừa được người khác sửa. Bạn tải lại để xem bản mới.",
    });
    expect((await linesOf(note.id))[fx.item("GG-K17")]).toBe("24.000");
  });

  it("cancels a waiting note without touching the ledger", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
    });
    const result = await changeDeliveryStatus(
      ctx.db,
      fx.sales,
      note.id,
      "CANCEL",
      "Công trình dời lịch",
    );
    expect(result).toMatchObject({
      ok: true,
      data: { code: note.code, status: "CANCELLED" },
    });
    const ledger = await ctx.db
      .select()
      .from(inventoryLedger)
      .where(eq(inventoryLedger.documentCode, note.code));
    expect(ledger).toEqual([]);
  });

  it("refuses to cancel a posted note", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [{ itemId: fx.item("PK-KU"), quantity: "10" }],
    });
    const version = await started(ctx, fx, note.id);
    const [line] = await ctx.db
      .select({ id: deliveryNoteLine.id })
      .from(deliveryNoteLine)
      .where(eq(deliveryNoteLine.noteId, note.id));
    await confirm(ctx, fx, note.id, version, [
      { lineId: line?.id, condition: "NEW", quantity: "10" },
    ]);
    const result = await changeDeliveryStatus(
      ctx.db,
      fx.sales,
      note.id,
      "CANCEL",
      "Nhầm",
    );
    expect(result).toMatchObject({
      ok: false,
      error: `Phiếu ${note.code} đã xuất nên không hủy được. Hàng xuất nhầm thì lập phiếu thu hồi.`,
    });
  });

  it("keeps the picker and the office apart", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
    });
    expect(
      await changeDeliveryStatus(ctx.db, fx.sales, note.id, "START"),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      await createDelivery(ctx.db, fx.warehouse, {
        contractId: deal.id,
        kits: kits(10),
      }),
    ).toMatchObject({ ok: false, status: 403 });
    const saleOnly = await fx.seller("thuyvy", "SALE");
    expect(
      await createDelivery(ctx.db, saleOnly, {
        contractId: deal.id,
        kits: kits(10),
      }),
    ).toMatchObject({ ok: false, status: 403 });
  });
});

describe("activity log", () => {
  it("writes exactly one row per command", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(60),
    });
    const unchanged = await updateDelivery(ctx.db, fx.sales, note.id, {
      kits: kits(60),
      updatedAt: note.updatedAt,
    });
    expect(unchanged.ok).toBe(true);
    const later = new Date(NOW.getTime() + 60_000);
    const edited = await updateDelivery(
      ctx.db,
      fx.sales,
      note.id,
      { kits: kits(50), updatedAt: note.updatedAt },
      { now: later },
    );
    if (!edited.ok) throw new Error(edited.error);
    await started(ctx, fx, note.id, new Date(later.getTime() + 60_000));
    await changeDeliveryStatus(
      ctx.db,
      fx.sales,
      note.id,
      "RECALL",
      "Khách đổi lịch",
    );
    await started(ctx, fx, note.id, new Date(later.getTime() + 180_000));
    await changeDeliveryStatus(
      ctx.db,
      fx.warehouse,
      note.id,
      "RETURN",
      "Xe không tới",
    );
    await changeDeliveryStatus(
      ctx.db,
      fx.sales,
      note.id,
      "CANCEL",
      "Công trình dời lịch",
    );
    // Refused: nothing logged.
    await changeDeliveryStatus(ctx.db, fx.sales, note.id, "CANCEL", "Lần hai");
    const rows = await activityRows(ctx.db, note.code);
    expect(rows.map((row) => row.action)).toEqual([
      "CREATE",
      "UPDATE",
      "START",
      "RETURN",
      "START",
      "RETURN",
      "CANCEL",
    ]);
    expect(rows[0]?.summary).toBe("Đợt 1 · 60 bộ giàn giáo 1,7m = 3 mã");
    expect(rows.every((row) => row.documentType === "DELIVERY_NOTE")).toBe(
      true,
    );
  });
});

describe("cancelling the contract (hasDeliveries)", () => {
  it("is refused once a note is posted", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [{ itemId: fx.item("PK-KU"), quantity: "10" }],
    });
    const version = await started(ctx, fx, note.id);
    const [line] = await ctx.db
      .select({ id: deliveryNoteLine.id })
      .from(deliveryNoteLine)
      .where(eq(deliveryNoteLine.noteId, note.id));
    await confirm(ctx, fx, note.id, version, [
      { lineId: line?.id, condition: "NEW", quantity: "10" },
    ]);
    // ACTIVE now; put it back to APPROVED to reach the hasDeliveries rule.
    await ctx.db
      .update(contract)
      .set({ status: "APPROVED" })
      .where(eq(contract.id, deal.id));
    expect(
      await cancelContract(ctx.db, fx.director, deal.id, "Khách hủy"),
    ).toMatchObject({
      ok: false,
      error: "Hợp đồng đã xuất hàng nên không hủy được.",
    });
  });

  it("is refused while a note is not finished", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
    });
    expect(
      await cancelContract(ctx.db, fx.director, deal.id, "Khách hủy"),
    ).toMatchObject({
      ok: false,
      error: `Hợp đồng còn phiếu xuất ${note.code} chưa xong. Bạn hủy phiếu xuất đó trước rồi hủy hợp đồng.`,
    });
  });

  it("goes through when every note is cancelled", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
    });
    await changeDeliveryStatus(
      ctx.db,
      fx.sales,
      note.id,
      "CANCEL",
      "Công trình dời lịch",
    );
    expect(
      await cancelContract(ctx.db, fx.director, deal.id, "Khách hủy"),
    ).toMatchObject({ ok: true });
  });
});

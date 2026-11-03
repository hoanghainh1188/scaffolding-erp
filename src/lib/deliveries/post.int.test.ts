// "Xác nhận xe rời bãi" (deliveries spec "Ghi sổ xuất thuê", "Ghi sổ xuất
// bán", "Xuất thiếu", "Một lần xác nhận chỉ ghi sổ một lần", "Hợp đồng
// chuyển Đang thực hiện khi xuất lần đầu"; tasks 3.3, 3.4).
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import {
  contract,
  deliveryNote,
  deliveryNoteLine,
  inventoryCost,
  inventoryLedger,
  site,
} from "@/db/schema";
import { quantityFromDb } from "@/domain/quantity";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { kgSale } from "@/test/contracts";
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
import { reconcileInventory } from "@/lib/inventory/reconcile";

import { postDelivery } from "./post";
import { changeDeliveryStatus, updateDelivery } from "./service";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

let fx: DeliveryFixture;
beforeEach(async () => {
  fx = await setupDeliveryFixture(ctx);
});

const milli = (value: string) => quantityFromDb(value, "KG").milli;

async function linesOf(noteId: string) {
  const rows = await ctx.db
    .select({ id: deliveryNoteLine.id, itemId: deliveryNoteLine.itemId })
    .from(deliveryNoteLine)
    .where(eq(deliveryNoteLine.noteId, noteId));
  return (itemCode: string) => {
    const row = rows.find((entry) => entry.itemId === fx.item(itemCode));
    if (!row) throw new Error(`no line ${itemCode}`);
    return row.id;
  };
}

async function ledgerOf(code: string) {
  return ctx.db
    .select()
    .from(inventoryLedger)
    .where(eq(inventoryLedger.documentCode, code));
}

async function stock(itemCode: string, condition: string, locationId: string) {
  const rows = await ctx.db
    .select({ quantity: inventoryLedger.quantity })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, fx.item(itemCode)),
        eq(inventoryLedger.condition, condition),
        eq(inventoryLedger.locationId, locationId),
      ),
    );
  return rows.reduce((sum, row) => sum + milli(row.quantity), 0) / 1000;
}

async function average(itemCode: string, condition: string) {
  const [row] = await ctx.db
    .select({ avgCost: inventoryCost.avgCost })
    .from(inventoryCost)
    .where(
      and(
        eq(inventoryCost.itemId, fx.item(itemCode)),
        eq(inventoryCost.condition, condition),
      ),
    );
  return row?.avgCost;
}

async function siteLocation() {
  const [row] = await ctx.db
    .select({ locationId: site.locationId })
    .from(site)
    .where(eq(site.id, fx.site("Trường THCS Dương Nội")));
  return row?.locationId ?? "";
}

/** Đợt 1 of the D5 rental: 60 kits (120 / 120 / 60), picked by vantung. */
async function pickingBatch() {
  const deal = await approvedRental(ctx, fx);
  const note = await planned(ctx, fx, {
    contractId: deal.id,
    kits: [{ kitId: fx.kit("BO-17"), quantity: 60 }],
  });
  const version = await started(ctx, fx, note.id);
  return { deal, note, version, line: await linesOf(note.id) };
}

async function contractStatus(id: string) {
  const [row] = await ctx.db
    .select({ status: contract.status })
    .from(contract)
    .where(eq(contract.id, id));
  return row?.status;
}

describe("posting a rental note", () => {
  it("moves the goods from the yard to the site at the current average", async () => {
    const { deal, note, version, line } = await pickingBatch();
    const result = await confirm(ctx, fx, note.id, version, [
      { lineId: line("GG-K17"), condition: "GOOD", quantity: "120" },
      { lineId: line("GG-CH"), condition: "NEW", quantity: "80" },
      { lineId: line("GG-CH"), condition: "GOOD", quantity: "40" },
      { lineId: line("GG-M16"), condition: "GOOD", quantity: "60" },
    ]);
    expect(result).toMatchObject({
      ok: true,
      data: {
        code: note.code,
        businessDate: "2026-11-03",
        contractStarted: true,
      },
    });
    const rows = await ledgerOf(note.code);
    const place = await siteLocation();
    expect(rows).toHaveLength(8);
    const khung = rows.filter((row) => row.itemId === fx.item("GG-K17"));
    expect(
      khung.map((row) => [
        row.movement,
        row.locationId,
        milli(row.quantity),
        row.unitCost,
      ]),
    ).toEqual([
      ["DELIVERY_OUT", fx.yard, -120_000, 195_000],
      ["DELIVERY_IN", place, 120_000, 195_000],
    ]);
    expect(rows.every((row) => row.businessDate === "2026-11-03")).toBe(true);
    expect(await average("GG-K17", "GOOD")).toBe(195_000);
    expect(await average("GG-CH", "NEW")).toBe(60_000);
    expect(await stock("GG-K17", "GOOD", fx.yard)).toBe(1120);
    expect(await stock("GG-K17", "GOOD", place)).toBe(120);
    expect(await contractStatus(deal.id)).toBe("ACTIVE");
    expect(await reconcileInventory(ctx.db)).toEqual([]);
  });

  it("logs one posting row with the shortage and the contract start", async () => {
    const { note, version, line } = await pickingBatch();
    await confirm(ctx, fx, note.id, version, [
      { lineId: line("GG-K17"), condition: "GOOD", quantity: "120" },
      { lineId: line("GG-CH"), condition: "GOOD", quantity: "80" },
      { lineId: line("GG-M16"), condition: "GOOD", quantity: "60" },
    ]);
    const rows = (await activityRows(ctx.db, note.code)).filter(
      (row) => row.action === "POST",
    );
    // Lines follow the contract's line order, which kits do not fix.
    expect(rows).toHaveLength(1);
    const summary = rows[0]?.summary ?? "";
    expect(summary).toMatch(
      /^Xuất .+ · thiếu 40 chéo · hợp đồng sang Đang thực hiện$/,
    );
    for (const part of ["120 khung", "80 chéo", "60 mâm"]) {
      expect(summary).toContain(part);
    }
    const contractRows = (await activityRows(ctx.db)).filter(
      (row) => row.documentType === "CONTRACT" && row.action === "POST",
    );
    expect(contractRows).toEqual([]);
  });

  it.each(["NEEDS_REPAIR", "SCRAP"])(
    "refuses %s goods for a rental",
    async (condition) => {
      const { note, version, line } = await pickingBatch();
      const result = await confirm(ctx, fx, note.id, version, [
        { lineId: line("GG-M16"), condition, quantity: "5" },
      ]);
      expect(result).toEqual({
        ok: false,
        status: 409,
        error: "Hợp đồng thuê chỉ xuất hàng Mới hoặc Tốt.",
      });
      expect(await ledgerOf(note.code)).toEqual([]);
    },
  );

  it("refuses the whole note when the yard runs short", async () => {
    const { deal, note, version, line } = await pickingBatch();
    const result = await confirm(ctx, fx, note.id, version, [
      { lineId: line("GG-K17"), condition: "NEW", quantity: "120" },
    ]);
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Không đủ hàng: GG-K17 Mới tại BAI-01 còn 100 cái",
    });
    expect(await ledgerOf(note.code)).toEqual([]);
    const [row] = await ctx.db
      .select({ status: deliveryNote.status })
      .from(deliveryNote)
      .where(eq(deliveryNote.id, note.id));
    expect(row?.status).toBe("PICKING");
    expect(await contractStatus(deal.id)).toBe("APPROVED");
    expect(
      (await activityRows(ctx.db, note.code)).filter(
        (entry) => entry.action === "POST",
      ),
    ).toEqual([]);
  });

  it("does not touch the contract status on the second note", async () => {
    const first = await pickingBatch();
    await confirm(ctx, fx, first.note.id, first.version, [
      { lineId: first.line("GG-K17"), condition: "GOOD", quantity: "120" },
    ]);
    const second = await planned(ctx, fx, {
      contractId: first.deal.id,
      lines: [{ itemId: fx.item("PK-KU"), quantity: "100" }],
    });
    const version = await started(ctx, fx, second.id);
    const line = await linesOf(second.id);
    const result = await confirm(ctx, fx, second.id, version, [
      { lineId: line("PK-KU"), condition: "NEW", quantity: "100" },
    ]);
    expect(result).toMatchObject({
      ok: true,
      data: { contractStarted: false },
    });
    expect(await contractStatus(first.deal.id)).toBe("ACTIVE");
  });

  it("refuses a closed contract", async () => {
    const { deal, note, version, line } = await pickingBatch();
    await ctx.db
      .update(contract)
      .set({ status: "CLOSED" })
      .where(eq(contract.id, deal.id));
    const result = await confirm(ctx, fx, note.id, version, [
      { lineId: line("GG-K17"), condition: "GOOD", quantity: "120" },
    ]);
    expect(result).toMatchObject({
      ok: false,
      error: "Hợp đồng đã thanh lý nên không xuất hàng được.",
    });
  });

  it("dates the note on the posting day, Vietnam time", async () => {
    const { note, version, line } = await pickingBatch();
    // 21:30 on 03/11/2026 in Vietnam.
    const night = new Date("2026-11-03T14:30:00Z");
    const result = await confirm(
      ctx,
      fx,
      note.id,
      version,
      [{ lineId: line("GG-K17"), condition: "GOOD", quantity: "120" }],
      { now: night },
    );
    expect(result).toMatchObject({
      ok: true,
      data: { businessDate: "2026-11-03" },
    });
  });

  it("refuses picking more than the line needs", async () => {
    const { note, version, line } = await pickingBatch();
    const result = await confirm(ctx, fx, note.id, version, [
      { lineId: line("GG-K17"), condition: "GOOD", quantity: "130" },
    ]);
    expect(result).toMatchObject({
      ok: false,
      error:
        "Bạn nhặt 130 cái GG-K17, nhiều hơn số cần 120 cái. Văn phòng cần sửa phiếu nếu muốn xuất thêm.",
    });
  });

  it("needs a truck plate", async () => {
    const { note, version, line } = await pickingBatch();
    const result = await postDelivery(ctx.db, fx.warehouse, note.id, {
      clientDraftId: randomUUID(),
      startedVersion: version,
      vehiclePlate: " ",
      picks: [{ lineId: line("GG-K17"), condition: "GOOD", quantity: "120" }],
    });
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      error: "Bạn nhập biển số xe chở hàng.",
      field: "vehiclePlate",
    });
  });

  it("is refused to a seller", async () => {
    const { note, version, line } = await pickingBatch();
    const result = await confirm(
      ctx,
      fx,
      note.id,
      version,
      [{ lineId: line("GG-K17"), condition: "GOOD", quantity: "120" }],
      { actor: fx.sales },
    );
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(await ledgerOf(note.code)).toEqual([]);
  });
});

describe("one confirmation, one posting", () => {
  it("answers a resend of the same draft with the posted note", async () => {
    const { note, version, line } = await pickingBatch();
    const draftId = randomUUID();
    const picks = [
      { lineId: line("GG-K17"), condition: "GOOD", quantity: "120" },
    ];
    const first = await confirm(ctx, fx, note.id, version, picks, { draftId });
    const again = await confirm(ctx, fx, note.id, version, picks, { draftId });
    expect(first).toMatchObject({ ok: true, data: { replayed: false } });
    expect(again).toMatchObject({
      ok: true,
      data: { code: note.code, replayed: true },
    });
    expect(await ledgerOf(note.code)).toHaveLength(2);
    expect(
      (await activityRows(ctx.db, note.code)).filter(
        (row) => row.action === "POST",
      ),
    ).toHaveLength(1);
  });

  it("posts once when two storekeepers confirm together", async () => {
    const { note, version, line } = await pickingBatch();
    const picks = [
      { lineId: line("GG-K17"), condition: "GOOD", quantity: "120" },
    ];
    const [a, b] = await Promise.all([
      confirm(ctx, fx, note.id, version, picks),
      postDelivery(
        other.db,
        fx.warehouse,
        note.id,
        {
          clientDraftId: randomUUID(),
          startedVersion: version,
          vehiclePlate: "51X-000.02",
          picks,
        },
        { now: NOW },
      ),
    ]);
    const results = [a, b];
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const refused = results.find((result) => !result.ok);
    expect(refused).toMatchObject({
      ok: false,
      status: 409,
      error: `Phiếu ${note.code} đã xuất lúc 10:42 do Văn Tùng xác nhận.`,
    });
    expect(await stock("GG-K17", "GOOD", fx.yard)).toBe(1120);
  });

  it("posts once when one draft is sent twice at once", async () => {
    const { note, version, line } = await pickingBatch();
    const draftId = randomUUID();
    const body = {
      clientDraftId: draftId,
      startedVersion: version,
      vehiclePlate: "51X-000.01",
      picks: [{ lineId: line("GG-K17"), condition: "GOOD", quantity: "120" }],
    };
    const results = await Promise.all([
      postDelivery(ctx.db, fx.warehouse, note.id, body, { now: NOW }),
      postDelivery(other.db, fx.warehouse, note.id, body, { now: NOW }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await ledgerOf(note.code)).toHaveLength(2);
  });

  it("refuses the phone after the office recalled the note", async () => {
    const { note, version, line } = await pickingBatch();
    const recalled = await changeDeliveryStatus(
      ctx.db,
      fx.sales,
      note.id,
      "RECALL",
      "Khách đổi sang 50 bộ",
      { now: NOW },
    );
    expect(recalled.ok).toBe(true);
    if (!recalled.ok) return;
    const edited = await updateDelivery(
      ctx.db,
      fx.sales,
      note.id,
      {
        kits: [{ kitId: fx.kit("BO-17"), quantity: 50 }],
        updatedAt: recalled.data.updatedAt,
      },
      { now: new Date(NOW.getTime() + 60_000) },
    );
    expect(edited.ok).toBe(true);
    await started(ctx, fx, note.id, new Date(NOW.getTime() + 120_000));
    const result = await confirm(ctx, fx, note.id, version, [
      { lineId: line("GG-K17"), condition: "GOOD", quantity: "100" },
    ]);
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: `Văn phòng đã đổi phiếu ${note.code} sau khi bạn bắt đầu nhặt. Bạn mở lại phiếu để nhặt theo số mới.`,
    });
    expect(await ledgerOf(note.code)).toEqual([]);
  });
});

describe("posting a sale note", () => {
  async function saleBatch(quantity = "1250,5") {
    const deal = await approvedContract(ctx, fx, kgSale(fx));
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [
        {
          itemId: fx.item("GG-K17"),
          condition: "GOOD",
          pricingUnit: "KG",
          quantity,
        },
      ],
    });
    const version = await started(ctx, fx, note.id);
    return { deal, note, version, line: await linesOf(note.id) };
  }

  it("sells by kg: pieces leave the stock, weighed kg on the ledger", async () => {
    const { deal, note, version, line } = await saleBatch();
    const result = await confirm(ctx, fx, note.id, version, [
      {
        lineId: line("GG-K17"),
        condition: "GOOD",
        quantity: "90",
        weighedKg: "1250,5",
      },
    ]);
    expect(result.ok).toBe(true);
    const rows = await ledgerOf(note.code);
    expect(
      rows.map((row) => [
        row.movement,
        row.locationId,
        milli(row.quantity),
        row.weighedKg,
      ]),
    ).toEqual([["SALE_OUT", fx.yard, -90_000, "1250.500"]]);
    expect(await average("GG-K17", "GOOD")).toBe(195_000);
    const [price] = await ctx.db
      .select({ unitPrice: deliveryNoteLine.unitPrice })
      .from(deliveryNoteLine)
      .where(eq(deliveryNoteLine.noteId, note.id));
    expect(price?.unitPrice).toBe(14_000);
    expect(await contractStatus(deal.id)).toBe("ACTIVE");
  });

  it("lets a weighing within 10 % through and refuses one past it", async () => {
    const first = await saleBatch();
    const over = await confirm(ctx, fx, first.note.id, first.version, [
      {
        lineId: first.line("GG-K17"),
        condition: "GOOD",
        quantity: "100",
        weighedKg: "1400",
      },
    ]);
    expect(over).toMatchObject({
      ok: false,
      error:
        "Kg cân của GG-K17 Tốt (1.400 kg) vượt số cần 1.250,5 kg quá 10 %. Văn phòng cần sửa phiếu hoặc lập phụ lục.",
    });
    const inside = await confirm(ctx, fx, first.note.id, first.version, [
      {
        lineId: first.line("GG-K17"),
        condition: "GOOD",
        quantity: "93",
        weighedKg: "1258",
      },
    ]);
    expect(inside.ok).toBe(true);
  });

  it("needs the weighed kg", async () => {
    const { note, version, line } = await saleBatch();
    const result = await confirm(ctx, fx, note.id, version, [
      { lineId: line("GG-K17"), condition: "GOOD", quantity: "90" },
    ]);
    expect(result).toMatchObject({
      ok: false,
      error: "Dòng GG-K17 Tốt bán theo kg, bạn nhập số kg cân.",
    });
  });

  it("refuses a second note past what is left to sell", async () => {
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
    const line = (quantity: string) => ({
      contractId: deal.id,
      lines: [
        {
          itemId: fx.item("GG-K17"),
          condition: "NEW",
          pricingUnit: "ITEM",
          quantity,
        },
      ],
    });
    const a = await planned(ctx, fx, line("100"));
    const b = await planned(ctx, fx, line("50"));
    // B planned on a stale screen asks for 100 as well.
    await ctx.db
      .update(deliveryNoteLine)
      .set({ requestedQuantity: "100" })
      .where(eq(deliveryNoteLine.noteId, b.id));
    const va = await started(ctx, fx, a.id);
    const vb = await started(ctx, fx, b.id);
    const lineA = await linesOf(a.id);
    const lineB = await linesOf(b.id);
    const posted = await confirm(ctx, fx, a.id, va, [
      { lineId: lineA("GG-K17"), condition: "NEW", quantity: "100" },
    ]);
    expect(posted.ok).toBe(true);
    const refused = await confirm(ctx, fx, b.id, vb, [
      { lineId: lineB("GG-K17"), condition: "NEW", quantity: "100" },
    ]);
    expect(refused).toMatchObject({
      ok: false,
      error: "Hợp đồng bán chỉ còn phải giao 50 cái GG-K17 Mới.",
    });
    expect(await ledgerOf(b.code)).toEqual([]);
  });

  it("writes only a sale line when the customer picks up at the yard", async () => {
    const deal = await approvedContract(ctx, fx, {
      ...kgSale(fx),
      lines: [
        {
          itemId: fx.item("PK-KU"),
          condition: "NEW",
          pricingUnit: "ITEM",
          quantity: "50",
          price: 40_000,
        },
      ],
    });
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [
        {
          itemId: fx.item("PK-KU"),
          condition: "NEW",
          pricingUnit: "ITEM",
          quantity: "50",
        },
      ],
    });
    const version = await started(ctx, fx, note.id);
    const line = await linesOf(note.id);
    await confirm(ctx, fx, note.id, version, [
      { lineId: line("PK-KU"), condition: "NEW", quantity: "50" },
    ]);
    const rows = await ledgerOf(note.code);
    expect(rows.map((row) => [row.movement, row.locationId])).toEqual([
      ["SALE_OUT", fx.yard],
    ]);
  });
});

// Sale notes and edge inputs (deliveries spec "Ghi sổ xuất bán", "Phế liệu
// không đếm được số cái", "Quyền với phiếu xuất", design D5, D9, D12).
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  deliveryNoteLine,
  deliveryNotePick,
  inventoryLedger,
  location,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
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
  stockUp,
  TODAY,
  type DeliveryFixture,
} from "@/test/deliveries";

import { postDelivery } from "./post";
import {
  contractDeliveries,
  deliveriesByDay,
  deliveryDetail,
  mobileNote,
} from "./queries";
import { createDelivery, updateDelivery } from "./service";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: DeliveryFixture;
beforeEach(async () => {
  fx = await setupDeliveryFixture(ctx);
});

async function lineId(noteId: string) {
  const [row] = await ctx.db
    .select({ id: deliveryNoteLine.id })
    .from(deliveryNoteLine)
    .where(eq(deliveryNoteLine.noteId, noteId));
  return row?.id;
}

/** A sale of 10 GG-M16 Phế liệu by kg at 7.500 ₫/kg, picked up at the yard. */
async function scrapSale() {
  return approvedContract(ctx, fx, {
    ...kgSale(fx),
    lines: [
      {
        itemId: fx.item("GG-M16"),
        condition: "SCRAP",
        pricingUnit: "KG",
        quantity: "200",
        price: 7_500,
      },
    ],
  });
}

describe("a sale picked up at the yard", () => {
  it("shows delivered and left on D6, priced money on the detail, none on M5", async () => {
    const deal = await scrapSale();
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [
        {
          itemId: fx.item("GG-M16"),
          condition: "SCRAP",
          pricingUnit: "KG",
          quantity: "200",
        },
      ],
    });
    const phone = await mobileNote(ctx.db, note.code);
    expect(phone?.contractType).toBe("SALE");
    expect(phone?.lines[0]).toMatchObject({
      byKg: true,
      lineUnit: "KG",
      stock: [{ condition: "SCRAP", milli: 10_000 }],
    });
    const version = await started(ctx, fx, note.id);
    const posted = await confirm(ctx, fx, note.id, version, [
      {
        lineId: await lineId(note.id),
        condition: "SCRAP",
        quantity: "8",
        weighedKg: "110",
        piecesEstimated: true,
      },
    ]);
    expect(posted.ok).toBe(true);
    const [pick] = await ctx.db
      .select()
      .from(deliveryNotePick)
      .where(eq(deliveryNotePick.lineId, (await lineId(note.id)) ?? ""));
    expect([pick?.quantity, pick?.weighedKg, pick?.piecesEstimated]).toEqual([
      "8.000",
      "110.000",
      true,
    ]);

    const d6 = await contractDeliveries(ctx.db, fx.sales, deal.id, TODAY);
    if (!d6.ok) throw new Error(d6.error);
    expect(d6.data.site).toEqual([]);
    expect(d6.data.remaining[0]).toMatchObject({
      doneMilli: 110_000,
      remainingMilli: 90_000,
    });
    expect(d6.data.timeline[0]?.delivered).toBe("110 kg mâm");

    const detail = await deliveryDetail(ctx.db, fx.accountant, note.code);
    if (!detail.ok) throw new Error(detail.error);
    expect(detail.data.lines[0]).toMatchObject({
      unitPrice: 7_500,
      amount: 825_000,
      pickedMilli: 110_000,
    });
    expect(detail.data.contract.siteName).toBeNull();
  });

  it("sells an item counted in kg by its quantity", async () => {
    await stockUp(ctx, fx, fx.yard, [["PL-SAT", "SCRAP", 2000, 8_000]]);
    const deal = await approvedContract(ctx, fx, {
      ...kgSale(fx),
      lines: [
        {
          itemId: fx.item("PL-SAT"),
          condition: "SCRAP",
          pricingUnit: "KG",
          quantity: "1000",
          price: 7_500,
        },
      ],
    });
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [
        {
          itemId: fx.item("PL-SAT"),
          condition: "SCRAP",
          pricingUnit: "KG",
          quantity: "500,5",
        },
      ],
    });
    const version = await started(ctx, fx, note.id);
    const result = await confirm(ctx, fx, note.id, version, [
      { lineId: await lineId(note.id), condition: "SCRAP", quantity: "500,5" },
    ]);
    expect(result.ok).toBe(true);
    const rows = await ctx.db
      .select({
        quantity: inventoryLedger.quantity,
        kg: inventoryLedger.weighedKg,
      })
      .from(inventoryLedger)
      .where(eq(inventoryLedger.documentCode, note.code));
    expect(rows).toEqual([{ quantity: "-500.500", kg: null }]);
    const detail = await deliveryDetail(ctx.db, fx.sales, note.code);
    expect(detail.ok && detail.data.lines[0]?.amount).toBe(3_753_750);
  });

  it("refuses a kit on a sale and a line not on the sale", async () => {
    const deal = await scrapSale();
    expect(
      await createDelivery(ctx.db, fx.sales, {
        contractId: deal.id,
        kits: [{ kitId: fx.kit("BO-17"), quantity: 1 }],
      }),
    ).toMatchObject({
      ok: false,
      error: "Hợp đồng bán chọn từng dòng hàng, không chọn theo bộ.",
    });
    expect(
      await createDelivery(ctx.db, fx.sales, {
        contractId: deal.id,
        lines: [
          {
            itemId: fx.item("GG-M16"),
            condition: "GOOD",
            pricingUnit: "ITEM",
            quantity: "2",
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: "Dòng GG-M16 Tốt chưa có trên hợp đồng bán.",
    });
  });
});

describe("edge inputs", () => {
  it("answers 404 and 403 on the office reads", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [{ itemId: fx.item("PK-KU"), quantity: "5" }],
    });
    expect(await deliveryDetail(ctx.db, fx.sales, "PX-1999-999")).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      await contractDeliveries(ctx.db, fx.sales, "not-a-uuid", TODAY),
    ).toMatchObject({ ok: false, status: 404 });
    const saleOnly = await fx.seller("thuyvy", "SALE");
    expect(await deliveryDetail(ctx.db, saleOnly, note.id)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await mobileNote(ctx.db, "PX-1999-999")).toBeNull();
  });

  it("checks the fields of a batch", async () => {
    const deal = await approvedRental(ctx, fx);
    const base = {
      contractId: deal.id,
      lines: [{ itemId: fx.item("PK-KU"), quantity: "5" }],
    };
    expect(
      await createDelivery(ctx.db, fx.sales, {
        ...base,
        plannedDate: "31/12/2026",
      }),
    ).toMatchObject({ status: 422, field: "plannedDate" });
    expect(
      await createDelivery(ctx.db, fx.sales, {
        ...base,
        vehiclePlate: "X".repeat(21),
      }),
    ).toMatchObject({ status: 422, field: "vehiclePlate" });
    expect(
      await createDelivery(ctx.db, fx.sales, {
        contractId: deal.id,
        lines: [{ itemId: fx.item("PK-KU"), quantity: "0" }],
      }),
    ).toMatchObject({ status: 422, field: "lines.0.quantity" });
    expect(
      await createDelivery(ctx.db, fx.sales, {
        contractId: deal.id,
        lines: [{ itemId: fx.item("PK-KU"), quantity: "2,5" }],
      }),
    ).toMatchObject({ status: 422, field: "lines.0.quantity" });
    expect(
      await createDelivery(ctx.db, fx.sales, {
        contractId: deal.id,
        kits: [{ kitId: "x", quantity: 1 }],
      }),
    ).toMatchObject({ status: 422, field: "kits.0.quantity" });
    expect(
      await createDelivery(ctx.db, fx.sales, {
        ...base,
        companyTruck: true,
        freightAmount: 1.5,
      }),
    ).toMatchObject({ status: 422, field: "freightAmount" });
    expect(await createDelivery(ctx.db, fx.sales, { lines: [] })).toMatchObject(
      {
        status: 422,
      },
    );
  });

  it("asks for a yard when there are two", async () => {
    const deal = await approvedRental(ctx, fx);
    const [second] = await ctx.db
      .insert(location)
      .values({ code: "BAI-02", name: "Bãi phụ", type: "YARD" })
      .returning({ id: location.id });
    const body = {
      contractId: deal.id,
      lines: [{ itemId: fx.item("PK-KU"), quantity: "5" }],
    };
    expect(await createDelivery(ctx.db, fx.sales, body)).toMatchObject({
      status: 422,
      field: "sourceLocationId",
      error: "Bạn chọn bãi xuất hàng.",
    });
    const saved = await createDelivery(ctx.db, fx.sales, {
      ...body,
      sourceLocationId: second?.id,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const moved = await updateDelivery(
      ctx.db,
      fx.sales,
      saved.data.id,
      {
        ...body,
        sourceLocationId: fx.yard,
        plannedDate: "2026-11-05",
        note: "Đổi bãi",
        updatedAt: saved.data.updatedAt,
      },
      { now: new Date(NOW.getTime() + 60_000) },
    );
    expect(moved.ok).toBe(true);
  });

  it("refuses a confirmation without a draft id, before starting, or for another line", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [{ itemId: fx.item("PK-KU"), quantity: "5" }],
    });
    expect(
      await postDelivery(ctx.db, fx.warehouse, note.id, { picks: [] }),
    ).toMatchObject({ status: 422, field: "clientDraftId" });
    expect(
      await postDelivery(ctx.db, fx.warehouse, note.code, {
        clientDraftId: randomUUID(),
        startedVersion: note.updatedAt,
        picks: [],
      }),
    ).toMatchObject({
      ok: false,
      error: "Bạn cần bắt đầu nhặt phiếu này trước khi xác nhận.",
    });
    expect(
      await postDelivery(ctx.db, fx.warehouse, "PX-1999-999", {
        clientDraftId: randomUUID(),
        picks: [],
      }),
    ).toMatchObject({ status: 404 });
    const version = await started(ctx, fx, note.id);
    expect(
      await confirm(ctx, fx, note.id, version, [
        { lineId: randomUUID(), condition: "NEW", quantity: "5" },
      ]),
    ).toMatchObject({ status: 422, error: "Dòng nhặt không thuộc phiếu này." });
    expect(
      await confirm(ctx, fx, note.id, version, [
        { lineId: await lineId(note.id), condition: "NEW", quantity: "abc" },
      ]),
    ).toMatchObject({ status: 422, field: "picks.0.quantity" });
    const posted = await postDelivery(
      ctx.db,
      fx.warehouse,
      note.id,
      {
        clientDraftId: randomUUID(),
        startedVersion: version,
        vehiclePlate: "51X-000.01",
        departedAt: "not a date",
        picks: [
          { lineId: await lineId(note.id), condition: "NEW", quantity: "5" },
        ],
      },
      { now: NOW },
    );
    expect(posted.ok).toBe(true);
  });

  it("pages the phone history by day", async () => {
    expect(await deliveriesByDay(ctx.db)).toEqual({ days: [], hasMore: false });
    expect(
      await deliveriesByDay(ctx.db, {
        before: "2026-01-01" as BusinessDate,
        days: 7,
      }),
    ).toEqual({ days: [], hasMore: false });
  });
});

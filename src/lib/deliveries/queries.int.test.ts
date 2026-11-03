// Reading notes for D6, M1, M5, M7 and receivables (deliveries spec "Còn
// phải giao", "Xuất thiếu", "Tiến độ cấp hàng D6", delivery-picking "M5
// không hiện giá"; tasks 3.5, 3.8).
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { deliveryNoteLine } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
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
  TODAY,
  type DeliveryFixture,
} from "@/test/deliveries";

import { deliveredAmounts } from "./amounts";
import { postDelivery } from "./post";
import {
  contractDeliveries,
  deliveriesByDay,
  mobileNote,
  mobileTasks,
} from "./queries";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: DeliveryFixture;
beforeEach(async () => {
  fx = await setupDeliveryFixture(ctx);
});

async function dataOf<T>(
  pending: Promise<{ ok: true; data: T } | { ok: false; error: string }>,
) {
  const result = await pending;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function lineIds(noteId: string) {
  const rows = await ctx.db
    .select({ id: deliveryNoteLine.id, itemId: deliveryNoteLine.itemId })
    .from(deliveryNoteLine)
    .where(eq(deliveryNoteLine.noteId, noteId));
  return (code: string) => rows.find((row) => row.itemId === fx.item(code))?.id;
}

/** Đợt 1: 60 kits picked 120 / 80 / 60 (40 chéo short). */
async function shortBatch(dealId: string) {
  const note = await planned(ctx, fx, {
    contractId: dealId,
    kits: [{ kitId: fx.kit("BO-17"), quantity: 60 }],
  });
  const version = await started(ctx, fx, note.id);
  const line = await lineIds(note.id);
  const posted = await confirm(ctx, fx, note.id, version, [
    { lineId: line("GG-K17"), condition: "GOOD", quantity: "120" },
    { lineId: line("GG-CH"), condition: "GOOD", quantity: "80" },
    { lineId: line("GG-M16"), condition: "GOOD", quantity: "60" },
  ]);
  if (!posted.ok) throw new Error(posted.error);
  return note;
}

describe("D6 and what is left", () => {
  it("keeps the shortage in what is left, without a new note", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await shortBatch(deal.id);
    const result = await contractDeliveries(ctx.db, fx.sales, deal.id, TODAY);
    if (!result.ok) throw new Error(result.error);
    const view = result.data;
    const cheo = view.remaining.find(
      (row) => row.line.itemId === fx.item("GG-CH"),
    );
    expect(cheo?.remainingMilli).toBe(520_000);
    expect(cheo?.unplannedMilli).toBe(520_000);
    expect(view.timeline).toHaveLength(1);
    expect(view.timeline[0]).toMatchObject({
      code: note.code,
      status: "POSTED",
      short: "40 chéo",
    });
    const site = view.site.find((row) => row.itemId === fx.item("GG-K17"));
    expect(site).toMatchObject({
      deliveredMilli: 120_000,
      returnedMilli: 0,
      onSiteMilli: 120_000,
      dayRent: 120 * 1200,
    });
  });

  it("does not count a note being picked", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [{ itemId: fx.item("GG-K17"), quantity: "120" }],
    });
    await started(ctx, fx, note.id);
    const view = await dataOf(
      contractDeliveries(ctx.db, fx.sales, deal.id, TODAY),
    );
    const site = view?.site.find((row) => row.itemId === fx.item("GG-K17"));
    expect(site?.deliveredMilli).toBe(0);
    const left = view?.remaining.find(
      (row) => row.line.itemId === fx.item("GG-K17"),
    );
    expect([left?.remainingMilli, left?.unplannedMilli]).toEqual([
      600_000, 480_000,
    ]);
  });

  it("does not add up two rentals of one site", async () => {
    const first = await approvedRental(ctx, fx);
    const second = await approvedContract(ctx, fx, {
      ...d5Rental(fx),
      customerToken: "Minh Phát B",
    });
    await shortBatch(first.id);
    const view = await dataOf(
      contractDeliveries(ctx.db, fx.sales, second.id, TODAY),
    );
    expect(view?.site.every((row) => row.onSiteMilli === 0)).toBe(true);
  });

  it("is hidden from a sale-only seller", async () => {
    const deal = await approvedRental(ctx, fx);
    const saleOnly = await fx.seller("thuyvy", "SALE");
    expect(
      await contractDeliveries(ctx.db, saleOnly, deal.id, TODAY),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("lists a note confirmed on the phone another day", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [{ itemId: fx.item("PK-KU"), quantity: "10" }],
    });
    const version = await started(ctx, fx, note.id);
    const line = await lineIds(note.id);
    const result = await postDelivery(
      ctx.db,
      fx.warehouse,
      note.id,
      {
        clientDraftId: randomUUID(),
        startedVersion: version,
        vehiclePlate: "51X-000.01",
        // 22:10 on 02/11/2026 in Vietnam, sent on 03/11.
        departedAt: "2026-11-02T15:10:00Z",
        picks: [{ lineId: line("PK-KU"), condition: "NEW", quantity: "10" }],
      },
      { now: NOW },
    );
    expect(result.ok).toBe(true);
    const view = await dataOf(
      contractDeliveries(ctx.db, fx.sales, deal.id, TODAY),
    );
    expect(view?.checks).toEqual([
      {
        kind: "DELIVERY",
        code: note.code,
        businessDate: "2026-11-03",
        phoneDate: "2026-11-02",
      },
    ]);
  });
});

describe("the phone", () => {
  it("lists notes due by today on M1, late first", async () => {
    const deal = await approvedRental(ctx, fx);
    const late = await planned(ctx, fx, {
      contractId: deal.id,
      kits: [{ kitId: fx.kit("BO-17"), quantity: 10 }],
      plannedDate: "2026-11-01",
    });
    await planned(ctx, fx, {
      contractId: deal.id,
      kits: [{ kitId: fx.kit("BO-17"), quantity: 10 }],
      plannedDate: "2026-11-09",
    });
    const tasks = await mobileTasks(ctx.db, TODAY);
    expect(tasks.map((task) => task.code)).toEqual([late.code]);
    expect(tasks[0]?.requested).toMatch(/^10 bộ giàn giáo 1,7m = /);
  });

  it("gives M5 stock and no money", async () => {
    const deal = await approvedContract(ctx, fx, {
      ...d5Rental(fx),
      companyTruck: true,
      freightPerTrip: 1_800_000,
    });
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [{ itemId: fx.item("GG-CH"), quantity: "120" }],
    });
    const view = await mobileNote(ctx.db, note.code);
    expect(view?.lines[0]?.stock).toEqual([
      { condition: "NEW", milli: 300_000 },
      { condition: "GOOD", milli: 2_480_000 },
    ]);
    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
          keys.push(key);
          walk(inner);
        }
      }
    };
    walk(view);
    expect(
      keys.filter((key) => /price|freight|amount|rent|cost/i.test(key)),
    ).toEqual([]);
    expect(JSON.stringify(view)).not.toContain("1800000");
  });

  it("lists posted notes by day on M7", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await shortBatch(deal.id);
    const history = await deliveriesByDay(ctx.db);
    expect(history.days).toEqual([
      {
        date: "2026-11-03" as BusinessDate,
        notes: [
          expect.objectContaining({
            code: note.code,
            place: "Trường THCS Dương Nội",
            delivered: [{ unit: "PIECE", milli: 260_000 }],
          }),
        ],
      },
    ]);
  });
});

describe("amounts for receivables", () => {
  it("computes freight and sale money from the posted notes", async () => {
    const deal = await approvedContract(ctx, fx, {
      ...kgSale(fx),
      companyTruck: true,
      freightPerTrip: 1_800_000,
    });
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      lines: [
        {
          itemId: fx.item("GG-K17"),
          condition: "GOOD",
          pricingUnit: "KG",
          quantity: "1250,5",
        },
      ],
    });
    const version = await started(ctx, fx, note.id);
    const line = await lineIds(note.id);
    await confirm(ctx, fx, note.id, version, [
      {
        lineId: line("GG-K17"),
        condition: "GOOD",
        quantity: "90",
        weighedKg: "1250,5",
      },
    ]);
    expect(await deliveredAmounts(ctx.db, deal.id)).toEqual([
      {
        code: note.code,
        businessDate: "2026-11-03",
        freight: 1_800_000,
        saleLines: [{ itemCode: "GG-K17", amount: 17_507_000 }],
        saleTotal: 17_507_000,
      },
    ]);
  });
});

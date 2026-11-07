// Rental stock from the ledger (management-reports tasks 3.4; spec
// fleet-metrics; design D4; 0.2 #35, #114).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { sumFleet, type DaySums } from "@/domain/fleet-metrics";
import { monthsOf, type DateRange } from "@/domain/report-period";
import { createGroup } from "@/lib/catalog/item-groups";
import { createItem } from "@/lib/catalog/items";
import { postMovements } from "@/lib/inventory/post";
import { setScrapPrice } from "@/lib/receiving/scrap-price";
import { createRepairDraft, postRepairOrder } from "@/lib/repairs/orders";
import { createTestContext } from "@/test/auth";
import {
  deliverMore,
  returnOf,
  setupReturnFixture,
  type ReturnFixture,
} from "@/test/returns";

import { reportFleet } from "./fleet";

const ctx = createTestContext();
afterAll(ctx.close);

const d = (value: string) => value as BusinessDate;
const K = 1000;

let fx: ReturnFixture;
beforeEach(async () => {
  fx = await setupReturnFixture(ctx);
});

async function sums(range: DateRange, code: string): Promise<DaySums> {
  const fleet = await reportFleet(ctx.db, range);
  return (
    sumFleet(fleet.months, monthsOf(range)).byItem.get(fx.item(code)) ?? {
      totalMilliDays: 0,
      siteMilliDays: 0,
    }
  );
}

const day = (value: string) => ({ from: d(value), to: d(value) });

describe("rental stock by day", () => {
  it("counts New and Good everywhere, sites apart", async () => {
    // The fixture delivered 30 New + 90 Good GG-K17 to the site on 03/11.
    const atSite = await sums(day("2026-11-03"), "GG-K17");
    expect(atSite.siteMilliDays).toBe(120 * K);
    expect(atSite.totalMilliDays).toBeGreaterThanOrEqual(120 * K);
  });

  it("drops what comes back for repair or as scrap", async () => {
    const before = await sums(day("2026-11-05"), "GG-K17");
    const price = await setScrapPrice(ctx.db, fx.director, {
      pricePerKg: 7_500,
    });
    if (!price.ok) throw new Error(price.error);
    const posted = await returnOf(ctx, fx, { "GG-K17": [5, 10, 4, 2] });
    if (!posted.ok) throw new Error(posted.error);
    const after = await sums(day("2026-11-05"), "GG-K17");
    expect(before.totalMilliDays - after.totalMilliDays).toBe(16 * K);
    expect(before.siteMilliDays - after.siteMilliDays).toBe(21 * K);
    const fleet = await reportFleet(ctx.db, day("2026-11-05"));
    const losses = fleet.losses.filter(
      (row) => row.itemId === fx.item("GG-K17"),
    );
    expect(
      Object.fromEntries(losses.map((row) => [row.kind, row.milli])),
    ).toEqual({ loss: 2 * K, scrap: 4 * K, repair: 10 * K });
  });

  it("keeps the Vietnam day: 23:30 on 30/11 is November, 00:30 on 01/12 is not", async () => {
    const november = { from: d("2026-11-01"), to: d("2026-11-30") };
    const posted = await returnOf(
      ctx,
      fx,
      { "GG-K17": [0, 0, 0, 2] },
      { now: new Date("2026-11-30T16:30:00Z") },
    );
    if (!posted.ok) throw new Error(posted.error);
    const before = await reportFleet(ctx.db, november);
    expect(
      before.losses.find((row) => row.itemId === fx.item("GG-K17")),
    ).toMatchObject({ month: "2026-11", kind: "loss", milli: 2 * K });
    const lastDay = await sums(day("2026-11-30"), "GG-K17");
    await deliverMore(
      ctx,
      fx,
      fx.deal.id,
      [["GG-K17", "GOOD", 5]],
      new Date("2026-11-30T17:30:00Z"),
    );
    expect(await sums(day("2026-11-30"), "GG-K17")).toEqual(lastDay);
    const december = await sums(day("2026-12-01"), "GG-K17");
    expect(december.siteMilliDays - lastDay.siteMilliDays).toBe(5 * K);
  });

  it("ignores REVALUE lines (no location, 0.2 #35)", async () => {
    const range = { from: d("2026-11-01"), to: d("2026-11-06") };
    const before = await reportFleet(ctx.db, range);
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "REVALUE",
          documentId: null,
          documentCode: "ĐCG-2026-009",
          businessDate: d("2026-11-05"),
          lines: [
            {
              itemId: fx.item("GG-K17"),
              condition: "GOOD",
              locationId: null,
              movement: "REVALUE",
              quantityMilli: 0,
              amount: 1_200_000,
              description: "Sửa chi phí chuyến",
            },
          ],
        },
        d("2026-11-05"),
      ),
    );
    const after = await reportFleet(ctx.db, range);
    expect(after.months).toEqual(before.months);
    expect(after.losses).toEqual(before.losses);
  });

  it("leaves scrap made by a repair slip out of the losses", async () => {
    const price = await setScrapPrice(ctx.db, fx.director, {
      pricePerKg: 7_500,
    });
    if (!price.ok) throw new Error(price.error);
    const posted = await returnOf(ctx, fx, { "GG-K17": [0, 10, 0, 0] });
    if (!posted.ok) throw new Error(posted.error);
    const range = day("2026-11-06");
    const before = await reportFleet(ctx.db, range);
    const draft = await createRepairDraft(
      ctx.db,
      fx.accountant,
      {
        repairDate: d("2026-11-06"),
        repairedBy: "Tổ anh Bảy",
        fromLocationId: fx.yard,
        toLocationId: fx.yard,
        lines: [
          {
            itemId: fx.item("GG-K17"),
            quantityTaken: "10",
            quantityGood: "6",
            quantityScrap: "4",
            repairCost: 300_000,
          },
        ],
      },
      d("2026-11-06"),
    );
    if (!draft.ok) throw new Error(draft.error);
    const done = await postRepairOrder(
      ctx.db,
      fx.accountant,
      draft.data.code,
      {},
      d("2026-11-06"),
    );
    if (!done.ok) throw new Error(done.error);
    const after = await reportFleet(ctx.db, range);
    expect(after.losses).toEqual(before.losses);
    // The 6 repaired pieces join the rental stock (Good at the yard).
    const repaired = await sums(range, "GG-K17");
    const was = sumFleet(before.months, ["2026-11"]).byItem.get(
      fx.item("GG-K17"),
    );
    expect(repaired.totalMilliDays - (was?.totalMilliDays ?? 0)).toBe(6 * K);
  });

  it("starts a range mid-month from the stock before it", async () => {
    await deliverMore(
      ctx,
      fx,
      fx.deal.id,
      [["GG-CH", "GOOD", 7]],
      new Date("2026-11-05T03:00:00Z"),
    );
    const whole = await sums(
      { from: d("2026-11-01"), to: d("2026-11-06") },
      "GG-CH",
    );
    const head = await sums(
      { from: d("2026-11-01"), to: d("2026-11-03") },
      "GG-CH",
    );
    const tail = await sums(
      { from: d("2026-11-04"), to: d("2026-11-06") },
      "GG-CH",
    );
    expect(head.totalMilliDays + tail.totalMilliDays).toBe(
      whole.totalMilliDays,
    );
    expect(head.siteMilliDays + tail.siteMilliDays).toBe(whole.siteMilliDays);
  });
});

describe("supplies are not rental stock (0.2 số 125)", () => {
  it("leaves supply items out of the fleet", async () => {
    const group = await createGroup(ctx.db, fx.director, {
      name: "Vật tư phụ",
      category: "MATERIAL",
    });
    if (!group.ok) throw new Error(group.error);
    const qh = await createItem(ctx.db, fx.director, {
      groupId: group.data.id,
      code: "VT-QH",
      name: "Que hàn",
      unit: "KG",
    });
    if (!qh.ok) throw new Error(qh.error);
    const workshop = await fx.place("XUONG-01");
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "OPENING",
          documentId: null,
          documentCode: "TĐK-2026-011",
          businessDate: d("2026-11-03"),
          lines: [
            {
              itemId: qh.data.id,
              condition: "NEW",
              locationId: workshop,
              movement: "OPENING",
              quantityMilli: 18 * K,
              amount: 810_000,
              description: "Tồn đầu kỳ",
            },
          ],
        },
        d("2026-11-03"),
      ),
    );
    const fleet = await reportFleet(ctx.db, day("2026-11-03"));
    expect(fleet.items.map((entry) => entry.code)).not.toContain("VT-QH");
    const sums = sumFleet(fleet.months, ["2026-11"]);
    expect(sums.byItem.has(qh.data.id)).toBe(false);
  });
});

// D6 after returns, the M4 reads without money, the desktop detail and the
// M1 / M7 lists (deliveries delta "Đang ở công trình tính cả thu hồi và hàng
// mất", returns spec "M4 không hiện giá", "Chọn công trình trên M4", "Chi
// tiết phiếu thu hồi trên Desktop"; tasks 3.1, 3.7).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { createTestContext } from "@/test/auth";
import {
  deliverMore,
  returnOf,
  setupReturnFixture,
  type ReturnFixture,
} from "@/test/returns";
import { contractDeliveries } from "@/lib/deliveries/queries";
import { setScrapPrice } from "@/lib/receiving/scrap-price";

import {
  returnContract,
  returnContracts,
  returnDetail,
  returnsByDay,
} from "./queries";

const ctx = createTestContext();
afterAll(ctx.close);

const TODAY = "2026-11-05" as BusinessDate;

let fx: ReturnFixture;
beforeEach(async () => {
  fx = await setupReturnFixture(ctx);
  await setScrapPrice(ctx.db, fx.director, { pricePerKg: 7_500 });
});

async function dataOf<T>(
  pending: Promise<{ ok: true; data: T } | { ok: false; error: string }>,
) {
  const result = await pending;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const d6 = () =>
  dataOf(contractDeliveries(ctx.db, fx.accountant, fx.deal.id, TODAY));

/** Every key of a JSON value, nested. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => [
      key,
      ...keysOf(inner),
    ]);
  }
  return [];
}

describe("D6 after a return", () => {
  it("splits returned and lost, and what is left to deliver", async () => {
    await returnOf(ctx, fx, { "GG-K17": [80, 15, 3, 2] });
    const view = await d6();
    const row = view.site.find((entry) => entry.itemCode === "GG-K17");
    expect(row).toMatchObject({
      deliveredMilli: 120_000,
      returnedMilli: 98_000,
      lostMilli: 2_000,
      onSiteMilli: 20_000,
    });
    // 600 on the contract, 20 still on site.
    const left = view.remaining.find(
      (entry) => entry.line.itemId === fx.item("GG-K17"),
    );
    expect(left?.remainingMilli).toBe(580_000);
    expect(view.returns).toEqual([
      expect.objectContaining({
        code: "PTH-2026-001",
        text: "trả 98 cái, mất 2 cái",
        compensation: { code: "ĐB-2026-001", status: "PENDING" },
      }),
    ]);
  });

  it("zeroes the day rent of goods lost at the site", async () => {
    await returnOf(ctx, fx, { "GG-M16": [0, 0, 0, 60] });
    const row = (await d6()).site.find((entry) => entry.itemCode === "GG-M16");
    expect(row).toMatchObject({
      returnedMilli: 0,
      lostMilli: 60_000,
      onSiteMilli: 0,
      dayRent: 0,
    });
  });

  it("lets a returned item go out again without an over-delivery", async () => {
    await returnOf(ctx, fx, { "GG-CH": [200, 0, 0, 0] });
    const left = (await d6()).remaining.find(
      (entry) => entry.line.itemId === fx.item("GG-CH"),
    );
    // 600 on the contract, 60 on site after 260 out and 200 back.
    expect(left?.remainingMilli).toBe(540_000);
  });

  it("flags a return saved on the phone the day before", async () => {
    await returnOf(
      ctx,
      fx,
      { "GG-CH": [10, 0, 0, 0] },
      {
        now: new Date("2026-11-06T00:10:00Z"),
        body: { savedOnDeviceAt: "2026-11-05T14:50:00Z" },
      },
    );
    const view = await dataOf(
      contractDeliveries(
        ctx.db,
        fx.accountant,
        fx.deal.id,
        "2026-11-06" as BusinessDate,
      ),
    );
    expect(view.checks).toContainEqual({
      kind: "RETURN",
      code: "PTH-2026-001",
      businessDate: "2026-11-06",
      phoneDate: "2026-11-05",
    });
  });
});

describe("M4 reads", () => {
  it("lists active rentals with goods on site, by search", async () => {
    const rows = await returnContracts(ctx.db, "Dương Nội");
    expect(rows).toEqual([
      expect.objectContaining({
        contractCode: fx.deal.code,
        siteName: "Trường THCS Dương Nội",
        onSite: [{ unit: "PIECE", milli: 440_000 }],
      }),
    ]);
    expect(await returnContracts(ctx.db, "không có")).toEqual([]);
  });

  it("drops a contract whose site is empty", async () => {
    await returnOf(ctx, fx, {
      "GG-K17": [120, 0, 0, 0],
      "GG-CH": [260, 0, 0, 0],
      "GG-M16": [60, 0, 0, 0],
    });
    expect(await returnContracts(ctx.db, undefined)).toEqual([]);
  });

  it("opens a contract with stock and no money", async () => {
    const data = await dataOf(returnContract(ctx.db, fx.deal.id));
    expect(data.items.map((row) => [row.code, row.onSiteMilli / 1000])).toEqual(
      [
        ["GG-CH", 260],
        ["GG-K17", 120],
        ["GG-M16", 60],
      ],
    );
    const keys = keysOf(data);
    for (const money of [
      "price",
      "unitPrice",
      "amount",
      "dayRent",
      "unitCost",
      "lostPrice",
      "damagePrice",
    ]) {
      expect(keys).not.toContain(money);
    }
  });
});

describe("return detail and lists", () => {
  it("shows the desktop detail with the value lost", async () => {
    await returnOf(ctx, fx, { "GG-K17": [80, 15, 3, 2] });
    const data = await dataOf(
      returnDetail(ctx.db, fx.accountant, "PTH-2026-001", { withValues: true }),
    );
    expect(data).toMatchObject({
      code: "PTH-2026-001",
      siteName: "Trường THCS Dương Nội",
      vehiclePlate: "29C-456.78",
      // Out 6.300.000 + 13.260.000; in 15.600.000 + 2.925.000 + 303.750.
      values: { conditionLoss: 731_250, lostValue: 390_000 },
      compensation: {
        code: "ĐB-2026-001",
        status: "PENDING",
        amount: 2_650_000,
      },
    });
  });

  it("gives the storekeeper the note without money", async () => {
    await returnOf(ctx, fx, { "GG-K17": [80, 15, 3, 2] });
    expect(
      await returnDetail(ctx.db, fx.warehouse, "PTH-2026-001", {
        withValues: true,
      }),
    ).toMatchObject({ ok: false, status: 403 });
    const data = await dataOf(
      returnDetail(ctx.db, fx.warehouse, "PTH-2026-001", { withValues: false }),
    );
    expect(data.values).toBeNull();
    expect(data.compensation).toBeNull();
  });

  it("refuses a sale-only seller", async () => {
    await returnOf(ctx, fx, { "GG-CH": [5, 0, 0, 0] });
    const seller = await fx.seller("thuyvy", "SALE");
    expect(
      await returnDetail(ctx.db, seller, "PTH-2026-001", { withValues: true }),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("lists posted notes by day", async () => {
    await returnOf(ctx, fx, { "GG-K17": [98, 0, 0, 2] });
    const list = await returnsByDay(ctx.db);
    expect(list.days).toEqual([
      {
        date: "2026-11-05",
        notes: [
          expect.objectContaining({
            code: "PTH-2026-001",
            siteName: "Trường THCS Dương Nội",
            text: "trả 98 cái, mất 2 cái",
          }),
        ],
      },
    ]);
    expect(
      (await returnsByDay(ctx.db, { only: "2026-11-04" as BusinessDate }))
        .days[0]?.notes,
    ).toEqual([]);
  });

  it("keeps two rentals of one site apart", async () => {
    await deliverMore(ctx, fx, fx.deal.id, [["GG-CH", "GOOD", 10]]);
    const rows = await returnContracts(ctx.db, undefined);
    expect(rows).toHaveLength(1);
  });
});

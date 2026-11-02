import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { inventoryCost, inventoryLedger } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import type { MovementDraft } from "@/domain/movement";
import { REVALUE_MESSAGES } from "@/domain/stock-revaluation";
import { createTestContext } from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";
import { updateItem } from "@/lib/catalog/items";

import { postMovements, type Posting } from "./post";
import { seedInventory } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

const TODAY = "2026-10-27" as BusinessDate;
const day = (value: string) => value as BusinessDate;

let fx: InventoryFixture;
beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
});

const draft = (
  code: string,
  condition: Condition,
  place: string,
  movement: MovementDraft["movement"],
  pieces: number,
  extra: Partial<MovementDraft> = {},
): MovementDraft => ({
  itemId: fx.item(code),
  condition,
  locationId: fx.place(place),
  movement,
  quantityMilli: pieces * 1000,
  description: "test",
  ...extra,
});

function post(date: string, lines: MovementDraft[], code = "TEST-1") {
  const posting: Posting = {
    documentType: "TEST",
    documentId: null,
    documentCode: code,
    businessDate: day(date),
    lines,
  };
  return ctx.db.transaction((tx) =>
    postMovements(tx, fx.director, posting, TODAY),
  );
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error: unknown) {
    const result = (error as { result?: { error: string } }).result;
    return result?.error ?? (error as Error).message;
  }
  throw new Error("expected a failure");
}

async function pool(code: string, condition: Condition) {
  const [row] = await ctx.db
    .select()
    .from(inventoryCost)
    .where(
      and(
        eq(inventoryCost.itemId, fx.item(code)),
        eq(inventoryCost.condition, condition),
      ),
    );
  return row;
}

const ledgerCount = async () =>
  (await ctx.db.select({ id: inventoryLedger.id }).from(inventoryLedger))
    .length;

describe("postMovements: design D11 worked example", () => {
  it("prices every GG-K17 Tốt line as the table", async () => {
    await seedInventory(ctx.db, fx.director);
    const lines = await ctx.db
      .select({
        code: inventoryLedger.documentCode,
        movement: inventoryLedger.movement,
        quantity: inventoryLedger.quantity,
        unitCost: inventoryLedger.unitCost,
        avg: inventoryLedger.avgCostAfter,
        pool: inventoryLedger.poolQuantityAfter,
      })
      .from(inventoryLedger)
      .where(
        and(
          eq(inventoryLedger.itemId, fx.item("GG-K17")),
          eq(inventoryLedger.condition, "GOOD"),
        ),
      )
      .orderBy(asc(inventoryLedger.id));
    expect(
      lines.map((l) => [l.code, l.movement, l.unitCost, l.avg, l.pool]),
    ).toEqual([
      ["TĐK-2026-001", "OPENING", 195_000, 195_000, "1220.000"],
      ["TĐK-2026-001", "OPENING", 195_000, 195_000, "2420.000"],
      ["TĐK-2026-001", "OPENING", 195_000, 195_000, "3220.000"],
      ["PX-2026-118", "DELIVERY_OUT", 195_000, 195_000, "2920.000"],
      ["PX-2026-118", "DELIVERY_IN", 195_000, 195_000, "3220.000"],
      ["PN-2026-087", "PURCHASE_IN", 196_155, 195_055, "3380.000"],
      ["PSC-2026-021", "REPAIR_IN", 214_500, 195_282, "3420.000"],
      ["PTH-2026-064", "RETURN_OUT", 195_282, 195_282, "3210.000"],
      ["PTH-2026-064", "RETURN_IN", 195_282, 195_282, "3420.000"],
      ["ĐC-2026-004", "ADJUST_OUT", 195_282, 195_282, "3410.000"],
      ["PX-2026-131", "DELIVERY_OUT", 195_282, 195_282, "3290.000"],
      ["PX-2026-131", "DELIVERY_IN", 195_282, 195_282, "3410.000"],
      ["PTH-2026-069", "RETURN_OUT", 195_282, 195_282, "3370.000"],
      ["PTH-2026-069", "RETURN_IN", 195_282, 195_282, "3410.000"],
    ]);
    expect(await pool("GG-K17", "GOOD")).toMatchObject({
      avgCost: 195_282,
      poolQuantity: "3410.000",
    });
    // The repaired pieces leave Chờ sửa at its average, which stays put.
    expect(await pool("GG-K17", "NEEDS_REPAIR")).toMatchObject({
      avgCost: 160_000,
    });
  });

  it("is not the yard-only figures of the D11 drawing", async () => {
    await seedInventory(ctx.db, fx.director);
    const row = await pool("GG-K17", "GOOD");
    expect(row?.avgCost).not.toBe(195_861);
  });
});

describe("postMovements: average cost", () => {
  it("counts stock at sites in the pool (1.220 pieces → 195.134)", async () => {
    await post("2026-10-01", [
      draft("GG-K17", "GOOD", "BAI-01", "OPENING", 920, {
        amount: 920 * 195_000,
      }),
      draft("GG-K17", "GOOD", "maiDich", "OPENING", 300, {
        amount: 300 * 195_000,
      }),
    ]);
    await post("2026-10-08", [
      draft("GG-K17", "GOOD", "BAI-01", "PURCHASE_IN", 160, {
        amount: 31_384_800,
      }),
    ]);
    expect((await pool("GG-K17", "GOOD"))?.avgCost).toBe(195_134);
  });

  it("keeps the average and the total value when stock only moves", async () => {
    await post("2026-10-01", [
      draft("GG-K17", "GOOD", "BAI-01", "OPENING", 3420, {
        amount: 3420 * 195_282,
      }),
    ]);
    const value = async () => {
      const row = await pool("GG-K17", "GOOD");
      return [row?.avgCost, row?.poolQuantity];
    };
    const steps: MovementDraft[][] = [
      [
        draft("GG-K17", "GOOD", "BAI-01", "DELIVERY_OUT", -120),
        draft("GG-K17", "GOOD", "quangMinh", "DELIVERY_IN", 120),
      ],
      [
        draft("GG-K17", "GOOD", "quangMinh", "RETURN_OUT", -40),
        draft("GG-K17", "GOOD", "BAI-01", "RETURN_IN", 40),
      ],
      [
        draft("GG-K17", "GOOD", "BAI-01", "TRANSFER_OUT", -30),
        draft("GG-K17", "GOOD", "XUONG-01", "TRANSFER_IN", 30),
      ],
      [
        draft("GG-K17", "GOOD", "BAI-01", "DELIVERY_OUT", -200),
        draft("GG-K17", "GOOD", "maiDich", "DELIVERY_IN", 200),
      ],
    ];
    for (const lines of steps) {
      await post("2026-10-10", lines);
      expect(await value()).toEqual([195_282, "3420.000"]);
    }
    const lines = await ctx.db
      .select({ amount: inventoryLedger.amount })
      .from(inventoryLedger);
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    expect(total).toBe(3420 * 195_282);
    expect(total).toBe(667_864_440);
  });

  it("keeps the last average when stock reaches zero", async () => {
    await post("2026-10-01", [
      draft("GG-M16", "GOOD", "BAI-01", "OPENING", 12, {
        amount: 12 * 152_000,
      }),
    ]);
    await post("2026-10-02", [
      draft("GG-M16", "GOOD", "BAI-01", "SALE_OUT", -12),
    ]);
    expect(await pool("GG-M16", "GOOD")).toMatchObject({
      avgCost: 152_000,
      poolQuantity: "0.000",
    });
    await post("2026-10-03", [
      draft("GG-M16", "GOOD", "BAI-01", "PURCHASE_IN", 500, {
        amount: 500 * 160_000,
      }),
    ]);
    expect((await pool("GG-M16", "GOOD"))?.avgCost).toBe(160_000);
  });

  it("prices a never-seen condition from the paired outgoing line", async () => {
    await post("2026-10-01", [
      draft("OT-06", "GOOD", "anPhu", "OPENING", 3, { amount: 3 * 167_000 }),
    ]);
    await post("2026-10-02", [
      draft("OT-06", "GOOD", "anPhu", "RETURN_OUT", -3),
      draft("OT-06", "SCRAP", "BAI-01", "RETURN_IN", 3, { pairedWith: 0 }),
    ]);
    expect((await pool("OT-06", "SCRAP"))?.avgCost).toBe(167_000);
  });

  it("wants a unit cost to raise a never-priced condition", async () => {
    expect(
      await failure(
        post("2026-10-02", [draft("OT-06", "NEW", "BAI-01", "ADJUST_IN", 20)]),
      ),
    ).toBe("OT-06 Mới chưa có giá vốn, nhập đơn giá");
    await post("2026-10-02", [
      draft("OT-06", "NEW", "BAI-01", "ADJUST_IN", 20, { unitCost: 450_000 }),
    ]);
    expect((await pool("OT-06", "NEW"))?.avgCost).toBe(450_000);
  });
});

describe("postMovements: refusals", () => {
  beforeEach(async () => {
    await post("2026-10-01", [
      draft("GG-K17", "GOOD", "BAI-01", "OPENING", 120, {
        amount: 120 * 195_000,
      }),
    ]);
  });

  it("refuses to go below zero and writes nothing", async () => {
    const before = await ledgerCount();
    expect(
      await failure(
        post("2026-10-03", [
          draft("GG-K17", "GOOD", "BAI-01", "DELIVERY_OUT", -150),
          draft("GG-K17", "GOOD", "maiDich", "DELIVERY_IN", 150),
        ]),
      ),
    ).toBe("Không đủ hàng: GG-K17 Tốt tại BAI-01 còn 120 cái");
    expect(await ledgerCount()).toBe(before);
    expect((await pool("GG-K17", "GOOD"))?.poolQuantity).toBe("120.000");
  });

  it("refuses an archived item", async () => {
    const archived = await updateItem(ctx.db, fx.director, fx.item("PK-CX"), {
      status: "ARCHIVED",
    });
    expect(archived.ok).toBe(true);
    expect(
      await failure(
        post("2026-10-03", [
          draft("PK-CX", "GOOD", "BAI-01", "OPENING", 1, { amount: 1 }),
        ]),
      ),
    ).toBe("Vật tư PK-CX đã ngừng dùng");
  });

  it("refuses a backdated line and a future one", async () => {
    await post("2026-10-22", [
      draft("GG-K17", "GOOD", "BAI-01", "SALE_OUT", -1),
    ]);
    expect(
      await failure(
        post("2026-10-20", [draft("GG-K17", "GOOD", "BAI-01", "SALE_OUT", -1)]),
      ),
    ).toBe(
      "GG-K17 Tốt đã có biến động ngày 22/10/2026, không ghi lùi ngày được",
    );
    expect(
      await failure(
        post("2026-10-28", [draft("GG-K17", "GOOD", "BAI-01", "SALE_OUT", -1)]),
      ),
    ).toBe("Ngày ghi sổ không được sau hôm nay");
  });

  it("refuses half a piece and a zero line", async () => {
    expect(
      await failure(
        post("2026-10-03", [
          {
            ...draft("GG-K17", "GOOD", "BAI-01", "SALE_OUT", 0),
            quantityMilli: -2500,
          },
        ]),
      ),
    ).toBe("GG-K17 tính theo cái, số lượng phải là số nguyên");
    expect(
      await failure(
        post("2026-10-03", [draft("GG-K17", "GOOD", "BAI-01", "SALE_OUT", 0)]),
      ),
    ).toBe("Số lượng ghi sổ phải khác 0");
  });

  it("stores the weighed kg of scrap sold by the piece", async () => {
    await post("2026-10-01", [
      draft("GG-K17", "SCRAP", "BAI-01", "OPENING", 42, {
        amount: 42 * 160_000,
      }),
    ]);
    const { lines } = await post("2026-10-05", [
      draft("GG-K17", "SCRAP", "BAI-01", "SALE_OUT", -42, {
        weighedKgMilli: 570_500,
      }),
    ]);
    expect(lines[0]).toMatchObject({
      unitCost: 160_000,
      avgCostAfter: 160_000,
    });
    const [row] = await ctx.db
      .select({ kg: inventoryLedger.weighedKg })
      .from(inventoryLedger)
      .where(eq(inventoryLedger.movement, "SALE_OUT"));
    expect(row?.kg).toBe("570.500");
  });
});

describe("postMovements: REVALUE", () => {
  it("revalues the whole pool with one line and moves no stock", async () => {
    await post("2026-10-01", [
      draft("GG-K17", "GOOD", "BAI-01", "OPENING", 920, {
        amount: 920 * 195_000,
      }),
      draft("GG-K17", "GOOD", "maiDich", "OPENING", 300, {
        amount: 300 * 195_000,
      }),
    ]);
    const before = await ledgerCount();
    const { lines } = await post(
      "2026-10-27",
      [
        draft("GG-K17", "GOOD", "BAI-01", "REVALUE", 0, {
          locationId: null,
          amount: 610_000,
        }),
      ],
      "ĐCG-2026-001",
    );
    expect(lines[0]).toMatchObject({
      movement: "REVALUE",
      locationId: null,
      quantityMilli: 0,
      amount: 610_000,
      avgCostAfter: 195_500,
      poolMilliAfter: 1_220_000,
    });
    expect(await ledgerCount()).toBe(before + 1);
    expect(await pool("GG-K17", "GOOD")).toMatchObject({
      avgCost: 195_500,
      poolQuantity: "1220.000",
    });
    const atPlaces = await ctx.db
      .select({
        place: inventoryLedger.locationId,
        qty: inventoryLedger.quantity,
      })
      .from(inventoryLedger)
      .where(eq(inventoryLedger.movement, "OPENING"))
      .orderBy(asc(inventoryLedger.id));
    expect(atPlaces.map((row) => row.qty)).toEqual(["920.000", "300.000"]);
    // A return from the site later is booked at the new average.
    const { lines: back } = await post("2026-10-27", [
      draft("GG-K17", "GOOD", "maiDich", "RETURN_OUT", -10),
      draft("GG-K17", "GOOD", "BAI-01", "RETURN_IN", 10),
    ]);
    expect(back.map((line) => line.unitCost)).toEqual([195_500, 195_500]);
  });

  it("refuses to revalue a sold-out pair and writes nothing", async () => {
    await post("2026-10-01", [
      draft("PK-KU", "NEW", "BAI-01", "OPENING", 10, { amount: 10 * 52_000 }),
    ]);
    await post("2026-10-02", [
      draft("PK-KU", "NEW", "BAI-01", "SALE_OUT", -10),
    ]);
    const before = await ledgerCount();
    expect(
      await failure(
        post("2026-10-27", [
          draft("PK-KU", "NEW", "BAI-01", "REVALUE", 0, {
            locationId: null,
            amount: 300_000,
          }),
        ]),
      ),
    ).toBe(REVALUE_MESSAGES.soldOut("PK-KU", "NEW"));
    expect(await ledgerCount()).toBe(before);
    expect((await pool("PK-KU", "NEW"))?.avgCost).toBe(52_000);
  });
});

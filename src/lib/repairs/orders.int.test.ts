// Repair slip service (simple-repair tasks 4.2-4.6): drafts, posting into
// the ledger in one transaction, refusals that roll back, and two writers.
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import {
  inventoryCost,
  inventoryLedger,
  item,
  location,
  repairOrder,
  repairOrderLine,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import { lockForPosting, postMovements } from "@/lib/inventory/post";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { setScrapPrice } from "@/lib/receiving/scrap-price";
import { activityRows, activityTrail, lastActivity } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import {
  setupInventoryFixture,
  truncateWithLedger,
  type InventoryFixture,
} from "@/test/inventory";

import {
  createRepairDraft,
  defaultRepairLocation,
  deleteRepairDraft,
  postRepairOrder,
  updateRepairDraft,
  type RepairBody,
} from "./orders";
import { awaitingRepair, getRepairOrder, listRepairOrders } from "./queries";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
const third = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close(), third.close()]);
});

const K = 1000;
const OCT_20 = "2026-10-20" as BusinessDate;
const OCT_28 = "2026-10-28" as BusinessDate;

let fx: InventoryFixture;

/** Opening stock of the D12 example (design D1, spec numbers). */
async function openStock() {
  const opening = (
    code: string,
    condition: Condition,
    pieces: number,
    unitCost: number,
    place = "BAI-01",
  ) => ({
    itemId: fx.item(code),
    condition,
    locationId: fx.place(place),
    movement: "OPENING" as const,
    quantityMilli: pieces * K,
    amount: pieces * unitCost,
    description: "Tồn đầu kỳ",
  });
  await ctx.db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "OPENING",
        documentId: null,
        documentCode: "TĐK-2026-001",
        businessDate: OCT_20,
        lines: [
          opening("GG-K17", "NEEDS_REPAIR", 201, 160_000),
          opening("GG-K17", "GOOD", 1_120, 195_861),
          opening("GG-K17", "SCRAP", 42, 150_000),
          opening("GG-CH", "NEEDS_REPAIR", 63, 30_000),
          opening("GG-CH", "GOOD", 2_000, 38_500),
          opening("GG-M16", "NEEDS_REPAIR", 9, 210_000),
          opening("GG-K15", "NEEDS_REPAIR", 10, 120_000, "XUONG-01"),
        ],
      },
      OCT_20,
    ),
  );
}

beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
  await openStock();
  // The spec example weighs GG-M16 at 12 kg.
  await ctx.db
    .update(item)
    .set({ standardWeightKg: "12.000" })
    .where(eq(item.id, fx.item("GG-M16")));
  const price = await setScrapPrice(ctx.db, fx.director, { pricePerKg: 7_500 });
  if (!price.ok) throw new Error(price.error);
});

type Line = [
  code: string,
  taken: number,
  good: number,
  scrap: number,
  cost: number,
];

function slip(lines: Line[], extra: Partial<RepairBody> = {}): RepairBody {
  return {
    repairDate: OCT_28,
    repairedBy: "Tổ anh Bảy",
    fromLocationId: fx.place("BAI-01"),
    toLocationId: fx.place("BAI-01"),
    lines: lines.map(([code, taken, good, scrap, cost]) => ({
      itemId: fx.item(code),
      quantityTaken: String(taken),
      quantityGood: String(good),
      quantityScrap: String(scrap),
      repairCost: cost,
    })),
    ...extra,
  };
}

const D12: Line[] = [
  ["GG-K17", 40, 36, 4, 1_980_000],
  ["GG-CH", 20, 20, 0, 240_000],
];

async function draft(lines: Line[] = D12, extra: Partial<RepairBody> = {}) {
  const created = await createRepairDraft(
    ctx.db,
    fx.accountant,
    slip(lines, extra),
    OCT_28,
  );
  if (!created.ok) throw new Error(created.error);
  return created.data.code;
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

async function ledgerOf(code: string) {
  return ctx.db
    .select({
      itemId: inventoryLedger.itemId,
      movement: inventoryLedger.movement,
      condition: inventoryLedger.condition,
      quantity: inventoryLedger.quantity,
      unitCost: inventoryLedger.unitCost,
      amount: inventoryLedger.amount,
      businessDate: inventoryLedger.businessDate,
      documentType: inventoryLedger.documentType,
      locationId: inventoryLedger.locationId,
    })
    .from(inventoryLedger)
    .where(eq(inventoryLedger.documentCode, code))
    .orderBy(inventoryLedger.id);
}

async function statusOf(code: string) {
  const [row] = await ctx.db
    .select({ status: repairOrder.status })
    .from(repairOrder)
    .where(eq(repairOrder.code, code));
  return row?.status;
}

describe("drafts", () => {
  it("numbers two drafts saved at once one after the other", async () => {
    await ctx.db.execute(
      sql`insert into document_counter (prefix, year, last_number) values ('PSC', 2026, 23)`,
    );
    const [a, b] = await Promise.all([
      createRepairDraft(ctx.db, fx.accountant, slip(D12), OCT_28),
      createRepairDraft(other.db, fx.director, slip(D12), OCT_28),
    ]);
    const codes = [a, b].map((r) => (r.ok ? r.data.code : r.error)).sort();
    expect(codes).toEqual(["PSC-2026-024", "PSC-2026-025"]);
  });

  it("refuses a stale edit, a site and a future repair date", async () => {
    const code = await draft();
    const first = await getRepairOrder(ctx.db, code);
    const edited = await updateRepairDraft(
      ctx.db,
      fx.accountant,
      code,
      slip(D12, {
        note: "Giám đốc sửa",
        updatedAt: first?.updatedAt.toISOString(),
      }),
      OCT_28,
    );
    expect(edited.ok).toBe(true);
    expect(
      await updateRepairDraft(
        ctx.db,
        fx.accountant,
        code,
        slip(D12, { updatedAt: first?.updatedAt.toISOString() }),
        OCT_28,
      ),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Phiếu vừa được người khác sửa, tải lại trang",
    });
    expect(
      await createRepairDraft(
        ctx.db,
        fx.accountant,
        slip(D12, { fromLocationId: fx.place("anPhu") }),
        OCT_28,
      ),
    ).toMatchObject({
      status: 422,
      error: "Chỉ lấy hàng sửa tại bãi hoặc xưởng",
      field: "fromLocationId",
    });
    expect(
      await createRepairDraft(
        ctx.db,
        fx.accountant,
        slip(D12, { repairDate: "2026-10-29" }),
        OCT_28,
      ),
    ).toMatchObject({
      status: 422,
      error: "Ngày sửa xong không được sau hôm nay",
    });
    expect(
      await createRepairDraft(
        ctx.db,
        fx.accountant,
        slip([["GG-K17", 40, 30, 4, 0]]),
        OCT_28,
      ),
    ).toMatchObject({
      status: 422,
      error: "GG-K17: sửa xong + phế liệu (34) phải bằng số lấy ra (40)",
      field: "lines.0.quantityGood",
    });
  });

  it("deletes a draft but never a posted slip", async () => {
    const code = await draft();
    expect((await deleteRepairDraft(ctx.db, fx.accountant, code)).ok).toBe(
      true,
    );
    expect(await listRepairOrders(ctx.db)).toEqual([]);
    const posted = await draft();
    expect(
      (await postRepairOrder(ctx.db, fx.accountant, posted, {}, OCT_28)).ok,
    ).toBe(true);
    const frozen = {
      ok: false,
      status: 409,
      error: "Phiếu đã ghi sổ, không sửa hay xóa được",
    };
    expect(await deleteRepairDraft(ctx.db, fx.accountant, posted)).toEqual(
      frozen,
    );
    const current = await getRepairOrder(ctx.db, posted);
    expect(
      await updateRepairDraft(
        ctx.db,
        fx.accountant,
        posted,
        slip(D12, { updatedAt: current?.updatedAt.toISOString() }),
        OCT_28,
      ),
    ).toEqual(frozen);
  });

  it("defaults to the active yard with the lowest code", async () => {
    expect((await defaultRepairLocation(ctx.db))?.code).toBe("BAI-01");
    await ctx.db.insert(location).values({
      code: "BAI-02",
      name: "Bãi 2",
      type: "YARD",
    });
    await ctx.db
      .update(location)
      .set({ status: "ARCHIVED", archivedAt: new Date() })
      .where(eq(location.code, "BAI-01"));
    expect((await defaultRepairLocation(ctx.db))?.code).toBe("BAI-02");
  });
});

describe("posting", () => {
  it("books the D12 slip into the ledger in one go", async () => {
    const code = await draft();
    const result = await postRepairOrder(
      ctx.db,
      fx.accountant,
      code,
      {},
      OCT_28,
    );
    expect(result.ok).toBe(true);
    const lines = await ledgerOf(code);
    expect(
      lines.map((l) => [
        l.movement,
        l.condition,
        l.quantity,
        l.unitCost,
        l.amount,
      ]),
    ).toEqual([
      ["REPAIR_OUT", "NEEDS_REPAIR", "-40.000", 160_000, -6_400_000],
      ["REPAIR_IN", "GOOD", "36.000", 221_528, 7_975_000],
      ["REPAIR_IN", "SCRAP", "4.000", 101_250, 405_000],
      ["REPAIR_OUT", "NEEDS_REPAIR", "-20.000", 30_000, -600_000],
      ["REPAIR_IN", "GOOD", "20.000", 42_000, 840_000],
    ]);
    expect(new Set(lines.map((l) => l.documentType))).toEqual(
      new Set(["REPAIR"]),
    );
    expect(new Set(lines.map((l) => l.businessDate))).toEqual(
      new Set([OCT_28]),
    );
    expect(lines.reduce((sum, l) => sum + l.amount, 0)).toBe(2_220_000);
    expect((await pool("GG-K17", "GOOD"))?.avgCost).toBe(196_660);
    expect((await pool("GG-K17", "SCRAP"))?.avgCost).toBe(145_761);
    expect((await pool("GG-K17", "NEEDS_REPAIR"))?.avgCost).toBe(160_000);
    expect((await pool("GG-CH", "GOOD"))?.avgCost).toBe(38_535);

    const detail = await getRepairOrder(ctx.db, code);
    expect(detail).toMatchObject({
      status: "POSTED",
      postedByName: expect.any(String),
      scrapPriceUsed: 7_500,
      confirmedNote: null,
    });
    expect(detail?.lines.map((l) => l.loss)).toEqual([0, 0]);
    expect(detail?.posted[0]).toMatchObject({
      needsRepairAvg: 160_000,
      goodAmount: 7_975_000,
      goodUnitCost: 221_528,
      goodAvgBefore: 195_861,
      goodAvgAfter: 196_660,
      scrapAmount: 405_000,
      scrapAvgAfter: 145_761,
    });
    expect(await reconcileInventory(ctx.db)).toEqual([]);
  });

  it("books the loss of a line with nothing repaired", async () => {
    const code = await draft([["GG-M16", 5, 0, 5, 0]]);
    expect(
      (await postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28)).ok,
    ).toBe(true);
    const lines = await ledgerOf(code);
    expect(lines.map((l) => [l.condition, l.amount])).toEqual([
      ["NEEDS_REPAIR", -1_050_000],
      ["SCRAP", 450_000],
    ]);
    expect(lines.reduce((sum, l) => sum + l.amount, 0)).toBe(-600_000);
    const detail = await getRepairOrder(ctx.db, code);
    expect(detail?.lines[0]?.loss).toBe(600_000);
    expect((await listRepairOrders(ctx.db))[0]?.loss).toBe(600_000);
    expect(await reconcileInventory(ctx.db)).toEqual([]);
  });

  it("takes from the workshop and books into the yard", async () => {
    const code = await draft([["GG-K15", 10, 10, 0, 0]], {
      fromLocationId: fx.place("XUONG-01"),
    });
    expect(
      (await postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28)).ok,
    ).toBe(true);
    const lines = await ledgerOf(code);
    expect(lines.map((l) => l.locationId)).toEqual([
      fx.place("XUONG-01"),
      fx.place("BAI-01"),
    ]);
  });

  it("posts by the posting day, not the repair day", async () => {
    // Tốt moved on 27/10; the slip says repaired 25/10 and is posted 28/10.
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "TEST",
          documentId: null,
          documentCode: "PX-TEST",
          businessDate: "2026-10-27" as BusinessDate,
          lines: [
            {
              itemId: fx.item("GG-K17"),
              condition: "GOOD",
              locationId: fx.place("BAI-01"),
              movement: "ADJUST_OUT",
              quantityMilli: -1 * K,
              description: "xuất thử",
            },
          ],
        },
        "2026-10-27" as BusinessDate,
      ),
    );
    const code = await draft(D12, { repairDate: "2026-10-25" });
    expect(
      (await postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28)).ok,
    ).toBe(true);
    expect(new Set((await ledgerOf(code)).map((l) => l.businessDate))).toEqual(
      new Set([OCT_28]),
    );
    expect((await getRepairOrder(ctx.db, code))?.repairDate).toBe("2026-10-25");
  });

  it("posts an old draft after Good moved again", async () => {
    const code = await draft();
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "TEST",
          documentId: null,
          documentCode: "PX-TEST",
          businessDate: "2026-10-29" as BusinessDate,
          lines: [
            {
              itemId: fx.item("GG-K17"),
              condition: "GOOD",
              locationId: fx.place("BAI-01"),
              movement: "ADJUST_OUT",
              quantityMilli: -1 * K,
              description: "xuất ngày 29",
            },
          ],
        },
        "2026-10-29" as BusinessDate,
      ),
    );
    const day30 = "2026-10-30" as BusinessDate;
    expect(
      (await postRepairOrder(ctx.db, fx.accountant, code, {}, day30)).ok,
    ).toBe(true);
    expect(new Set((await ledgerOf(code)).map((l) => l.businessDate))).toEqual(
      new Set([day30]),
    );
  });

  it("prices with the needs-repair average at posting time", async () => {
    const code = await draft([["GG-K17", 36, 36, 0, 1_980_000]]);
    // A purchase lowers Chờ sửa from 160.000 to 158.000 before posting.
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "TEST",
          documentId: null,
          documentCode: "PN-TEST",
          businessDate: OCT_28,
          lines: [
            {
              itemId: fx.item("GG-K17"),
              condition: "NEEDS_REPAIR",
              locationId: fx.place("BAI-01"),
              movement: "PURCHASE_IN",
              quantityMilli: 201 * K,
              amount: 201 * 156_000,
              description: "nhập thử",
            },
          ],
        },
        OCT_28,
      ),
    );
    expect((await pool("GG-K17", "NEEDS_REPAIR"))?.avgCost).toBe(158_000);
    await postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28);
    const good = (await ledgerOf(code)).find((l) => l.condition === "GOOD");
    expect(good?.unitCost).toBe(213_000);
  });
});

describe("refusals roll everything back", () => {
  async function untouched(code: string) {
    expect(await statusOf(code)).toBe("DRAFT");
    expect(await ledgerOf(code)).toEqual([]);
  }

  it("refuses more than the needs-repair stock", async () => {
    const code = await draft([["GG-CH", 70, 70, 0, 0]]);
    expect(
      await postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Không đủ hàng: GG-CH Chờ sửa tại BAI-01 còn 63 cái",
    });
    await untouched(code);
  });

  it("refuses an item archived before posting", async () => {
    const code = await draft();
    await ctx.db
      .update(item)
      .set({ status: "ARCHIVED", archivedAt: new Date() })
      .where(eq(item.id, fx.item("GG-CH")));
    expect(
      await postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28),
    ).toMatchObject({
      ok: false,
      error: "Vật tư GG-CH đã ngừng dùng",
    });
    await untouched(code);
  });

  it("needs a scrap price only when there is scrap", async () => {
    await truncateWithLedger(sql`truncate table scrap_price cascade`);
    const withScrap = await draft();
    expect(
      await postRepairOrder(ctx.db, fx.accountant, withScrap, {}, OCT_28),
    ).toMatchObject({
      ok: false,
      status: 400,
      error: "Chưa có giá sắt vụn tham khảo, nhờ Giám đốc nhập ở Cài đặt",
    });
    await untouched(withScrap);
    const noScrap = await draft([["GG-CH", 20, 20, 0, 240_000]]);
    const posted = await postRepairOrder(
      ctx.db,
      fx.accountant,
      noScrap,
      {},
      OCT_28,
    );
    expect(posted.ok).toBe(true);
    expect((await getRepairOrder(ctx.db, noScrap))?.scrapPriceUsed).toBeNull();
  });

  it("keeps the ledger rule against posting before its last day", async () => {
    const code = await draft();
    expect(
      await postRepairOrder(
        ctx.db,
        fx.accountant,
        code,
        {},
        "2026-10-19" as BusinessDate,
      ),
    ).toMatchObject({ ok: false, status: 400 });
    await untouched(code);
  });

  it("asks before a repair cost above the Good average", async () => {
    const code = await draft([["GG-K17", 20, 20, 0, 6_000_000]]);
    expect(
      await postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28),
    ).toEqual({
      ok: false,
      status: 422,
      error:
        "GG-K17: chi phí sửa 300.000 ₫/cái, cao hơn giá vốn Tốt 195.861 ₫. Đúng không?",
      field: "lines.0.repairCost",
    });
    await untouched(code);
    const posted = await postRepairOrder(
      ctx.db,
      fx.accountant,
      code,
      { confirmedOverrides: ["line:GG-K17"] },
      OCT_28,
    );
    expect(posted.ok).toBe(true);
    expect((await getRepairOrder(ctx.db, code))?.confirmedNote).toBe(
      `${code} · đã xác nhận chi phí cao GG-K17 300.000 ₫/cái`,
    );
  });
});

describe("two writers", () => {
  it("posts a slip once when two tabs press at the same time", async () => {
    const code = await draft();
    const results = await Promise.all([
      postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28),
      postRepairOrder(other.db, fx.director, code, {}, OCT_28),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({
      ok: false,
      status: 409,
      error: "Phiếu đã được ghi sổ",
    });
    expect(await ledgerOf(code)).toHaveLength(5);
  });

  it("serialises a repair and a purchase of the same Good pair", async () => {
    for (let round = 0; round < 4; round += 1) {
      const code = await draft([["GG-K17", 2, 2, 0, 100_000]]);
      const purchase = other.db.transaction((tx) =>
        postMovements(
          tx,
          fx.director,
          {
            documentType: "TEST",
            documentId: null,
            documentCode: `PN-T${round}`,
            businessDate: OCT_28,
            lines: [
              {
                itemId: fx.item("GG-K17"),
                condition: "GOOD",
                locationId: fx.place("BAI-01"),
                movement: "PURCHASE_IN",
                quantityMilli: 10 * K,
                amount: 2_000_000,
                description: "nhập",
              },
            ],
          },
          OCT_28,
        ),
      );
      const [repair, bought] = await Promise.allSettled([
        postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28),
        purchase,
      ]);
      expect(repair.status).toBe("fulfilled");
      expect(bought.status).toBe("fulfilled");
      expect(await reconcileInventory(ctx.db)).toEqual([]);
    }
  });

  it("refuses to post a draft saved by someone else since", async () => {
    const code = await draft();
    const seen = (await getRepairOrder(ctx.db, code))?.updatedAt.toISOString();
    await updateRepairDraft(
      other.db,
      fx.accountant,
      code,
      slip([["GG-K17", 40, 40, 0, 0]], { updatedAt: seen }),
      OCT_28,
    );
    expect(
      await postRepairOrder(
        ctx.db,
        fx.accountant,
        code,
        { updatedAt: seen },
        OCT_28,
      ),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Phiếu vừa được người khác sửa, tải lại trang",
    });
    expect(await statusOf(code)).toBe("DRAFT");
  });

  it("lets only one of two slips take the last needs-repair pieces", async () => {
    const a = await draft([["GG-CH", 40, 40, 0, 0]]);
    const b = await draft([["GG-CH", 40, 40, 0, 0]]);
    const results = await Promise.all([
      postRepairOrder(ctx.db, fx.accountant, a, {}, OCT_28),
      postRepairOrder(other.db, fx.director, b, {}, OCT_28),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({
      error: "Không đủ hàng: GG-CH Chờ sửa tại BAI-01 còn 23 cái",
    });
  });

  it("takes item locks before cost locks (one lock order)", async () => {
    const code = await draft([["GG-K17", 2, 2, 0, 0]]);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let itemLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      itemLocked = resolve;
    });
    // A: an item archive in progress holds the item row.
    const archive = other.db.transaction(async (tx) => {
      await tx
        .select({ id: item.id })
        .from(item)
        .where(eq(item.id, fx.item("GG-K17")))
        .for("update");
      itemLocked();
      await held;
    });
    await locked;
    // B: the posting waits on the item, before touching any cost pool.
    const posting = postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28);
    await new Promise((resolve) => setTimeout(resolve, 300));
    // C: the cost pool of the same item is still free.
    const free = await third.db.transaction(async (tx) => {
      const rows = await tx
        .select({ itemId: inventoryCost.itemId })
        .from(inventoryCost)
        .where(eq(inventoryCost.itemId, fx.item("GG-K17")))
        .for("update", { noWait: true });
      return rows.length;
    });
    expect(free).toBeGreaterThan(0);
    release();
    await archive;
    expect((await posting).ok).toBe(true);
  });

  it("re-locks inside one transaction without waiting", async () => {
    await ctx.db.transaction(async (tx) => {
      const locks = await lockForPosting(tx, {
        itemIds: [fx.item("GG-K17")],
        locationIds: [fx.place("BAI-01")],
        pairs: [{ itemId: fx.item("GG-K17"), condition: "NEEDS_REPAIR" }],
      });
      expect(
        locks.pools.get(`${fx.item("GG-K17")}|NEEDS_REPAIR`)?.avgCost,
      ).toBe(160_000);
      const { lines } = await postMovements(
        tx,
        fx.director,
        {
          documentType: "TEST",
          documentId: null,
          documentCode: "T-RELOCK",
          businessDate: OCT_28,
          lines: [
            {
              itemId: fx.item("GG-K17"),
              condition: "NEEDS_REPAIR",
              locationId: fx.place("BAI-01"),
              movement: "ADJUST_OUT",
              quantityMilli: -1 * K,
              description: "thử",
            },
          ],
        },
        OCT_28,
      );
      expect(lines[0]?.unitCost).toBe(160_000);
    });
  });
});

describe("reading", () => {
  it("lists newest first, filters posted, and lists the waiting stock", async () => {
    const posted = await draft([["GG-CH", 20, 20, 0, 240_000]]);
    await postRepairOrder(ctx.db, fx.accountant, posted, {}, OCT_28);
    const open = await draft();
    expect((await listRepairOrders(ctx.db)).map((r) => r.code)).toEqual([
      open,
      posted,
    ]);
    expect(
      (await listRepairOrders(ctx.db, { status: "POSTED" })).map((r) => r.code),
    ).toEqual([posted]);
    const [first] = await listRepairOrders(ctx.db);
    expect(first).toMatchObject({
      status: "DRAFT",
      lineCount: 2,
      goodMilli: 56 * K,
      scrapMilli: 4 * K,
      cost: 2_220_000,
    });

    const waiting = await awaitingRepair(ctx.db, fx.place("BAI-01"));
    expect(waiting.scrapPricePerKg).toBe(7_500);
    expect(waiting.items.map((i) => [i.itemCode, i.onHandMilli / K])).toEqual([
      ["GG-CH", 43],
      ["GG-K17", 201],
      ["GG-M16", 9],
    ]);
    expect(waiting.items.find((i) => i.itemCode === "GG-K17")).toMatchObject({
      needsRepairAvg: 160_000,
      goodPoolMilli: 1_120 * K,
      goodAvg: 195_861,
      scrapAvg: 150_000,
      standardWeightKg: "13.500",
    });
    const workshop = await awaitingRepair(ctx.db, fx.place("XUONG-01"), [
      fx.item("GG-K17"),
    ]);
    expect(workshop.items.map((i) => [i.itemCode, i.onHandMilli / K])).toEqual([
      ["GG-K15", 10],
      ["GG-K17", 0],
    ]);
  });

  it("keeps repair lines out of reach of a deleted draft", async () => {
    const code = await draft();
    await deleteRepairDraft(ctx.db, fx.accountant, code);
    expect(await ctx.db.select().from(repairOrderLine)).toEqual([]);
  });
});

describe("repair slips in the activity log (activity-log 5.4)", () => {
  it("logs the draft, an edit, and the posting like D18", async () => {
    const code = await draft();
    const [row] = await ctx.db
      .select({ updatedAt: repairOrder.updatedAt })
      .from(repairOrder)
      .where(eq(repairOrder.code, code));
    await updateRepairDraft(
      ctx.db,
      fx.accountant,
      code,
      slip(D12, {
        repairedBy: "Tổ anh Tám",
        updatedAt: row?.updatedAt.toISOString(),
      }),
      OCT_28,
    );
    expect(
      (await postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28)).ok,
    ).toBe(true);
    const rows = await activityRows(ctx.db, code);
    expect(rows.map((entry) => [entry.action, entry.summary])).toEqual([
      ["CREATE", "2 mã hàng · lấy 60 cái từ BAI-01"],
      ["UPDATE", "Người sửa: Tổ anh Bảy → Tổ anh Tám"],
      ["POST", "56 cái về Tốt, 4 phế liệu · chi phí 2.220.000 ₫"],
    ]);
    expect(rows[2]?.flags).not.toContain("ANOMALY");
  });

  it("flags a posting with a confirmed high cost", async () => {
    const code = await draft([["GG-K17", 20, 20, 0, 6_000_000]]);
    await postRepairOrder(
      ctx.db,
      fx.accountant,
      code,
      { confirmedOverrides: ["line:GG-K17"] },
      OCT_28,
    );
    const row = await lastActivity(ctx.db, code);
    expect(row?.flags).toContain("ANOMALY");
    expect(row?.summary).toContain(
      "đã xác nhận chi phí cao GG-K17 300.000 ₫/cái",
    );
  });

  it("a refused posting adds no row, a deleted draft keeps its row", async () => {
    const code = await draft();
    await postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28);
    expect(
      (await postRepairOrder(ctx.db, fx.accountant, code, {}, OCT_28)).ok,
    ).toBe(false);
    expect(await activityTrail(ctx.db, code)).toEqual([
      `CREATE ${code}`,
      `POST ${code}`,
    ]);
    const other = await draft();
    await deleteRepairDraft(ctx.db, fx.accountant, other);
    expect(await lastActivity(ctx.db, other)).toMatchObject({
      action: "DELETE_DRAFT",
      summary: "Nháp có 2 mã hàng, chưa ghi sổ",
    });
  });
});

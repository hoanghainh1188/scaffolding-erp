// Stocktake service (stocktake tasks 4.1-4.8): start, blind count view,
// submit with the book at "Xong mã này", approve into the ledger, recount,
// return, cancel, and the read side.
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { inventoryCost, inventoryLedger, item, stocktake } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import type { Movement } from "@/domain/movement";
import { updateItem } from "@/lib/catalog/items";
import { updateLocation } from "@/lib/catalog/places";
import { postMovements } from "@/lib/inventory/post";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { createTestContext, createTestUser } from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import {
  countView,
  getStocktake,
  listStocktakes,
  openStocktakes,
  startOptions,
} from "./queries";
import {
  approveStocktake,
  cancelStocktake,
  requestRecount,
  returnStocktake,
  startStocktake,
  submitStocktake,
} from "./sessions";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

const K = 1000;
/** Rounds of the double-start race; RACES=300 to stress it locally. */
const RACES = Number(process.env.RACES ?? 30);
const OCT_20 = "2026-10-20" as BusinessDate;
const OCT_28 = "2026-10-28" as BusinessDate;

let fx: InventoryFixture;
let keeper: { id: string; role: "WAREHOUSE" };
let director: { id: string; role: "DIRECTOR" };

beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
  const user = await createTestUser(ctx, {
    role: "WAREHOUSE",
    username: "vantung",
    name: "Văn Tùng",
  });
  keeper = { id: user.id, role: "WAREHOUSE" };
  director = { id: fx.director.id, role: "DIRECTOR" };
});

/** The database clock: ledger created_at comes from it (design D2). */
async function clock(): Promise<Date> {
  const rows = await ctx.db.execute<{ now: string }>(
    sql`select clock_timestamp()::text as now`,
  );
  return new Date(rows[0]?.now ?? "");
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 15));

async function post(
  lines: {
    code: string;
    condition: Condition;
    pieces: number;
    movement: Movement;
    unitCost?: number;
    place?: string;
  }[],
  date: BusinessDate = OCT_28,
) {
  await ctx.db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "TEST",
        documentId: null,
        documentCode: "TEST",
        businessDate: date,
        lines: lines.map((line) => ({
          itemId: fx.item(line.code),
          condition: line.condition,
          locationId: fx.place(line.place ?? "BAI-01"),
          movement: line.movement,
          quantityMilli: line.pieces * K,
          ...(line.unitCost === undefined
            ? {}
            : { amount: line.pieces * line.unitCost }),
          description: "test",
        })),
      },
      date,
    ),
  );
}

/** Opening stock of the D13 example at BAI-01. */
async function openD13() {
  const opening = (
    code: string,
    condition: Condition,
    pieces: number,
    unitCost: number,
    place?: string,
  ) => ({
    code,
    condition,
    pieces,
    unitCost,
    movement: "OPENING" as const,
    ...(place ? { place } : {}),
  });
  await post(
    [
      opening("GG-CH", "GOOD", 2_480, 31_000),
      opening("GG-CH", "NEEDS_REPAIR", 40, 18_000),
      opening("GG-K15", "GOOD", 860, 167_116),
      opening("GG-K17", "GOOD", 1_230, 195_282),
      opening("PK-KU", "GOOD", 500, 40_000),
      opening("GG-M16", "GOOD", 300, 250_000),
      opening("GG-K17", "NEEDS_REPAIR", 9, 160_000, "XUONG-01"),
    ],
    OCT_20,
  );
}

async function start(
  groupIds: string[] | null = null,
  place = "BAI-01",
  actor: { id: string } = keeper,
) {
  const result = await startStocktake(
    ctx.db,
    actor,
    {
      clientStartId: crypto.randomUUID(),
      locationId: fx.place(place),
      groupIds,
    },
    { now: await clock() },
  );
  if (!result.ok) throw new Error(result.error);
  return result.data.code;
}

type Count = [code: string, lines: [Condition, number][]];

async function submit(
  code: string,
  counts: Count[],
  times: { startedAt?: Date; countedAt?: Date; now?: Date } = {},
  submissionId: string = crypto.randomUUID(),
) {
  const now = times.now ?? (await clock());
  return submitStocktake(
    ctx.db,
    keeper,
    code,
    {
      submissionId,
      deviceNow: now.toISOString(),
      items: counts.map(([itemCode, lines]) => ({
        itemId: fx.item(itemCode),
        startedAt: (times.startedAt ?? times.countedAt ?? now).toISOString(),
        countedAt: (times.countedAt ?? now).toISOString(),
        lines: lines.map(([condition, pieces]) => ({
          condition,
          quantity: String(pieces),
        })),
      })),
    },
    { now },
  );
}

const D13_COUNTS: Count[] = [
  [
    "GG-CH",
    [
      ["GOOD", 2_450],
      ["NEEDS_REPAIR", 50],
    ],
  ],
  ["GG-K15", [["GOOD", 852]]],
  ["GG-K17", [["GOOD", 1_226]]],
  ["PK-KU", [["GOOD", 502]]],
  ["GG-M16", [["GOOD", 300]]],
];

async function d13Session() {
  await openD13();
  const code = await start();
  const sent = await submit(code, D13_COUNTS);
  if (!sent.ok) throw new Error(sent.error);
  return code;
}

async function sessionLines(code: string) {
  const detail = await getStocktake(ctx.db, code);
  return detail?.lines ?? [];
}

function line(
  lines: Awaited<ReturnType<typeof sessionLines>>,
  code: string,
  condition: Condition,
) {
  const found = lines.find(
    (row) => row.itemCode === code && row.condition === condition,
  );
  if (!found) throw new Error(`no line ${code} ${condition}`);
  return found;
}

async function ledgerOf(code: string) {
  return ctx.db
    .select({
      itemId: inventoryLedger.itemId,
      condition: inventoryLedger.condition,
      movement: inventoryLedger.movement,
      quantity: inventoryLedger.quantity,
      unitCost: inventoryLedger.unitCost,
      amount: inventoryLedger.amount,
      businessDate: inventoryLedger.businessDate,
      locationId: inventoryLedger.locationId,
      documentType: inventoryLedger.documentType,
    })
    .from(inventoryLedger)
    .where(eq(inventoryLedger.documentCode, code))
    .orderBy(inventoryLedger.id);
}

async function stockAt(code: string, condition: Condition, place = "BAI-01") {
  const [row] = await ctx.db
    .select({
      total: sql<string>`coalesce(sum(${inventoryLedger.quantity}), 0)`,
    })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, fx.item(code)),
        eq(inventoryLedger.condition, condition),
        eq(inventoryLedger.locationId, fx.place(place)),
      ),
    );
  return Number(row?.total ?? 0);
}

async function avg(code: string, condition: Condition) {
  const [row] = await ctx.db
    .select({ avg: inventoryCost.avgCost })
    .from(inventoryCost)
    .where(
      and(
        eq(inventoryCost.itemId, fx.item(code)),
        eq(inventoryCost.condition, condition),
      ),
    );
  return row?.avg ?? null;
}

async function groupId(name: string) {
  const [row] = await ctx.db
    .select({ id: item.groupId })
    .from(item)
    .innerJoin(sql`item_group g`, sql`g.id = ${item.groupId}`)
    .where(sql`g.name = ${name}`)
    .limit(1);
  return row?.id ?? "";
}

describe("startStocktake (4.1)", () => {
  it("refuses a construction site", async () => {
    await openD13();
    const result = await startStocktake(ctx.db, keeper, {
      clientStartId: crypto.randomUUID(),
      locationId: fx.place("anPhu"),
      groupIds: null,
    });
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      error: "Chỉ kiểm kê bãi và xưởng",
    });
    expect(await ctx.db.select().from(stocktake)).toHaveLength(0);
  });

  it("refuses an archived yard", async () => {
    await openD13();
    await ctx.db.execute(
      sql`insert into location (code, name, type) values ('BAI-02', 'Bãi phụ', 'YARD')`,
    );
    const [yard] = await ctx.db.execute<{ id: string }>(
      sql`select id from location where code = 'BAI-02'`,
    );
    await updateLocation(ctx.db, fx.director, yard?.id ?? "", {
      status: "ARCHIVED",
    });
    const result = await startStocktake(ctx.db, keeper, {
      clientStartId: crypto.randomUUID(),
      locationId: yard?.id,
      groupIds: null,
    });
    expect(result).toMatchObject({
      ok: false,
      error: "Vị trí BAI-02 đã ngừng dùng",
    });
  });

  it("lists the pairs with stock in the chosen groups", async () => {
    await openD13();
    await post(
      [
        {
          code: "GG-K15",
          condition: "NEEDS_REPAIR",
          pieces: 5,
          movement: "OPENING",
          unitCost: 1,
        },
      ],
      OCT_28,
    );
    await post([
      {
        code: "GG-K15",
        condition: "NEEDS_REPAIR",
        pieces: -5,
        movement: "SALE_OUT",
      },
    ]);
    const all = await start();
    expect(
      (await countView(ctx.db, all))?.lines.map(
        (row) => `${row.itemCode} ${row.condition}`,
      ),
    ).toEqual([
      "GG-CH GOOD",
      "GG-CH NEEDS_REPAIR",
      "GG-K15 GOOD",
      "GG-K17 GOOD",
      "GG-M16 GOOD",
      "PK-KU GOOD",
    ]);
    const accessories = await start(
      [await groupId("Phụ kiện")],
      "XUONG-01",
    ).catch((error: Error) => error.message);
    expect(accessories).toBe("Phạm vi đã chọn không có hàng nào ở XUONG-01");
    await cancelStocktake(ctx.db, keeper, all, { reason: "Thử phạm vi" });
    const scoped = await start([await groupId("Phụ kiện")]);
    const view = await countView(ctx.db, scoped);
    expect(view?.lines.map((row) => row.itemCode)).toEqual(["PK-KU"]);
    expect(view?.scope).toEqual(["Phụ kiện"]);
  });

  it("refuses a second open session at a place", async () => {
    await openD13();
    const first = await start();
    expect(first).toMatch(/^KK-\d{4}-001$/);
    const second = await startStocktake(ctx.db, keeper, {
      clientStartId: crypto.randomUUID(),
      locationId: fx.place("BAI-01"),
      groupIds: null,
    });
    expect(second).toMatchObject({
      ok: false,
      status: 409,
      error: `BAI-01 đang có phiên ${first} chưa xong`,
    });
    expect(await start(null, "XUONG-01")).toMatch(/-002$/);
  });

  it("answers one start request once, even when sent twice at once", async () => {
    await openD13();
    const body = {
      clientStartId: crypto.randomUUID(),
      locationId: fx.place("BAI-01"),
      groupIds: null,
    };
    const [a, b] = await Promise.all([
      startStocktake(ctx.db, keeper, body),
      startStocktake(other.db, keeper, body),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.data.code).toBe(b.data.code);
    expect([a.data.replayed, b.data.replayed].sort()).toEqual([false, true]);
    expect(await ctx.db.select().from(stocktake)).toHaveLength(1);
  });

  it("never calls the place busy for its own repeated start (repeated races)", async () => {
    await openD13();
    for (let round = 0; round < RACES; round += 1) {
      const body = {
        clientStartId: crypto.randomUUID(),
        locationId: fx.place("BAI-01"),
        groupIds: null,
      };
      const [a, b] = await Promise.all([
        startStocktake(ctx.db, keeper, body),
        startStocktake(other.db, keeper, body),
      ]);
      expect([a, b].map((result) => result.ok)).toEqual([true, true]);
      if (!a.ok || !b.ok) return;
      expect(a.data.code).toBe(b.data.code);
      await cancelStocktake(ctx.db, keeper, a.data.code, {
        reason: "Thử bắt đầu hai lần",
      });
    }
    expect(await ctx.db.select().from(stocktake)).toHaveLength(RACES);
  });
});

describe("countView (4.2)", () => {
  it("never gives the phone the book, a cost or a difference", async () => {
    const code = await d13Session();
    const view = await countView(ctx.db, code);
    const first = view?.lines[0] ?? {};
    expect(Object.keys(first).sort()).toEqual([
      "condition",
      "counted",
      "countedAt",
      "groupName",
      "id",
      "itemCode",
      "itemId",
      "itemName",
      "origin",
      "recount",
      "unit",
    ]);
    expect(JSON.stringify(view)).not.toMatch(/book|cost|difference|flags/i);
    expect(view?.lines.find((row) => row.itemCode === "GG-K17")?.counted).toBe(
      "1226.000",
    );
    expect(view?.round).toBe(1);
  });
});

describe("submitStocktake (4.3)", () => {
  it("answers a repeated submission with what it already took", async () => {
    await openD13();
    const code = await start();
    const id = crypto.randomUUID();
    const first = await submit(code, D13_COUNTS, {}, id);
    expect(first).toMatchObject({
      ok: true,
      data: { status: "SUBMITTED", counted: 6, total: 6, replayed: false },
    });
    await post([
      {
        code: "GG-K17",
        condition: "GOOD",
        pieces: 70,
        movement: "PURCHASE_IN",
        unitCost: 195_282,
      },
    ]);
    const again = await submit(code, [["GG-K17", [["GOOD", 1]]]], {}, id);
    expect(again).toMatchObject({ ok: true, data: { replayed: true } });
    expect(line(await sessionLines(code), "GG-K17", "GOOD")).toMatchObject({
      bookMilli: 1_230 * K,
      countedMilli: 1_226 * K,
    });
    const otherSend = await submit(code, D13_COUNTS);
    expect(otherSend).toMatchObject({
      ok: false,
      status: 409,
      error: "Phiên đã gửi văn phòng",
    });
  });

  it("leaves lines not counted empty and takes added lines", async () => {
    await openD13();
    const code = await start([await groupId("Giàn giáo")]);
    const sent = await submit(code, [
      [
        "GG-CH",
        [
          ["GOOD", 2_450],
          ["NEEDS_REPAIR", 50],
          ["SCRAP", 6],
        ],
      ],
      ["PK-KU", [["GOOD", 12]]],
    ]);
    expect(sent).toMatchObject({ ok: true, data: { counted: 4, total: 7 } });
    const lines = await sessionLines(code);
    expect(line(lines, "GG-CH", "SCRAP")).toMatchObject({
      origin: "ADDED",
      bookMilli: 0,
      countedMilli: 6 * K,
      differenceMilli: 6 * K,
    });
    expect(line(lines, "PK-KU", "GOOD")).toMatchObject({
      origin: "ADDED",
      bookMilli: 500 * K,
      differenceMilli: -488 * K,
    });
    expect(line(lines, "GG-K17", "GOOD")).toMatchObject({
      countedMilli: null,
      bookMilli: null,
    });
  });

  it("refuses to add an archived item and needs every condition", async () => {
    await openD13();
    const code = await start();
    await updateItem(ctx.db, fx.director, fx.item("OT-06"), {
      status: "ARCHIVED",
    });
    expect(await submit(code, [["OT-06", [["GOOD", 1]]]])).toMatchObject({
      ok: false,
      status: 422,
      error: "Vật tư OT-06 đã ngừng dùng",
    });
    expect(await submit(code, [["GG-CH", [["GOOD", 2_450]]]])).toMatchObject({
      ok: false,
      status: 422,
      error: "Nhập số cho Chờ sửa (0 nếu không có)",
    });
    expect(await submit(code, [])).toMatchObject({
      ok: false,
      error: "Đếm ít nhất một mã trước khi gửi",
    });
    // numeric(14,3) holds 11 whole digits: one more is a typo, not a 500.
    expect(
      await submit(code, [["GG-K17", [["GOOD", 100_000_000_000]]]]),
    ).toMatchObject({
      ok: false,
      status: 422,
      error: "Số lượng không hợp lệ",
      field: "items.0.lines.0.quantity",
    });
  });
});

describe("book at 'Xong mã này' (4.4)", () => {
  it("compares with the book when the item was done, not when sent", async () => {
    await post(
      [
        {
          code: "GG-K17",
          condition: "GOOD",
          pieces: 1_200,
          movement: "OPENING",
          unitCost: 195_282,
        },
        {
          code: "PK-KU",
          condition: "GOOD",
          pieces: 500,
          movement: "OPENING",
          unitCost: 40_000,
        },
      ],
      OCT_20,
    );
    const code = await start();
    await pause();
    await post([
      {
        code: "GG-K17",
        condition: "GOOD",
        pieces: 30,
        movement: "PURCHASE_IN",
        unitCost: 195_282,
      },
    ]);
    await pause();
    const k17Done = await clock();
    await pause();
    const kuStarted = await clock();
    await pause();
    await post([
      {
        code: "PK-KU",
        condition: "GOOD",
        pieces: 50,
        movement: "PURCHASE_IN",
        unitCost: 40_000,
      },
    ]);
    await pause();
    const kuDone = await clock();
    await pause();
    await post([
      { code: "GG-K17", condition: "GOOD", pieces: -100, movement: "SALE_OUT" },
    ]);
    await post([
      {
        code: "PK-KU",
        condition: "GOOD",
        pieces: 7,
        movement: "PURCHASE_IN",
        unitCost: 40_000,
      },
    ]);
    await pause();
    const now = await clock();
    const id = crypto.randomUUID();
    const sent = await submitStocktake(
      ctx.db,
      keeper,
      code,
      {
        submissionId: id,
        deviceNow: now.toISOString(),
        items: [
          {
            itemId: fx.item("GG-K17"),
            startedAt: k17Done.toISOString(),
            countedAt: k17Done.toISOString(),
            lines: [{ condition: "GOOD", quantity: "1226" }],
          },
          {
            itemId: fx.item("PK-KU"),
            startedAt: kuStarted.toISOString(),
            countedAt: kuDone.toISOString(),
            lines: [{ condition: "GOOD", quantity: "550" }],
          },
        ],
      },
      { now },
    );
    expect(sent.ok).toBe(true);
    const lines = await sessionLines(code);
    expect(line(lines, "GG-K17", "GOOD")).toMatchObject({
      bookMilli: 1_230 * K,
      countedMilli: 1_226 * K,
      differenceMilli: -4 * K,
      flags: [],
    });
    expect(line(lines, "PK-KU", "GOOD")).toMatchObject({
      bookMilli: 550 * K,
      differenceMilli: 0,
      flags: ["MOVED"],
    });
    const approved = await approveStocktake(ctx.db, director, code, {}, OCT_28);
    expect(approved).toMatchObject({ ok: true, data: { ledgerLines: 1 } });
    expect(await stockAt("GG-K17", "GOOD")).toBe(1_126);
    expect(await stockAt("PK-KU", "GOOD")).toBe(557);
  });

  it("does not flag nor count stock that moved after the item was done", async () => {
    await post(
      [
        {
          code: "PK-KU",
          condition: "GOOD",
          pieces: 500,
          movement: "OPENING",
          unitCost: 40_000,
        },
      ],
      OCT_20,
    );
    const code = await start();
    await pause();
    const startedAt = await clock();
    await pause();
    const done = await clock();
    await pause();
    await post([
      {
        code: "PK-KU",
        condition: "GOOD",
        pieces: 50,
        movement: "PURCHASE_IN",
        unitCost: 40_000,
      },
    ]);
    expect(
      (
        await submit(code, [["PK-KU", [["GOOD", 502]]]], {
          startedAt,
          countedAt: done,
        })
      ).ok,
    ).toBe(true);
    expect(line(await sessionLines(code), "PK-KU", "GOOD")).toMatchObject({
      bookMilli: 500 * K,
      differenceMilli: 2 * K,
      flags: [],
    });
  });

  it("moves a slow phone clock to the server clock", async () => {
    await post(
      [
        {
          code: "PK-KU",
          condition: "GOOD",
          pieces: 500,
          movement: "OPENING",
          unitCost: 40_000,
        },
      ],
      OCT_20,
    );
    const code = await start();
    await pause();
    const done = await clock();
    await pause();
    await post([
      {
        code: "PK-KU",
        condition: "GOOD",
        pieces: 50,
        movement: "PURCHASE_IN",
        unitCost: 40_000,
      },
    ]);
    const now = await clock();
    const slow = 5 * 60 * 1000;
    const sent = await submitStocktake(
      ctx.db,
      keeper,
      code,
      {
        submissionId: crypto.randomUUID(),
        deviceNow: new Date(now.getTime() - slow).toISOString(),
        items: [
          {
            itemId: fx.item("PK-KU"),
            startedAt: new Date(done.getTime() - slow).toISOString(),
            countedAt: new Date(done.getTime() - slow).toISOString(),
            lines: [{ condition: "GOOD", quantity: "500" }],
          },
        ],
      },
      { now },
    );
    expect(sent.ok).toBe(true);
    const counted = line(await sessionLines(code), "PK-KU", "GOOD");
    expect(counted.countedAt?.getTime()).toBe(done.getTime());
    expect(counted.bookMilli).toBe(500 * K);
  });
});

describe("approveStocktake (4.5)", () => {
  it("turns the D13 differences into five ledger lines at the average", async () => {
    const code = await d13Session();
    const before = await ctx.db.execute<{ total: string }>(
      sql`select sum(amount)::text as total from inventory_ledger`,
    );
    const approved = await approveStocktake(ctx.db, director, code, {}, OCT_28);
    expect(approved).toMatchObject({ ok: true, data: { ledgerLines: 5 } });
    const posted = await ledgerOf(code);
    expect(
      posted.map((row) => [
        row.itemId,
        row.condition,
        row.movement,
        row.quantity,
        row.unitCost,
      ]),
    ).toEqual([
      [fx.item("GG-CH"), "GOOD", "ADJUST_OUT", "-30.000", 31_000],
      [fx.item("GG-CH"), "NEEDS_REPAIR", "ADJUST_IN", "10.000", 18_000],
      [fx.item("GG-K15"), "GOOD", "ADJUST_OUT", "-8.000", 167_116],
      [fx.item("GG-K17"), "GOOD", "ADJUST_OUT", "-4.000", 195_282],
      [fx.item("PK-KU"), "GOOD", "ADJUST_IN", "2.000", 40_000],
    ]);
    expect(
      posted.every(
        (row) =>
          row.businessDate === OCT_28 &&
          row.locationId === fx.place("BAI-01") &&
          row.documentType === "STOCKTAKE",
      ),
    ).toBe(true);
    expect(await avg("GG-K15", "GOOD")).toBe(167_116);
    expect(await avg("GG-K17", "GOOD")).toBe(195_282);
    expect(await avg("GG-CH", "NEEDS_REPAIR")).toBe(18_000);
    const after = await ctx.db.execute<{ total: string }>(
      sql`select sum(amount)::text as total from inventory_ledger`,
    );
    expect(Number(after[0]?.total) - Number(before[0]?.total)).toBe(-2_788_056);
    const [head] = await ctx.db.select().from(stocktake);
    expect(head).toMatchObject({ status: "DONE", approvedBy: fx.director.id });
    expect(head?.postingId).not.toBeNull();
    expect(await reconcileInventory(ctx.db)).toEqual([]);
    const detail = await getStocktake(ctx.db, code);
    expect(detail?.summary.value).toBe(-2_788_056);
    expect(detail?.posted).toHaveLength(5);
  });

  it("books at the average of the approval day", async () => {
    const code = await d13Session();
    await post([
      {
        code: "GG-K17",
        condition: "GOOD",
        pieces: 1_230,
        movement: "PURCHASE_IN",
        unitCost: 196_718,
      },
    ]);
    expect(await avg("GG-K17", "GOOD")).toBe(196_000);
    await approveStocktake(ctx.db, director, code, {}, OCT_28);
    const k17 = (await ledgerOf(code)).find(
      (row) => row.itemId === fx.item("GG-K17"),
    );
    expect(k17?.unitCost).toBe(196_000);
  });

  it("closes a session where every line matched without ledger lines", async () => {
    await openD13();
    const code = await start(null, "XUONG-01");
    await submit(code, [["GG-K17", [["NEEDS_REPAIR", 9]]]]);
    expect(
      await approveStocktake(ctx.db, director, code, {}, OCT_28),
    ).toMatchObject({
      ok: true,
      data: { ledgerLines: 0 },
    });
    expect(await ledgerOf(code)).toHaveLength(0);
    const [head] = await ctx.db.select().from(stocktake);
    expect(head).toMatchObject({ status: "DONE", postingId: null });
  });

  it("needs a unit cost for a surplus of a pair never priced", async () => {
    await openD13();
    const code = await start();
    await submit(code, [["OT-06", [["NEW", 5]]]]);
    const refused = await approveStocktake(ctx.db, director, code, {}, OCT_28);
    expect(refused).toMatchObject({
      ok: false,
      status: 400,
      error: "OT-06 Mới chưa có giá vốn, nhập đơn giá",
    });
    const ot = line(await sessionLines(code), "OT-06", "NEW");
    expect(
      await approveStocktake(
        ctx.db,
        director,
        code,
        { unitCosts: { [ot.id]: 150_000 } },
        OCT_28,
      ),
    ).toMatchObject({ ok: true, data: { ledgerLines: 1 } });
    const [row] = await ledgerOf(code);
    expect(row).toMatchObject({ movement: "ADJUST_IN", unitCost: 150_000 });
  });
});

describe("approval refusals (4.6)", () => {
  it("refuses a shortage the place no longer has and rolls back", async () => {
    const code = await d13Session();
    await post([
      {
        code: "GG-CH",
        condition: "GOOD",
        pieces: -2_460,
        movement: "SALE_OUT",
      },
    ]);
    const refused = await approveStocktake(ctx.db, director, code, {}, OCT_28);
    expect(refused).toMatchObject({
      ok: false,
      status: 409,
      error: "Không đủ hàng: GG-CH Tốt tại BAI-01 còn 20 cái",
    });
    expect(await ledgerOf(code)).toHaveLength(0);
    const [head] = await ctx.db.select().from(stocktake);
    expect(head?.status).toBe("SUBMITTED");
  });

  it("rolls the whole session back when an item was archived", async () => {
    const code = await d13Session();
    await ctx.db.execute(
      sql`update item set status = 'ARCHIVED', archived_at = now() where code = 'PK-KU'`,
    );
    const refused = await approveStocktake(ctx.db, director, code, {}, OCT_28);
    expect(refused).toMatchObject({
      ok: false,
      error: "Vật tư PK-KU đã ngừng dùng",
    });
    expect(await ledgerOf(code)).toHaveLength(0);
  });

  it("writes one set of lines when approved twice at once", async () => {
    const code = await d13Session();
    const [a, b] = await Promise.all([
      approveStocktake(ctx.db, director, code, {}, OCT_28),
      approveStocktake(other.db, director, code, {}, OCT_28),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((result) => !result.ok)).toMatchObject({
      status: 409,
      error: "Phiên kiểm kê đã được ghi sổ",
    });
    expect(await ledgerOf(code)).toHaveLength(5);
  });

  it("refuses a session still counting", async () => {
    await openD13();
    const code = await start();
    expect(
      await approveStocktake(ctx.db, director, code, {}, OCT_28),
    ).toMatchObject({
      ok: false,
      status: 409,
      error: "Phiên chưa gửi văn phòng",
    });
  });

  it("runs beside a purchase of the same item without a deadlock", async () => {
    const code = await d13Session();
    const purchase = other.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "TEST",
          documentId: null,
          documentCode: "TEST-2",
          businessDate: OCT_28,
          lines: [
            {
              itemId: fx.item("GG-K17"),
              condition: "GOOD",
              locationId: fx.place("BAI-01"),
              movement: "PURCHASE_IN",
              quantityMilli: 10 * K,
              amount: 1_952_820,
              description: "test",
            },
          ],
        },
        OCT_28,
      ),
    );
    const [approved] = await Promise.all([
      approveStocktake(ctx.db, director, code, {}, OCT_28),
      purchase,
    ]);
    expect(approved.ok).toBe(true);
    expect(await stockAt("GG-K17", "GOOD")).toBe(1_236);
    expect(await reconcileInventory(ctx.db)).toEqual([]);
  });
});

describe("recount, return, cancel (4.7)", () => {
  it("sends one line back and keeps the others", async () => {
    const code = await d13Session();
    const target = line(await sessionLines(code), "GG-CH", "NEEDS_REPAIR");
    const asked = await requestRecount(ctx.db, director, code, {
      lineIds: [target.id],
    });
    expect(asked).toMatchObject({
      ok: true,
      data: { status: "COUNTING", round: 2 },
    });
    const view = await countView(ctx.db, code);
    expect(
      view?.lines.filter((row) => row.recount).map((row) => row.itemCode),
    ).toEqual(["GG-CH"]);
    let lines = await sessionLines(code);
    expect(line(lines, "GG-CH", "NEEDS_REPAIR").countedMilli).toBeNull();
    expect(line(lines, "GG-K17", "GOOD")).toMatchObject({
      bookMilli: 1_230 * K,
      countedMilli: 1_226 * K,
    });
    expect(line(lines, "GG-CH", "GOOD").flags).toEqual(["OVER_PCT"]);

    expect(await submit(code, [["GG-K17", [["GOOD", 1_228]]]])).toMatchObject({
      ok: false,
      error: "GG-K17 không cần đếm lại",
    });
    expect(await submit(code, [])).toMatchObject({
      ok: false,
      status: 422,
      error: "Còn 1 dòng văn phòng yêu cầu đếm lại, đếm xong mới gửi được",
    });
    await post([
      {
        code: "GG-CH",
        condition: "NEEDS_REPAIR",
        pieces: 3,
        movement: "PURCHASE_IN",
        unitCost: 18_000,
      },
    ]);
    const sent = await submit(code, [["GG-CH", [["NEEDS_REPAIR", 42]]]]);
    expect(sent).toMatchObject({ ok: true, data: { status: "SUBMITTED" } });
    lines = await sessionLines(code);
    expect(line(lines, "GG-CH", "NEEDS_REPAIR")).toMatchObject({
      bookMilli: 43 * K,
      countedMilli: 42 * K,
      recount: false,
    });
    expect(line(lines, "GG-K17", "GOOD")).toMatchObject({
      bookMilli: 1_230 * K,
      countedMilli: 1_226 * K,
    });
  });

  it("refuses recounting nothing or a line not counted", async () => {
    await openD13();
    const code = await start();
    await submit(code, [["GG-K17", [["GOOD", 1_226]]]]);
    expect(
      await requestRecount(ctx.db, director, code, { lineIds: [] }),
    ).toMatchObject({
      ok: false,
      status: 400,
    });
    const uncounted = line(await sessionLines(code), "PK-KU", "GOOD");
    expect(
      await requestRecount(ctx.db, director, code, { lineIds: [uncounted.id] }),
    ).toMatchObject({ ok: false, error: "Chỉ yêu cầu đếm lại dòng đã đếm" });
  });

  it("returns a session with a reason and keeps every count", async () => {
    const code = await d13Session();
    expect(
      await returnStocktake(ctx.db, director, code, { reason: "  " }),
    ).toMatchObject({
      ok: false,
      error: "Nhập lý do trả lại",
    });
    const returned = await returnStocktake(ctx.db, director, code, {
      reason: "Đếm lại cả khu chéo sau xưởng",
    });
    expect(returned).toMatchObject({
      ok: true,
      data: { status: "COUNTING", round: 2 },
    });
    const view = await countView(ctx.db, code);
    expect(view?.returnedReason).toBe("Đếm lại cả khu chéo sau xưởng");
    expect(view?.lines.every((row) => row.counted !== null)).toBe(true);
    expect((await submit(code, [["GG-K17", [["GOOD", 1_230]]]])).ok).toBe(true);
    expect(
      line(await sessionLines(code), "GG-K17", "GOOD").differenceMilli,
    ).toBe(0);
  });

  it("lets the counter cancel only while counting", async () => {
    await openD13();
    const counting = await start(null, "XUONG-01");
    expect(
      await cancelStocktake(ctx.db, keeper, counting, {
        reason: "Chọn nhầm xưởng",
      }),
    ).toMatchObject({ ok: true, data: { status: "CANCELLED" } });
    expect(await start(null, "XUONG-01")).toMatch(/^KK-/);
    const code = await start();
    await submit(code, D13_COUNTS);
    expect(
      await cancelStocktake(ctx.db, keeper, code, { reason: "x" }),
    ).toMatchObject({
      ok: false,
      status: 409,
      error: "Phiên đã gửi văn phòng, nhờ Giám đốc hủy",
    });
    expect(
      await cancelStocktake(ctx.db, director, code, { reason: "" }),
    ).toMatchObject({
      ok: false,
      error: "Nhập lý do hủy",
    });
    expect(
      await cancelStocktake(ctx.db, director, code, { reason: "Đếm sai ngày" }),
    ).toMatchObject({
      ok: true,
    });
    expect(
      await approveStocktake(ctx.db, director, code, {}, OCT_28),
    ).toMatchObject({
      ok: false,
      error: "Phiên kiểm kê đã hủy",
    });
  });

  it("refuses every change once posted", async () => {
    const code = await d13Session();
    await approveStocktake(ctx.db, director, code, {}, OCT_28);
    const anyLine = (await sessionLines(code))[0]?.id;
    for (const result of [
      await requestRecount(ctx.db, director, code, { lineIds: [anyLine] }),
      await returnStocktake(ctx.db, director, code, { reason: "x" }),
      await cancelStocktake(ctx.db, director, code, { reason: "x" }),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        status: 409,
        error: "Phiên kiểm kê đã được ghi sổ",
      });
    }
  });
});

describe("queries (4.8)", () => {
  it("offers yards and workshops with lines per group", async () => {
    await openD13();
    await start(null, "XUONG-01");
    const places = await startOptions(ctx.db);
    expect(places.map((place) => place.code)).toEqual(["BAI-01", "XUONG-01"]);
    const yard = places[0];
    expect(yard).toMatchObject({ lines: 6, lastDoneAt: null, openCode: null });
    expect(yard?.groups.map((group) => [group.name, group.lines])).toEqual([
      ["Giàn giáo", 5],
      ["Phụ kiện", 1],
    ]);
    expect(places[1]?.openCode).toMatch(/^KK-/);
  });

  it("lists waiting sessions first, without numbers while counting", async () => {
    const code = await d13Session();
    const counting = await start(null, "XUONG-01");
    const rows = await listStocktakes(ctx.db);
    expect(rows.map((row) => row.code)).toEqual([code, counting]);
    expect(rows[0]).toMatchObject({
      status: "SUBMITTED",
      counted: 6,
      total: 6,
      diffLines: 5,
      diffValue: -2_788_056,
      startedByName: "Văn Tùng",
    });
    expect(rows[1]).toMatchObject({
      status: "COUNTING",
      diffLines: null,
      diffValue: null,
    });
    expect(await listStocktakes(ctx.db, { status: "COUNTING" })).toHaveLength(
      1,
    );
  });

  it("gives D13 the book, difference, value, flags and tiles", async () => {
    const code = await d13Session();
    const detail = await getStocktake(ctx.db, code);
    expect(detail?.summary).toMatchObject({
      counted: 6,
      matched: 1,
      flagged: 2,
      value: -2_788_056,
      shortage: { lines: 3, value: -3_048_056 },
      surplus: { lines: 2, value: 260_000 },
    });
    expect(line(detail?.lines ?? [], "GG-CH", "GOOD")).toMatchObject({
      bookMilli: 2_480 * K,
      countedMilli: 2_450 * K,
      differenceMilli: -30 * K,
      unitCost: 31_000,
      value: -930_000,
      flags: ["OVER_PCT", "CONDITION_SWAP"],
    });
    expect(line(detail?.lines ?? [], "GG-CH", "NEEDS_REPAIR").flags).toEqual([
      "OVER_PCT",
      "CONDITION_SWAP",
    ]);
    expect(detail?.startedByName).toBe("Văn Tùng");
  });

  it("gives M1 the open sessions with recount and return state", async () => {
    const code = await d13Session();
    const target = line(await sessionLines(code), "GG-CH", "NEEDS_REPAIR");
    await requestRecount(ctx.db, director, code, { lineIds: [target.id] });
    await start(null, "XUONG-01");
    const open = await openStocktakes(ctx.db);
    expect(open).toMatchObject([
      { code, status: "COUNTING", recountLines: 1, counted: 5, total: 6 },
      { locationCode: "XUONG-01", status: "COUNTING", recountLines: 0 },
    ]);
  });
});

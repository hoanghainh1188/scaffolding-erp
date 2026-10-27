import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { inventoryCost, inventoryLedger } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import { createTestContext } from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import {
  approveAdjustment,
  createAdjustment,
  deleteAdjustment,
  getAdjustment,
  listAdjustments,
  returnAdjustment,
  submitAdjustment,
  updateAdjustment,
  type AdjustmentBody,
} from "./adjustments";
import { postMovements } from "./post";
import { reconcileInventory } from "./reconcile";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

const day = (value: string) => value as BusinessDate;
const TODAY = day("2026-10-27");

let fx: InventoryFixture;
beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
});
afterEach(async () => {
  expect(await reconcileInventory(ctx.db)).toEqual([]);
});

async function open(
  rows: [
    code: string,
    Condition,
    place: string,
    pieces: number,
    cost: number,
  ][],
  date = "2026-10-01",
) {
  await ctx.db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "TEST",
        documentId: null,
        documentCode: "TEST-OPEN",
        businessDate: day(date),
        lines: rows.map(([code, condition, place, pieces, cost]) => ({
          itemId: fx.item(code),
          condition,
          locationId: fx.place(place),
          movement: "OPENING",
          quantityMilli: pieces * 1000,
          amount: pieces * cost,
          description: "test",
        })),
      },
      TODAY,
    ),
  );
}

const conditionFix = (): AdjustmentBody => ({
  kind: "ADJUSTMENT",
  reason: "Sửa PTH-2026-064: 10 cái thực tế là Chờ sửa",
  relatedDocumentCode: "PTH-2026-064",
  lines: [
    {
      lineType: "CONDITION",
      itemId: fx.item("GG-K17"),
      condition: "GOOD",
      toCondition: "NEEDS_REPAIR",
      locationId: fx.place("BAI-01"),
      quantity: "10",
    },
  ],
});

async function data<T>(
  result: Promise<{ ok: boolean; data?: T; error?: string }>,
) {
  const value = await result;
  if (!value.ok) throw new Error(value.error);
  return value.data as T;
}

async function stockAt(code: string, condition: Condition, place: string) {
  const rows = await ctx.db
    .select({ quantity: inventoryLedger.quantity })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, fx.item(code)),
        eq(inventoryLedger.condition, condition),
        eq(inventoryLedger.locationId, fx.place(place)),
      ),
    );
  return rows.reduce((sum, row) => sum + Number(row.quantity), 0);
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
  return row?.avg;
}

describe("condition fix ĐC", () => {
  beforeEach(async () => {
    await open([
      ["GG-K17", "GOOD", "BAI-01", 1330, 195_282],
      ["GG-K17", "NEEDS_REPAIR", "BAI-01", 100, 160_000],
    ]);
  });

  it("posts nothing until approved, then exactly two lines", async () => {
    const draft = await data(
      createAdjustment(ctx.db, fx.accountant, conditionFix(), TODAY),
    );
    expect(draft).toMatchObject({
      code: "ĐC-2026-001",
      status: "DRAFT",
      lineCount: 1,
    });
    const pending = await data(
      submitAdjustment(ctx.db, fx.accountant, draft.id),
    );
    expect(pending.status).toBe("PENDING_APPROVAL");
    expect(await stockAt("GG-K17", "GOOD", "BAI-01")).toBe(1330);

    const done = await data(
      approveAdjustment(ctx.db, fx.director, draft.id, day("2026-10-16")),
    );
    expect(done.status).toBe("DONE");
    expect(
      done.posted.map((p) => [
        p.movement,
        p.condition,
        p.locationCode,
        p.quantity,
        p.unitCost,
      ]),
    ).toEqual([
      ["ADJUST_OUT", "GOOD", "BAI-01", -10_000, 195_282],
      ["ADJUST_IN", "NEEDS_REPAIR", "BAI-01", 10_000, 160_000],
    ]);
    expect(await stockAt("GG-K17", "GOOD", "BAI-01")).toBe(1320);
    expect(await avg("GG-K17", "GOOD")).toBe(195_282);
    expect(await avg("GG-K17", "NEEDS_REPAIR")).toBe(160_000);
    const [line] = await ctx.db
      .select({
        date: inventoryLedger.businessDate,
        code: inventoryLedger.documentCode,
      })
      .from(inventoryLedger)
      .where(eq(inventoryLedger.documentId, draft.id));
    expect(line).toEqual({ date: "2026-10-16", code: "ĐC-2026-001" });
  });

  it("re-checks stock at approval", async () => {
    const draft = await data(
      createAdjustment(
        ctx.db,
        fx.accountant,
        {
          kind: "ADJUSTMENT",
          reason: "Đếm thiếu",
          lines: [
            {
              lineType: "QUANTITY",
              itemId: fx.item("GG-K17"),
              condition: "GOOD",
              locationId: fx.place("BAI-01"),
              quantity: "-1300",
            },
          ],
        },
        TODAY,
      ),
    );
    await data(submitAdjustment(ctx.db, fx.accountant, draft.id));
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "TEST",
          documentId: null,
          documentCode: "PX",
          businessDate: day("2026-10-20"),
          lines: [
            {
              itemId: fx.item("GG-K17"),
              condition: "GOOD",
              locationId: fx.place("BAI-01"),
              movement: "SALE_OUT",
              quantityMilli: -1_300_000,
              description: "bán",
            },
          ],
        },
        TODAY,
      ),
    );
    expect(
      await approveAdjustment(ctx.db, fx.director, draft.id, TODAY),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Không đủ hàng: GG-K17 Tốt tại BAI-01 còn 30 cái",
    });
    expect((await getAdjustment(ctx.db, draft.id))?.status).toBe(
      "PENDING_APPROVAL",
    );
  });

  it("posts once when approved twice at the same time", async () => {
    const draft = await data(
      createAdjustment(ctx.db, fx.accountant, conditionFix(), TODAY),
    );
    await data(submitAdjustment(ctx.db, fx.accountant, draft.id));
    const results = await Promise.all([
      approveAdjustment(ctx.db, fx.director, draft.id, TODAY),
      approveAdjustment(other.db, fx.director, draft.id, TODAY),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({
      ok: false,
      status: 409,
      error: "Phiếu đã được ghi sổ",
    });
    const lines = await ctx.db
      .select({ id: inventoryLedger.id })
      .from(inventoryLedger)
      .where(eq(inventoryLedger.documentId, draft.id));
    expect(lines).toHaveLength(2);
  });

  it("goes back to draft with a reason, then round again", async () => {
    const draft = await data(
      createAdjustment(ctx.db, fx.accountant, conditionFix(), TODAY),
    );
    await data(submitAdjustment(ctx.db, fx.accountant, draft.id));
    expect(await returnAdjustment(ctx.db, fx.director, draft.id, "  ")).toEqual(
      {
        ok: false,
        status: 400,
        error: "Nhập lý do trả lại",
      },
    );
    const returned = await data(
      returnAdjustment(
        ctx.db,
        fx.director,
        draft.id,
        "Ghi rõ số phiếu thu hồi",
      ),
    );
    expect(returned).toMatchObject({
      status: "DRAFT",
      returnedReason: "Ghi rõ số phiếu thu hồi",
    });
    const edited = await data(
      updateAdjustment(
        ctx.db,
        draft.id,
        { ...conditionFix(), reason: "Sửa PTH-2026-064" },
        TODAY,
      ),
    );
    expect(edited.reason).toBe("Sửa PTH-2026-064");
    await data(submitAdjustment(ctx.db, fx.accountant, draft.id));
    const done = await data(
      approveAdjustment(ctx.db, fx.director, draft.id, TODAY),
    );
    expect(done.posted).toHaveLength(2);
    expect(
      await updateAdjustment(ctx.db, draft.id, conditionFix(), TODAY),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Phiếu đã được ghi sổ",
    });
    expect(await deleteAdjustment(ctx.db, draft.id)).toEqual({
      ok: false,
      status: 409,
      error: "Phiếu đã được ghi sổ",
    });
  });

  it("refuses a missing reason and approving a draft; deletes drafts", async () => {
    expect(
      await createAdjustment(
        ctx.db,
        fx.accountant,
        { ...conditionFix(), reason: "   " },
        TODAY,
      ),
    ).toEqual({ ok: false, status: 400, error: "Nhập lý do điều chỉnh" });
    const draft = await data(
      createAdjustment(ctx.db, fx.accountant, conditionFix(), TODAY),
    );
    expect(
      await approveAdjustment(ctx.db, fx.director, draft.id, TODAY),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Phiếu chưa gửi duyệt",
    });
    const empty = await data(
      createAdjustment(
        ctx.db,
        fx.accountant,
        { ...conditionFix(), lines: [] },
        TODAY,
      ),
    );
    expect(await submitAdjustment(ctx.db, fx.accountant, empty.id)).toEqual({
      ok: false,
      status: 400,
      error: "Phiếu cần ít nhất một dòng",
    });
    expect((await deleteAdjustment(ctx.db, draft.id)).ok).toBe(true);
    expect(await getAdjustment(ctx.db, draft.id)).toBeNull();
  });

  it("lists pending documents first", async () => {
    const a = await data(
      createAdjustment(ctx.db, fx.accountant, conditionFix(), TODAY),
    );
    const b = await data(
      createAdjustment(ctx.db, fx.accountant, conditionFix(), TODAY),
    );
    await data(submitAdjustment(ctx.db, fx.accountant, a.id));
    const list = await listAdjustments(ctx.db);
    expect(list.map((row) => [row.code, row.status])).toEqual([
      [a.code, "PENDING_APPROVAL"],
      [b.code, "DRAFT"],
    ]);
    expect(await listAdjustments(ctx.db, { status: "DRAFT" })).toHaveLength(1);
  });
});

describe("opening TĐK", () => {
  const opening = (lines: AdjustmentBody["lines"]): AdjustmentBody => ({
    kind: "OPENING",
    reason: "Số tồn khi bắt đầu dùng phần mềm",
    openingDate: "2026-09-30",
    lines,
  });

  it("averages two prices like a purchase", async () => {
    const draft = await data(
      createAdjustment(
        ctx.db,
        fx.accountant,
        opening([
          {
            lineType: "OPENING",
            itemId: fx.item("GG-K15"),
            condition: "GOOD",
            locationId: fx.place("BAI-01"),
            quantity: "600",
            unitCost: 165_000,
          },
          {
            lineType: "OPENING",
            itemId: fx.item("GG-K15"),
            condition: "GOOD",
            locationId: fx.place("XUONG-01"),
            quantity: "260",
            unitCost: 172_000,
          },
        ]),
        TODAY,
      ),
    );
    expect(draft.code).toBe("TĐK-2026-001");
    await data(submitAdjustment(ctx.db, fx.accountant, draft.id));
    const done = await data(
      approveAdjustment(ctx.db, fx.director, draft.id, TODAY),
    );
    expect(done.posted.map((p) => p.movement)).toEqual(["OPENING", "OPENING"]);
    expect(await avg("GG-K15", "GOOD")).toBe(167_116);
    const [line] = await ctx.db
      .select({ date: inventoryLedger.businessDate })
      .from(inventoryLedger)
      .where(eq(inventoryLedger.documentId, draft.id));
    expect(line?.date).toBe("2026-09-30");
  });

  it("is refused once the pair has another movement", async () => {
    await open([["GG-K17", "GOOD", "BAI-01", 10, 195_000]]);
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "TEST",
          documentId: null,
          documentCode: "PX",
          businessDate: day("2026-10-03"),
          lines: [
            {
              itemId: fx.item("GG-K17"),
              condition: "GOOD",
              locationId: fx.place("BAI-01"),
              movement: "DELIVERY_OUT",
              quantityMilli: -5000,
              description: "x",
            },
            {
              itemId: fx.item("GG-K17"),
              condition: "GOOD",
              locationId: fx.place("anPhu"),
              movement: "DELIVERY_IN",
              quantityMilli: 5000,
              pairedWith: 0,
              description: "x",
            },
          ],
        },
        TODAY,
      ),
    );
    expect(
      await createAdjustment(
        ctx.db,
        fx.accountant,
        opening([
          {
            lineType: "OPENING",
            itemId: fx.item("GG-K17"),
            condition: "GOOD",
            locationId: fx.place("BAI-01"),
            quantity: "5",
            unitCost: 1,
          },
        ]),
        TODAY,
      ),
    ).toEqual({
      ok: false,
      status: 409,
      error: "GG-K17 Tốt đã có biến động, dùng phiếu điều chỉnh",
    });
  });

  it("checks quantity, date and line kinds", async () => {
    const line = {
      lineType: "OPENING",
      itemId: fx.item("GG-CH"),
      condition: "NEW",
      locationId: fx.place("BAI-01"),
      quantity: "0",
      unitCost: 31_000,
    };
    expect(
      await createAdjustment(ctx.db, fx.accountant, opening([line]), TODAY),
    ).toEqual({
      ok: false,
      status: 400,
      error: "Số lượng tồn đầu phải lớn hơn 0",
    });
    expect(
      await createAdjustment(
        ctx.db,
        fx.accountant,
        { ...opening([{ ...line, quantity: "5" }]), openingDate: "2026-10-28" },
        TODAY,
      ),
    ).toEqual({
      ok: false,
      status: 400,
      error: "Ngày tồn đầu không được sau hôm nay",
    });
    expect(
      await createAdjustment(
        ctx.db,
        fx.accountant,
        { ...opening([{ ...line, quantity: "2.5" }]) },
        TODAY,
      ),
    ).toEqual({
      ok: false,
      status: 400,
      error: "Số lượng cái phải là số nguyên",
    });
  });
});

// Value adjustments ĐCG (stock-value-adjustment tasks 1.3, 4.1–4.4).
import { and, count, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import {
  goodsReceipt,
  inventoryCost,
  inventoryLedger,
  stockAdjustment,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import { updateItem } from "@/lib/catalog/items";
import { postReceipt } from "@/lib/receiving/post";
import { activityRows } from "@/test/activity";
import { createTestContext, type TestUser } from "@/test/auth";
import { setupInventoryFixture } from "@/test/inventory";
import {
  OCT_26,
  orderLineIds,
  placedOrder,
  setupReceivingFixture,
  tripOne,
} from "@/test/receiving";

import {
  approveAdjustment,
  createAdjustment,
  returnAdjustment,
  submitAdjustment,
  updateAdjustment,
  type AdjustmentBody,
} from "./adjustments";
import { postMovements } from "./post";
import { reconcileInventory } from "./reconcile";
import { receiptOptions, revaluePreview } from "./revaluations";
import { createTripAdjustment, updateTripAdjustment } from "./trip-adjustments";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});
afterEach(async () => {
  expect(await reconcileInventory(ctx.db)).toEqual([]);
});

const TODAY = "2026-10-27" as BusinessDate;

async function data<T>(
  result: Promise<{ ok: boolean; data?: T; error?: string }>,
): Promise<T> {
  const value = await result;
  if (!value.ok) throw new Error(value.error);
  return value.data as T;
}

async function error(
  result: Promise<{ ok: boolean; error?: string; status?: number }>,
) {
  const value = await result;
  if (value.ok) throw new Error("expected a refusal");
  return value.error;
}

interface Ids {
  director: TestUser;
  accountant: TestUser;
  item: (code: string) => string;
}
let ids: Ids;

async function avg(code: string, condition: Condition) {
  const [row] = await ctx.db
    .select({ avg: inventoryCost.avgCost, pool: inventoryCost.poolQuantity })
    .from(inventoryCost)
    .where(
      and(
        eq(inventoryCost.itemId, ids.item(code)),
        eq(inventoryCost.condition, condition),
      ),
    );
  return row?.avg;
}

const revalueLines = async (documentId: string) =>
  ctx.db
    .select()
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.documentId, documentId),
        eq(inventoryLedger.movement, "REVALUE"),
      ),
    );

describe("value adjustment typed by hand", () => {
  let place: (key: string) => string;

  async function post(
    code: string,
    date: string,
    lines: [string, Condition, string, number, number | null][],
    movement: "OPENING" | "PURCHASE_IN" | "SALE_OUT" = "OPENING",
  ) {
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        ids.director,
        {
          documentType: "TEST",
          documentId: null,
          documentCode: code,
          businessDate: date as BusinessDate,
          lines: lines.map(([item, condition, where, pieces, amount]) => ({
            itemId: ids.item(item),
            condition,
            locationId: place(where),
            movement,
            quantityMilli: pieces * 1000,
            ...(amount === null ? {} : { amount }),
            description: code,
          })),
        },
        TODAY,
      ),
    );
  }

  beforeEach(async () => {
    const fx = await setupInventoryFixture(ctx);
    ids = fx;
    place = fx.place;
    await post("TĐK-2026-001", "2026-10-01", [
      ["GG-K17", "GOOD", "BAI-01", 1240, 1240 * 195_282],
      ["GG-K17", "SCRAP", "BAI-01", 42, 42 * 160_000],
      ["GG-M16", "GOOD", "BAI-01", 12, 12 * 152_000],
      ["PK-KU", "NEW", "BAI-01", 10, 10 * 52_000],
    ]);
    await post(
      "PX-2026-001",
      "2026-10-02",
      [["PK-KU", "NEW", "BAI-01", -10, null]],
      "SALE_OUT",
    );
  });

  const body = (
    lines: [string, Condition, number][],
    related: string | null = "TĐK-2026-001",
  ): AdjustmentBody => ({
    kind: "REVALUE",
    reason: "Tồn đầu kỳ ghi nhầm đơn giá",
    relatedDocumentCode: related,
    lines: lines.map(([code, condition, valueDelta]) => ({
      itemId: ids.item(code),
      condition,
      valueDelta,
    })),
  });

  it("posts nothing until approved, then one REVALUE line", async () => {
    const draft = await data(
      createAdjustment(
        ctx.db,
        ids.accountant,
        body([["GG-K17", "GOOD", -1_500_000]]),
        TODAY,
      ),
    );
    expect(draft).toMatchObject({
      code: "ĐCG-2026-001",
      kind: "REVALUE",
      status: "DRAFT",
    });
    expect(draft.lines[0]).toMatchObject({
      lineType: "VALUE",
      locationId: null,
      valueDelta: -1_500_000,
      preview: {
        poolMilli: 1_240_000,
        avgCost: 195_282,
        value: 242_149_680,
        newAvg: 194_072,
        error: null,
      },
    });
    await data(submitAdjustment(ctx.db, ids.accountant, draft.id));
    expect(await revalueLines(draft.id)).toHaveLength(0);
    expect(await avg("GG-K17", "GOOD")).toBe(195_282);

    const done = await data(
      approveAdjustment(ctx.db, ids.director, draft.id, TODAY),
    );
    expect(done.status).toBe("DONE");
    expect(done.posted).toEqual([
      expect.objectContaining({
        movement: "REVALUE",
        locationCode: null,
        quantity: 0,
        amount: -1_500_000,
        avgBefore: 195_282,
        avgAfter: 194_072,
      }),
    ]);
    const [line] = await revalueLines(draft.id);
    expect(line).toMatchObject({
      businessDate: "2026-10-27",
      documentCode: "ĐCG-2026-001",
      description: "Giảm giá trị 1.500.000 ₫ · sửa TĐK-2026-001",
    });
    expect(await avg("GG-K17", "GOOD")).toBe(194_072);
    const log = await activityRows(ctx.db, "ĐCG-2026-001");
    expect(log.map((row) => row.action)).toEqual([
      "CREATE",
      "SUBMIT",
      "APPROVE",
    ]);
    expect(log[2]?.summary).toBe(
      "Sửa TĐK-2026-001 · ghi sổ 1 dòng điều chỉnh giá · −1.500.000 ₫",
    );
  });

  it("wants a source document that holds each item and condition", async () => {
    expect(
      await error(
        createAdjustment(
          ctx.db,
          ids.accountant,
          body([["GG-K17", "GOOD", 1]], null),
          TODAY,
        ),
      ),
    ).toBe("Nhập mã chứng từ bị sửa");
    expect(
      await error(
        createAdjustment(
          ctx.db,
          ids.accountant,
          body([["GG-K17", "GOOD", 1]], "PN-2026-999"),
          TODAY,
        ),
      ),
    ).toBe("Không tìm thấy chứng từ PN-2026-999 trong sổ kho");
    expect(
      await error(
        createAdjustment(
          ctx.db,
          ids.accountant,
          body([["GG-K15", "GOOD", 1]]),
          TODAY,
        ),
      ),
    ).toBe("TĐK-2026-001 không có dòng sổ của GG-K15 Tốt");
    expect(
      await error(
        createAdjustment(
          ctx.db,
          ids.accountant,
          { ...body([["GG-K17", "GOOD", 1]]), reason: "   " },
          TODAY,
        ),
      ),
    ).toBe("Nhập lý do điều chỉnh");
    expect(
      await error(
        createAdjustment(
          ctx.db,
          ids.accountant,
          body([
            ["GG-K17", "GOOD", 1],
            ["GG-K17", "GOOD", 2],
          ]),
          TODAY,
        ),
      ),
    ).toBe("GG-K17 Tốt đã có trên phiếu");
  });

  it("refuses a sold-out pair and a value below zero when saving", async () => {
    expect(
      await error(
        createAdjustment(
          ctx.db,
          ids.accountant,
          body([["PK-KU", "NEW", 300_000]]),
          TODAY,
        ),
      ),
    ).toBe("PK-KU Mới đã hết hàng, không điều chỉnh giá trị được");
    expect(
      await error(
        createAdjustment(
          ctx.db,
          ids.accountant,
          body([["GG-K17", "SCRAP", -7_000_000]]),
          TODAY,
        ),
      ),
    ).toBe("Giá trị sau điều chỉnh của GG-K17 Phế liệu bị âm (−280.000 ₫)");
  });

  it("prices at approval when stock changed, and refuses once sold out", async () => {
    const k17 = await data(
      createAdjustment(
        ctx.db,
        ids.accountant,
        body([["GG-K17", "GOOD", -1_500_000]]),
        TODAY,
      ),
    );
    const m16 = await data(
      createAdjustment(
        ctx.db,
        ids.accountant,
        body([["GG-M16", "GOOD", 300_000]]),
        TODAY,
      ),
    );
    await data(submitAdjustment(ctx.db, ids.accountant, k17.id));
    await data(submitAdjustment(ctx.db, ids.accountant, m16.id));
    // 160 more at 195.300 ₫ before approval: the pool is 1.400 cái.
    await post(
      "PN-2026-001",
      "2026-10-20",
      [["GG-K17", "GOOD", "BAI-01", 160, 160 * 195_300]],
      "PURCHASE_IN",
    );
    const before = (await avg("GG-K17", "GOOD")) ?? 0;
    await data(approveAdjustment(ctx.db, ids.director, k17.id, TODAY));
    expect(await avg("GG-K17", "GOOD")).toBe(
      Math.floor((1400 * before - 1_500_000) / 1400 + 0.5),
    );

    await post(
      "PX-2026-002",
      "2026-10-21",
      [["GG-M16", "GOOD", "BAI-01", -12, null]],
      "SALE_OUT",
    );
    expect(
      await error(approveAdjustment(ctx.db, ids.director, m16.id, TODAY)),
    ).toBe("GG-M16 Tốt đã hết hàng, không điều chỉnh giá trị được");
    const [row] = await ctx.db
      .select({ status: stockAdjustment.status })
      .from(stockAdjustment)
      .where(eq(stockAdjustment.id, m16.id));
    expect(row?.status).toBe("PENDING_APPROVAL");
    expect(await revalueLines(m16.id)).toHaveLength(0);
  });

  it("posts once when approved twice at the same time", async () => {
    const draft = await data(
      createAdjustment(
        ctx.db,
        ids.accountant,
        body([["GG-K17", "GOOD", -1_500_000]]),
        TODAY,
      ),
    );
    await data(submitAdjustment(ctx.db, ids.accountant, draft.id));
    const results = await Promise.all([
      approveAdjustment(ctx.db, ids.director, draft.id, TODAY),
      approveAdjustment(other.db, ids.director, draft.id, TODAY),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({
      status: 409,
      error: "Phiếu đã được ghi sổ",
    });
    expect(await revalueLines(draft.id)).toHaveLength(1);
    expect(await avg("GG-K17", "GOOD")).toBe(194_072);
  });

  it("goes back to draft with a reason, and refuses a stale edit", async () => {
    const draft = await data(
      createAdjustment(
        ctx.db,
        ids.accountant,
        body([["GG-K17", "GOOD", -1_500_000]]),
        TODAY,
      ),
    );
    await data(submitAdjustment(ctx.db, ids.accountant, draft.id));
    const back = await data(
      returnAdjustment(
        ctx.db,
        ids.director,
        draft.id,
        "Đính kèm hóa đơn nhà xe",
      ),
    );
    expect(back).toMatchObject({
      status: "DRAFT",
      returnedReason: "Đính kèm hóa đơn nhà xe",
    });
    expect(
      await error(
        updateAdjustment(
          ctx.db,
          ids.accountant,
          draft.id,
          {
            ...body([["GG-K17", "GOOD", -1_400_000]]),
            updatedAt: draft.updatedAt.toISOString(),
          },
          TODAY,
        ),
      ),
    ).toBe("Phiếu vừa được người khác sửa, tải lại rồi làm lại");
    const edited = await data(
      updateAdjustment(
        ctx.db,
        ids.accountant,
        draft.id,
        {
          ...body([["GG-K17", "GOOD", -1_400_000]]),
          updatedAt: back.updatedAt.toISOString(),
        },
        TODAY,
      ),
    );
    expect(edited.lines[0]?.valueDelta).toBe(-1_400_000);
    const [update] = (await activityRows(ctx.db, "ĐCG-2026-001")).filter(
      (row) => row.action === "UPDATE",
    );
    expect(update?.changes).toEqual([
      expect.objectContaining({
        label: "Chênh lệch giá trị GG-K17 Tốt",
        before: "−1.500.000 ₫",
        after: "−1.400.000 ₫",
      }),
    ]);
  });

  it("previews nothing for an unknown item", async () => {
    expect(
      await revaluePreview(ctx.db, {
        itemId: crypto.randomUUID(),
        condition: "GOOD",
        valueDelta: 1,
      }),
    ).toBeNull();
  });

  it("previews the new average for the form", async () => {
    expect(
      await revaluePreview(ctx.db, {
        itemId: ids.item("GG-K17"),
        condition: "GOOD",
        valueDelta: -1_500_000,
      }),
    ).toEqual({
      poolMilli: 1_240_000,
      avgCost: 195_282,
      value: 242_149_680,
      newAvg: 194_072,
      error: null,
    });
    expect(
      await revaluePreview(ctx.db, {
        itemId: ids.item("PK-KU"),
        condition: "NEW",
        valueDelta: 1,
      }),
    ).toMatchObject({
      newAvg: null,
      error: "PK-KU Mới đã hết hàng, không điều chỉnh giá trị được",
    });
  });
});

describe("trip-cost fix of a goods receipt", () => {
  let receiptId = "";
  let receiptCode = "";

  beforeEach(async () => {
    const fx = await setupReceivingFixture(ctx);
    ids = fx;
    const order = await placedOrder(ctx, fx);
    const lines = await orderLineIds(ctx, order);
    const posted = await postReceipt(
      ctx.db,
      fx.warehouse,
      tripOne(order, lines),
      { now: OCT_26 },
    );
    if (!posted.ok) throw new Error(posted.error);
    receiptCode = posted.data.code;
    const [row] = await ctx.db
      .select({ id: goodsReceipt.id })
      .from(goodsReceipt)
      .where(eq(goodsReceipt.code, receiptCode));
    receiptId = row?.id ?? "";
  });

  const fix = (correctedTripCost: number) => ({
    receiptId,
    correctedTripCost,
    reason: "Nhập nhầm cước xe: 3.500.000 ₫ thành 35.000.000 ₫ thì ngược lại",
  });

  it("re-splits the trip cost as the receipt did and posts it", async () => {
    const draft = await data(
      createTripAdjustment(ctx.db, ids.accountant, fix(488_000), TODAY),
    );
    expect(draft).toMatchObject({
      kind: "REVALUE",
      relatedDocumentCode: receiptCode,
      sourceReceiptCode: receiptCode,
      recordedTripCost: 4_880_000,
      correctedTripCost: 488_000,
    });
    const total = draft.lines.reduce((s, l) => s + (l.valueDelta ?? 0), 0);
    expect(total).toBe(488_000 - 4_880_000);
    // Scrap of the Khung lot keeps kg × scrap price; the PL-SAT lot is all
    // scrap and takes its whole line, so it moves.
    const k17 = ids.item("GG-K17");
    expect(
      draft.lines.find((l) => l.itemId === k17 && l.condition === "SCRAP"),
    ).toBeUndefined();
    await data(submitAdjustment(ctx.db, ids.accountant, draft.id));
    const done = await data(
      approveAdjustment(ctx.db, ids.director, draft.id, TODAY),
    );
    expect(done.posted).toHaveLength(draft.lines.length);

    // A second fix starts from 488.000 ₫.
    const again = await data(
      createTripAdjustment(ctx.db, ids.accountant, fix(500_000), TODAY),
    );
    expect(again.recordedTripCost).toBe(488_000);
    expect(again.lines.reduce((s, l) => s + (l.valueDelta ?? 0), 0)).toBe(
      12_000,
    );
  });

  it("allows one open fix per receipt, also at the database", async () => {
    const first = await data(
      createTripAdjustment(ctx.db, ids.accountant, fix(488_000), TODAY),
    );
    expect(
      await error(
        createTripAdjustment(ctx.db, ids.accountant, fix(500_000), TODAY),
      ),
    ).toBe(
      `${receiptCode} đã có phiếu điều chỉnh giá ${first.code} chưa ghi sổ`,
    );
    const [{ n } = { n: 0 }] = await ctx.db
      .select({ n: count() })
      .from(stockAdjustment);
    expect(n).toBe(1);
    await expect(
      ctx.db.insert(stockAdjustment).values({
        code: "ĐCG-2026-099",
        kind: "REVALUE",
        reason: "test",
        relatedDocumentCode: receiptCode,
        sourceReceiptId: receiptId,
        recordedTripCost: 4_880_000,
        correctedTripCost: 1,
        createdBy: ids.accountant.id,
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("lists receipts with the trip cost the ledger holds now", async () => {
    expect(await receiptOptions(ctx.db)).toEqual([
      expect.objectContaining({
        id: receiptId,
        code: receiptCode,
        businessDate: "2026-10-26",
        recordedCost: 4_880_000,
      }),
    ]);
    const draft = await data(
      createTripAdjustment(ctx.db, ids.accountant, fix(488_000), TODAY),
    );
    await data(submitAdjustment(ctx.db, ids.accountant, draft.id));
    await data(approveAdjustment(ctx.db, ids.director, draft.id, TODAY));
    expect((await receiptOptions(ctx.db))[0]?.recordedCost).toBe(488_000);
  });

  it("answers 404 for an unknown receipt", async () => {
    expect(
      await createTripAdjustment(
        ctx.db,
        ids.accountant,
        { ...fix(1), receiptId: crypto.randomUUID() },
        TODAY,
      ),
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      await createTripAdjustment(
        ctx.db,
        ids.accountant,
        { ...fix(1), receiptId: "x" },
        TODAY,
      ),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("keeps one open fix when two are saved at the same time", async () => {
    const results = await Promise.all([
      createTripAdjustment(ctx.db, ids.accountant, fix(488_000), TODAY),
      createTripAdjustment(other.db, ids.accountant, fix(500_000), TODAY),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({
      status: 409,
      error: expect.stringMatching(
        new RegExp(
          `^${receiptCode} đã có phiếu điều chỉnh giá .+ chưa ghi sổ$`,
        ),
      ),
    });
    const [{ n } = { n: 0 }] = await ctx.db
      .select({ n: count() })
      .from(stockAdjustment);
    expect(n).toBe(1);
  });

  it("refuses an unchanged cost and hand-edited lines", async () => {
    expect(
      await error(
        createTripAdjustment(ctx.db, ids.accountant, fix(4_880_000), TODAY),
      ),
    ).toBe("Chi phí chuyến không đổi, không có gì để điều chỉnh");
    const draft = await data(
      createTripAdjustment(ctx.db, ids.accountant, fix(488_000), TODAY),
    );
    expect(
      await error(
        updateAdjustment(ctx.db, ids.accountant, draft.id, {
          kind: "REVALUE",
          reason: "x",
          relatedDocumentCode: receiptCode,
          lines: [],
        }),
      ),
    ).toBe(
      "Phiếu sửa chi phí chuyến chỉ đổi được chi phí chuyến đúng và lý do",
    );
    const rebuilt = await data(
      updateTripAdjustment(ctx.db, ids.accountant, draft.id, fix(500_000)),
    );
    expect(rebuilt.correctedTripCost).toBe(500_000);
    expect(rebuilt.lines.reduce((s, l) => s + (l.valueDelta ?? 0), 0)).toBe(
      500_000 - 4_880_000,
    );
  });

  it("asks for lines by hand once the standard weight changed", async () => {
    const draft = await data(
      createTripAdjustment(ctx.db, ids.accountant, fix(488_000), TODAY),
    );
    await data(submitAdjustment(ctx.db, ids.accountant, draft.id));
    const changed = await updateItem(ctx.db, ids.director, ids.item("GG-K17"), {
      standardWeightKg: "14",
    });
    expect(changed.ok).toBe(true);
    const message = `Không dựng lại được cách chia của ${receiptCode}, lập dòng tay`;
    expect(
      await error(approveAdjustment(ctx.db, ids.director, draft.id, TODAY)),
    ).toBe(message);
    expect(await revalueLines(draft.id)).toHaveLength(0);
    expect(
      await error(
        createTripAdjustment(
          ctx.db,
          ids.accountant,
          { ...fix(500_000), receiptId },
          TODAY,
        ),
      ),
    ).toBe(
      `${receiptCode} đã có phiếu điều chỉnh giá ${draft.code} chưa ghi sổ`,
    );
  });
});

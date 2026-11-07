// Repair work orders end to end (repair-work-orders tasks 4.1–4.7): the
// office, workshop and storekeeper steps, posting with labour and supplies,
// refusals that roll back, stale writes and late phone resends.
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  inventoryLedger,
  item,
  repairOrder,
  repairOrderLine,
  repairOrderMaterial,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import { createGroup } from "@/lib/catalog/item-groups";
import { createItem, setRepairLaborRate } from "@/lib/catalog/items";
import { postMovements } from "@/lib/inventory/post";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { setScrapPrice } from "@/lib/receiving/scrap-price";
import { activityTrail, lastActivity } from "@/test/activity";
import { createTestContext, createTestUser, type TestUser } from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import {
  countWorkOrder,
  receiveWorkOrder,
  reportWorkOrder,
} from "./work-floor";
import {
  assignWorkOrder,
  cancelWorkOrder,
  createWorkOrder,
  deleteWorkOrder,
  recallWorkOrder,
  returnWorkOrder,
  updateWorkOrder,
  type WorkOrderBody,
} from "./work-orders";
import { postWorkOrder } from "./work-post";

const ctx = createTestContext();
afterAll(ctx.close);

const K = 1000;
const OCT_20 = "2026-10-20" as BusinessDate;
const NOV_03 = "2026-11-03" as BusinessDate;
const NOV_06 = "2026-11-06" as BusinessDate;
const NOV_07 = "2026-11-07" as BusinessDate;

let fx: InventoryFixture;
let workshopUser: TestUser;
let warehouse: TestUser;
const supply = new Map<string, string>();

async function opening(
  lines: [string, Condition, number, number, string][],
): Promise<void> {
  await ctx.db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "OPENING",
        documentId: null,
        documentCode: "TĐK-2026-001",
        businessDate: OCT_20,
        lines: lines.map(([itemId, condition, quantity, unitCost, place]) => ({
          itemId,
          condition,
          locationId: fx.place(place),
          movement: "OPENING" as const,
          quantityMilli: quantity * K,
          amount: Math.round(quantity * unitCost),
          description: "Tồn đầu kỳ",
        })),
      },
      OCT_20,
    ),
  );
}

async function supplyItem(
  code: string,
  name: string,
  unit: "KG" | "LITER" | "PIECE",
  weight: string | null,
  groupId: string,
) {
  const made = await createItem(ctx.db, fx.director, {
    groupId,
    code,
    name,
    unit,
    standardWeightKg: weight,
  });
  if (!made.ok) throw new Error(made.error);
  supply.set(code, made.data.id);
}

beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
  workshopUser = await createTestUser(ctx, {
    role: "WORKSHOP",
    username: "hoangnam",
  });
  warehouse = await createTestUser(ctx, {
    role: "WAREHOUSE",
    username: "vantung",
  });
  const group = await createGroup(ctx.db, fx.director, {
    name: "Vật tư phụ",
    category: "MATERIAL",
  });
  if (!group.ok) throw new Error(group.error);
  supply.clear();
  await supplyItem("VT-QH", "Que hàn", "KG", null, group.data.id);
  await supplyItem("VT-SON", "Sơn chống gỉ", "LITER", "1.3", group.data.id);
  await supplyItem("VT-BL12", "Bu lông M12", "PIECE", "0.1", group.data.id);
  await opening([
    [fx.item("GG-K17"), "NEEDS_REPAIR", 201, 160_000, "BAI-01"],
    [fx.item("GG-K17"), "GOOD", 920, 195_861, "BAI-01"],
    [fx.item("GG-K17"), "SCRAP", 42, 150_000, "BAI-01"],
    [fx.item("GG-CH"), "NEEDS_REPAIR", 63, 30_000, "BAI-01"],
    [fx.item("GG-CH"), "GOOD", 2_000, 38_500, "BAI-01"],
    [supply.get("VT-QH") ?? "", "NEW", 18, 45_000, "XUONG-01"],
    [supply.get("VT-SON") ?? "", "NEW", 12, 90_000, "XUONG-01"],
    [supply.get("VT-BL12") ?? "", "NEW", 20, 2_500, "XUONG-01"],
    [supply.get("VT-BL12") ?? "", "GOOD", 100, 2_000, "XUONG-01"],
  ]);
  for (const [code, rate] of [
    ["GG-K17", 40_000],
    ["GG-CH", 10_000],
  ] as const) {
    const set = await setRepairLaborRate(
      ctx.db,
      fx.director,
      fx.item(code),
      rate,
    );
    if (!set.ok) throw new Error(set.error);
  }
  const price = await setScrapPrice(ctx.db, fx.director, { pricePerKg: 7_500 });
  if (!price.ok) throw new Error(price.error);
});

const body = (
  lines: [string, number][] = [
    ["GG-K17", 40],
    ["GG-CH", 20],
  ],
  extra: Partial<WorkOrderBody> = {},
): WorkOrderBody => ({
  workshopId: fx.place("XUONG-01"),
  fromLocationId: fx.place("BAI-01"),
  repairedBy: "Tổ anh Lực",
  lines: lines.map(([code, taken]) => ({
    itemId: fx.item(code),
    quantityTaken: String(taken),
  })),
  ...extra,
});

async function orderRow(code: string) {
  const [row] = await ctx.db
    .select()
    .from(repairOrder)
    .where(eq(repairOrder.code, code));
  if (!row) throw new Error(`no order ${code}`);
  return row;
}

const fresh = async (code: string) => ({
  updatedAt: (await orderRow(code)).updatedAt.toISOString(),
});

async function must<T>(
  result: Promise<
    { ok: true; data: T } | { ok: false; error: string; status: number }
  >,
): Promise<T> {
  const done = await result;
  if (!done.ok) throw new Error(`${done.status} ${done.error}`);
  return done.data;
}

async function created(
  lines?: [string, number][],
  extra?: Partial<WorkOrderBody>,
) {
  return (
    await must(
      createWorkOrder(ctx.db, fx.accountant, body(lines, extra), NOV_03),
    )
  ).code;
}

async function assigned(
  lines?: [string, number][],
  extra?: Partial<WorkOrderBody>,
) {
  const code = await created(lines, extra);
  await must(assignWorkOrder(ctx.db, fx.accountant, code, await fresh(code)));
  return code;
}

async function received(
  lines?: [string, number][],
  extra?: Partial<WorkOrderBody>,
) {
  const code = await assigned(lines, extra);
  await must(
    receiveWorkOrder(
      ctx.db,
      workshopUser,
      code,
      { draftId: crypto.randomUUID(), ...(await fresh(code)) },
      NOV_03,
    ),
  );
  return code;
}

const D12_REPORT = () => [
  {
    itemId: fx.item("GG-K17"),
    good: "36",
    scrap: "4",
    materials: [
      { itemId: supply.get("VT-QH"), quantity: "6" },
      { itemId: supply.get("VT-SON"), quantity: "3" },
    ],
  },
  {
    itemId: fx.item("GG-CH"),
    good: "20",
    scrap: "0",
    materials: [{ itemId: supply.get("VT-SON"), quantity: "0.5" }],
  },
];

async function reported(
  code: string,
  lines = D12_REPORT(),
  draftId = crypto.randomUUID(),
) {
  return must(
    reportWorkOrder(
      ctx.db,
      workshopUser,
      code,
      { draftId, ...(await fresh(code)), lines },
      NOV_06,
    ),
  );
}

async function counted(code: string, lines = D12_REPORT()) {
  return must(
    countWorkOrder(ctx.db, warehouse, code, {
      draftId: crypto.randomUUID(),
      ...(await fresh(code)),
      lines,
    }),
  );
}

async function stockAt(
  code: string,
  condition: Condition,
  place: string,
  itemId = fx.item(code),
) {
  const [row] = await ctx.db
    .select({
      total: sql<string>`coalesce(sum(${inventoryLedger.quantity}), 0)`,
      value: sql<string>`coalesce(sum(${inventoryLedger.amount}), 0)`,
    })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, itemId),
        eq(inventoryLedger.condition, condition),
        eq(inventoryLedger.locationId, fx.place(place)),
      ),
    );
  return Math.round(Number(row?.total ?? 0) * K);
}

const ledgerCount = async () =>
  Number(
    (await ctx.db.select({ n: sql<string>`count(*)` }).from(inventoryLedger))[0]
      ?.n ?? 0,
  );

describe("drafts and assigning (tasks 4.1, 4.2)", () => {
  it("creates a work order with the PSC code and no reported numbers", async () => {
    const code = await created();
    const order = await orderRow(code);
    expect(order).toMatchObject({ kind: "WORK_ORDER", status: "DRAFT" });
    expect(code).toMatch(/^PSC-2026-\d{3}$/);
  });

  it("refuses a yard as workshop and a site as source", async () => {
    const yard = await createWorkOrder(
      ctx.db,
      fx.accountant,
      body(undefined, { workshopId: fx.place("BAI-01") }),
      NOV_03,
    );
    expect(yard.ok ? "" : yard.error).toBe("Chọn một xưởng đang dùng");
    const site = await createWorkOrder(
      ctx.db,
      fx.accountant,
      body(undefined, { fromLocationId: fx.place("anPhu") }),
      NOV_03,
    );
    expect(site.ok ? "" : site.error).toBe(
      "Chỉ lấy hàng sửa tại bãi hoặc tại chính xưởng của lệnh",
    );
  });

  it("takes the labour rate on assignment; later catalog edits do not reach it", async () => {
    const code = await assigned();
    await must(
      setRepairLaborRate(ctx.db, fx.director, fx.item("GG-K17"), 45_000),
    );
    const lines = await ctx.db
      .select({ rate: repairOrderLine.laborRate })
      .from(repairOrderLine)
      .innerJoin(repairOrder, eq(repairOrder.id, repairOrderLine.orderId))
      .where(eq(repairOrder.code, code))
      .orderBy(repairOrderLine.position);
    expect(lines.map((line) => line.rate)).toEqual([40_000, 10_000]);
  });

  it("refuses to assign an item without a labour rate", async () => {
    await must(setRepairLaborRate(ctx.db, fx.director, fx.item("GG-CH"), null));
    const code = await created();
    const result = await assignWorkOrder(
      ctx.db,
      fx.accountant,
      code,
      await fresh(code),
    );
    expect(result.ok ? "" : result.error).toBe(
      "GG-CH chưa có đơn giá công sửa, đặt ở Danh mục (D9)",
    );
    expect((await orderRow(code)).status).toBe("DRAFT");
  });

  it("locks the lines once assigned, recalls, and deletes only drafts", async () => {
    const code = await assigned();
    const edit = await updateWorkOrder(ctx.db, fx.accountant, code, {
      ...body([["GG-K17", 45]]),
      ...(await fresh(code)),
    });
    expect(edit.ok ? "" : edit.error).toBe(
      "Lệnh đã giao xưởng, không sửa dòng được. Thu hồi lệnh để sửa",
    );
    const drop = await deleteWorkOrder(ctx.db, fx.accountant, code);
    expect(drop.ok ? "" : drop.error).toBe(
      "Lệnh đã giao xưởng, không xóa được. Hủy lệnh nếu không sửa nữa",
    );
    await must(recallWorkOrder(ctx.db, fx.accountant, code, await fresh(code)));
    expect((await orderRow(code)).status).toBe("DRAFT");
    await must(deleteWorkOrder(ctx.db, fx.accountant, code));
    expect(await activityTrail(ctx.db, code)).toEqual([
      `CREATE ${code}`,
      `ASSIGN ${code}`,
      `RECALL ${code}`,
      `DELETE_DRAFT ${code}`,
    ]);
  });

  it("answers 409 to a stale edit", async () => {
    const code = await created();
    const stale = await updateWorkOrder(ctx.db, fx.accountant, code, {
      ...body([["GG-K17", 30]]),
      updatedAt: new Date(0).toISOString(),
    });
    expect(stale).toMatchObject({ ok: false, status: 409 });
  });
});

describe("receiving (task 4.3)", () => {
  it("moves Chờ sửa from BAI-01 to XUONG-01 without changing value", async () => {
    const before = await reconcileInventory(ctx.db);
    const code = await received();
    expect(await stockAt("GG-K17", "NEEDS_REPAIR", "BAI-01")).toBe(161 * K);
    expect(await stockAt("GG-K17", "NEEDS_REPAIR", "XUONG-01")).toBe(40 * K);
    expect((await orderRow(code)).status).toBe("IN_PROGRESS");
    expect(await reconcileInventory(ctx.db)).toEqual(before);
    expect((await lastActivity(ctx.db, code))?.summary).toBe(
      "BAI-01 → XUONG-01 · 60 cái",
    );
  });

  it("refuses when the yard is short and writes nothing", async () => {
    const code = await assigned([["GG-K17", 300]]);
    const lines = await ledgerCount();
    const result = await receiveWorkOrder(
      ctx.db,
      workshopUser,
      code,
      { draftId: crypto.randomUUID(), ...(await fresh(code)) },
      NOV_03,
    );
    expect(result.ok ? "" : result.error).toBe(
      "Không đủ hàng: GG-K17 Chờ sửa tại BAI-01 còn 201 cái",
    );
    expect(await ledgerCount()).toBe(lines);
    expect((await orderRow(code)).status).toBe("ASSIGNED");
  });

  it("answers a resent receive with the same state and one set of lines", async () => {
    const code = await assigned();
    const draftId = crypto.randomUUID();
    const first = await must(
      receiveWorkOrder(
        ctx.db,
        workshopUser,
        code,
        { draftId, ...(await fresh(code)) },
        NOV_03,
      ),
    );
    const lines = await ledgerCount();
    const again = await must(
      receiveWorkOrder(
        ctx.db,
        workshopUser,
        code,
        { draftId, updatedAt: new Date(0).toISOString() },
        NOV_03,
      ),
    );
    expect(again.status).toBe(first.status);
    expect(await ledgerCount()).toBe(lines);
  });

  it("writes no line when the order takes stock at the workshop itself", async () => {
    await opening([
      [fx.item("GG-K17"), "NEEDS_REPAIR", 10, 160_000, "XUONG-01"],
    ]);
    const lines = await ledgerCount();
    const code = await received([["GG-K17", 10]], {
      fromLocationId: fx.place("XUONG-01"),
    });
    expect(await ledgerCount()).toBe(lines);
    expect((await orderRow(code)).status).toBe("IN_PROGRESS");
  });
});

describe("reporting, counting, returning (task 4.4)", () => {
  it("refuses a report whose numbers do not add up", async () => {
    const code = await received();
    const lines = D12_REPORT();
    lines[0] = { ...lines[0], good: "30" } as (typeof lines)[number];
    const result = await reportWorkOrder(ctx.db, workshopUser, code, {
      draftId: crypto.randomUUID(),
      ...(await fresh(code)),
      lines,
    });
    expect(result).toMatchObject({ ok: false, status: 422 });
    expect((await orderRow(code)).status).toBe("IN_PROGRESS");
  });

  it("keeps both numbers when the storekeeper counts differently", async () => {
    const code = await received();
    await reported(code);
    const lines = D12_REPORT();
    lines[0] = {
      ...lines[0],
      good: "35",
      scrap: "5",
    } as (typeof lines)[number];
    await counted(code, lines);
    const [k17] = await ctx.db
      .select()
      .from(repairOrderLine)
      .where(eq(repairOrderLine.itemId, fx.item("GG-K17")));
    expect(k17).toMatchObject({
      quantityGood: "35.000",
      quantityScrap: "5.000",
      reportedGood: "36.000",
      reportedScrap: "4.000",
    });
    expect((await lastActivity(ctx.db, code))?.summary).toContain(
      "GG-K17: xưởng báo 36 / 4, đếm 35 / 5",
    );
  });

  it("gives 409 to a count after the office returned the order", async () => {
    const code = await received();
    await reported(code);
    const seen = await fresh(code);
    await must(
      returnWorkOrder(ctx.db, fx.accountant, code, {
        ...seen,
        reason: "Que hàn ghi 60 kg, kiểm lại",
      }),
    );
    const late = await countWorkOrder(ctx.db, warehouse, code, {
      draftId: crypto.randomUUID(),
      ...seen,
      lines: D12_REPORT(),
    });
    expect(late).toMatchObject({ ok: false, status: 409 });
    expect((await orderRow(code)).status).toBe("IN_PROGRESS");
  });

  it("never lets a late first report overwrite the second (design D5)", async () => {
    const code = await received();
    const d1 = crypto.randomUUID();
    const first = D12_REPORT();
    first[0] = {
      ...first[0],
      good: "30",
      scrap: "10",
    } as (typeof first)[number];
    await reported(code, first, d1);
    await must(
      returnWorkOrder(ctx.db, fx.accountant, code, {
        ...(await fresh(code)),
        reason: "Đếm lại khung",
      }),
    );
    await reported(code, D12_REPORT(), crypto.randomUUID());
    const reports = (await activityTrail(ctx.db, code)).filter((row) =>
      row.startsWith("REPORT"),
    );
    const late = await must(
      reportWorkOrder(ctx.db, workshopUser, code, {
        draftId: d1,
        updatedAt: new Date(0).toISOString(),
        lines: first,
      }),
    );
    expect(late.status).toBe("AWAITING_CHECK");
    const [k17] = await ctx.db
      .select({ good: repairOrderLine.quantityGood })
      .from(repairOrderLine)
      .where(eq(repairOrderLine.itemId, fx.item("GG-K17")));
    expect(k17?.good).toBe("36.000");
    expect(
      (await activityTrail(ctx.db, code)).filter((row) =>
        row.startsWith("REPORT"),
      ),
    ).toEqual(reports);
  });

  it("needs a reason to return", async () => {
    const code = await received();
    await reported(code);
    const result = await returnWorkOrder(ctx.db, fx.accountant, code, {
      ...(await fresh(code)),
      reason: " ",
    });
    expect(result.ok ? "" : result.error).toBe("Ghi lý do trả lại");
  });
});

describe("posting (task 4.5)", () => {
  async function readyD12() {
    const code = await received();
    await reported(code);
    await counted(code);
    return code;
  }

  it("posts the D12 example: Good and Scrap back at BAI-01, supplies out at XUONG-01", async () => {
    const code = await readyD12();
    const before = await reconcileInventory(ctx.db);
    await must(
      postWorkOrder(ctx.db, fx.accountant, code, await fresh(code), NOV_07),
    );
    expect(await stockAt("GG-K17", "NEEDS_REPAIR", "XUONG-01")).toBe(0);
    expect(await stockAt("GG-K17", "NEEDS_REPAIR", "BAI-01")).toBe(161 * K);
    expect(await stockAt("GG-K17", "GOOD", "BAI-01")).toBe(956 * K);
    expect(await stockAt("GG-K17", "SCRAP", "BAI-01")).toBe(46 * K);
    expect(await stockAt("VT-QH", "NEW", "XUONG-01", supply.get("VT-QH"))).toBe(
      12 * K,
    );
    expect(
      await stockAt("VT-SON", "NEW", "XUONG-01", supply.get("VT-SON")),
    ).toBe(8_500);
    const order = await orderRow(code);
    const posting = await ctx.db
      .select({
        itemId: inventoryLedger.itemId,
        condition: inventoryLedger.condition,
        movement: inventoryLedger.movement,
        amount: inventoryLedger.amount,
        unitCost: inventoryLedger.unitCost,
      })
      .from(inventoryLedger)
      .where(eq(inventoryLedger.postingId, order.postingId ?? ""));
    const good = posting.find(
      (row) => row.itemId === fx.item("GG-K17") && row.condition === "GOOD",
    );
    expect(good).toMatchObject({ amount: 7_975_000, unitCost: 221_528 });
    const ch = posting.find(
      (row) => row.itemId === fx.item("GG-CH") && row.condition === "GOOD",
    );
    expect(ch).toMatchObject({ amount: 845_000, unitCost: 42_250 });
    expect(posting.reduce((sum, row) => sum + row.amount, 0)).toBe(1_640_000);
    const lines = await ctx.db
      .select({
        labor: repairOrderLine.laborAmount,
        material: repairOrderLine.materialAmount,
        cost: repairOrderLine.repairCost,
      })
      .from(repairOrderLine)
      .where(eq(repairOrderLine.orderId, order.id))
      .orderBy(repairOrderLine.position);
    expect(lines).toEqual([
      { labor: 1_440_000, material: 540_000, cost: 1_980_000 },
      { labor: 200_000, material: 45_000, cost: 245_000 },
    ]);
    const amounts = await ctx.db
      .select({ amount: repairOrderMaterial.amount })
      .from(repairOrderMaterial);
    expect(amounts.map((row) => row.amount).sort()).toEqual(
      [270_000, 270_000, 45_000].sort(),
    );
    expect(await reconcileInventory(ctx.db)).toEqual(before);
    expect((await lastActivity(ctx.db, code))?.summary).toBe(
      "56 cái về Tốt, 4 phế liệu · công 1.640.000 ₫, vật tư 585.000 ₫ · chi phí 2.225.000 ₫",
    );
  });

  it("refuses short supplies and writes nothing", async () => {
    const code = await received();
    const lines = D12_REPORT();
    lines[0] = {
      ...lines[0],
      materials: [{ itemId: supply.get("VT-QH"), quantity: "20" }],
    } as (typeof lines)[number];
    await reported(code, lines);
    await counted(code, lines);
    const count = await ledgerCount();
    const result = await postWorkOrder(
      ctx.db,
      fx.accountant,
      code,
      await fresh(code),
      NOV_07,
    );
    expect(result.ok ? "" : result.error).toBe(
      "Không đủ vật tư: VT-QH tại XUONG-01 còn 18 kg",
    );
    expect(await ledgerCount()).toBe(count);
    expect((await orderRow(code)).status).toBe("COUNTED");
  });

  it("issues New before Good (0.2 số 127)", async () => {
    const code = await received([["GG-K17", 40]]);
    const lines = [
      {
        itemId: fx.item("GG-K17"),
        good: "40",
        scrap: "0",
        materials: [{ itemId: supply.get("VT-BL12"), quantity: "30" }],
      },
    ];
    await reported(code, lines);
    await counted(code, lines);
    await must(
      postWorkOrder(ctx.db, fx.accountant, code, await fresh(code), NOV_07),
    );
    const [line] = await ctx.db
      .select({ material: repairOrderLine.materialAmount })
      .from(repairOrderLine)
      .innerJoin(repairOrder, eq(repairOrder.id, repairOrderLine.orderId))
      .where(eq(repairOrder.code, code));
    expect(line?.material).toBe(70_000);
  });

  it("refuses to post before the count and posts only once", async () => {
    const code = await received();
    await reported(code);
    const early = await postWorkOrder(
      ctx.db,
      fx.accountant,
      code,
      await fresh(code),
      NOV_07,
    );
    expect(early).toMatchObject({
      ok: false,
      status: 409,
      error: "Lệnh đang Chờ nghiệm thu, Thủ kho chưa đếm xong",
    });
    await counted(code);
    const seen = await fresh(code);
    await must(postWorkOrder(ctx.db, fx.accountant, code, seen, NOV_07));
    const twice = await postWorkOrder(
      ctx.db,
      fx.accountant,
      code,
      seen,
      NOV_07,
    );
    expect(twice).toMatchObject({
      ok: false,
      status: 409,
      error: "Lệnh đã được ghi sổ",
    });
  });

  it("keeps Good at the workshop when the stock was taken there", async () => {
    await opening([
      [fx.item("GG-K17"), "NEEDS_REPAIR", 10, 160_000, "XUONG-01"],
    ]);
    const code = await received([["GG-K17", 10]], {
      fromLocationId: fx.place("XUONG-01"),
    });
    const lines = [
      { itemId: fx.item("GG-K17"), good: "10", scrap: "0", materials: [] },
    ];
    await reported(code, lines);
    await counted(code, lines);
    await must(
      postWorkOrder(ctx.db, fx.accountant, code, await fresh(code), NOV_07),
    );
    expect(await stockAt("GG-K17", "GOOD", "XUONG-01")).toBe(10 * K);
  });
});

describe("cancelling (task 4.6)", () => {
  it("sends received stock back to the yard", async () => {
    const code = await received();
    await must(
      cancelWorkOrder(
        ctx.db,
        fx.accountant,
        code,
        { ...(await fresh(code)), reason: "Bán nguyên lô phế" },
        NOV_06,
      ),
    );
    expect(await stockAt("GG-K17", "NEEDS_REPAIR", "BAI-01")).toBe(201 * K);
    expect(await stockAt("GG-K17", "NEEDS_REPAIR", "XUONG-01")).toBe(0);
    expect((await orderRow(code)).status).toBe("CANCELLED");
  });

  it("cancels a draft without touching the ledger", async () => {
    const code = await created();
    const lines = await ledgerCount();
    await must(
      cancelWorkOrder(ctx.db, fx.accountant, code, {
        ...(await fresh(code)),
        reason: "Lập nhầm",
      }),
    );
    expect(await ledgerCount()).toBe(lines);
  });

  it("refuses when the workshop no longer holds the stock", async () => {
    const code = await received();
    // A stocktake took 5 of them at the workshop.
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "ADJUSTMENT",
          documentId: null,
          documentCode: "ĐC-2026-001",
          businessDate: NOV_06,
          lines: [
            {
              itemId: fx.item("GG-K17"),
              condition: "NEEDS_REPAIR",
              locationId: fx.place("XUONG-01"),
              movement: "ADJUST_OUT",
              quantityMilli: -5 * K,
              description: "Kiểm kê thiếu",
            },
          ],
        },
        NOV_06,
      ),
    );
    const result = await cancelWorkOrder(
      ctx.db,
      fx.accountant,
      code,
      { ...(await fresh(code)), reason: "Bán nguyên lô phế" },
      NOV_06,
    );
    expect(result.ok ? "" : result.error).toBe(
      "Không đủ hàng: GG-K17 Chờ sửa tại XUONG-01 còn 35 cái",
    );
    expect((await orderRow(code)).status).toBe("IN_PROGRESS");
  });
});

it("keeps item rows the tests changed coherent", async () => {
  const [k17] = await ctx.db
    .select({ rate: item.repairLaborRate })
    .from(item)
    .where(eq(item.id, fx.item("GG-K17")));
  expect(k17?.rate).toBe(40_000);
});

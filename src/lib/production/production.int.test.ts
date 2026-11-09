// Production orders end to end (production-orders tasks 3.1–3.10): BOMs, the
// office, workshop, storekeeper and director steps, posting and D15.
import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  inventoryCost,
  inventoryLedger,
  productionOrder,
  productionOrderLine,
  productionOrderMaterial,
} from "@/db/schema";
import {
  ledgerCostCheck,
  monthlyProfit,
  sumMonths,
} from "@/domain/gross-profit";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import { createGroup } from "@/lib/catalog/item-groups";
import { createItem } from "@/lib/catalog/items";
import { postMovements } from "@/lib/inventory/post";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { setScrapPrice } from "@/lib/receiving/scrap-price";
import { ledgerSums, productionSums, repairSums } from "@/lib/reports/costs";
import { activityRows, activityTrail, lastActivity } from "@/test/activity";
import { createTestContext, createTestUser, type TestUser } from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import { createBom, deleteBom, updateBom, type BomBody } from "./boms";
import {
  countProductionOrder,
  receiveProductionOrder,
  reportProductionOrder,
  type FloorLineBody,
} from "./floor";
import {
  approveProductionOrder,
  assignProductionOrder,
  cancelProductionOrder,
  createProductionOrder,
  deleteProductionOrder,
  recallProductionOrder,
  returnProductionOrder,
  updateProductionOrder,
  type ProductionOrderBody,
} from "./orders";
import { postProductionOrder } from "./post";
import { getProductionOrder } from "./queries";
import { setScrapItem } from "./settings";

const ctx = createTestContext();
afterAll(ctx.close);

const OCT_20 = "2026-10-20" as BusinessDate;
const NOV_09 = "2026-11-09" as BusinessDate;

let fx: InventoryFixture;
let workshop: TestUser;
let warehouse: TestUser;
const id = new Map<string, string>();
const item = (code: string) => id.get(code) ?? fx.item(code);

async function opening(
  lines: [string, Condition, number, number, string][],
  date: BusinessDate = OCT_20,
): Promise<void> {
  await ctx.db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "OPENING",
        documentId: null,
        documentCode: `TĐK-${randomUUID().slice(0, 6)}`,
        businessDate: date,
        lines: lines.map(([code, condition, quantity, unitCost, place]) => ({
          itemId: item(code),
          condition,
          locationId: fx.place(place),
          movement: "OPENING" as const,
          quantityMilli: Math.round(quantity * 1000),
          amount: Math.round(quantity * unitCost),
          description: "Tồn đầu kỳ",
        })),
      },
      date,
    ),
  );
}

function bomOf(rows: [string, string][], laborRate: number): BomBody {
  return {
    laborRate,
    materials: rows.map(([code, quantity]) => ({
      itemId: item(code),
      quantity,
    })),
  };
}

const khung = () =>
  bomOf(
    [
      ["VT-ONG42", "9.8"],
      ["VT-ONG27", "3.6"],
      ["VT-QH", "0.12"],
      ["VT-SON", "0.08"],
      ["VT-CHOT", "4"],
    ],
    35_000,
  );
const cheo = () =>
  bomOf(
    [
      ["VT-ONG27", "2.9"],
      ["VT-SON", "0.03"],
    ],
    8_000,
  );

function must<T>(
  result: { ok: true; data: T } | { ok: false; error: string },
): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

beforeEach(async () => {
  id.clear();
  fx = await setupInventoryFixture(ctx);
  workshop = await createTestUser(ctx, {
    role: "WORKSHOP",
    username: "hoangnam",
  });
  warehouse = await createTestUser(ctx, {
    role: "WAREHOUSE",
    username: "vantung",
  });
  const group = must(
    await createGroup(ctx.db, fx.director, {
      name: "Nguyên liệu sản xuất",
      category: "MATERIAL",
    }),
  );
  for (const [code, unit, weight] of [
    ["VT-ONG42", "KG", null],
    ["VT-ONG27", "KG", null],
    ["VT-QH", "KG", null],
    ["VT-SON", "LITER", "1.3"],
    ["VT-CHOT", "PIECE", "0.15"],
    ["VT-THANH", "BAR", "5"],
    ["PL-SATVUN", "KG", null],
  ] as const) {
    const made = must(
      await createItem(ctx.db, fx.director, {
        groupId: group.id,
        code,
        name: code,
        unit,
        standardWeightKg: weight,
      }),
    );
    id.set(code, made.id);
  }
  await opening([
    ["VT-ONG42", "NEW", 2000, 19_500, "XUONG-01"],
    ["VT-ONG27", "NEW", 2000, 19_000, "XUONG-01"],
    ["VT-QH", "NEW", 50, 45_000, "XUONG-01"],
    ["VT-SON", "NEW", 50, 90_000, "XUONG-01"],
    ["VT-CHOT", "NEW", 1000, 2_500, "XUONG-01"],
  ]);
  must(await createBom(ctx.db, fx.accountant, "GG-K17", khung()));
  must(await createBom(ctx.db, fx.accountant, "GG-CH", cheo()));
  must(await setScrapItem(ctx.db, fx.director, { itemId: item("PL-SATVUN") }));
  must(await setScrapPrice(ctx.db, fx.director, { pricePerKg: 7_500 }));
});

const orderBody = (
  lines: [string, number][] = [
    ["GG-K17", 100],
    ["GG-CH", 200],
  ],
  extra: Partial<ProductionOrderBody> = {},
): ProductionOrderBody => ({
  workshopId: fx.place("XUONG-01"),
  toLocationId: fx.place("BAI-01"),
  team: "tổ anh Lực",
  lines: lines.map(([code, planned]) => ({
    itemId: item(code),
    quantity: String(planned),
  })),
  ...extra,
});

async function orderRow(code: string) {
  const [row] = await ctx.db
    .select()
    .from(productionOrder)
    .where(eq(productionOrder.code, code));
  if (!row) throw new Error(`no order ${code}`);
  return row;
}

const fresh = async (code: string) => ({
  updatedAt: (await orderRow(code)).updatedAt.toISOString(),
});

const draft = async (extra?: Parameters<typeof orderBody>) =>
  must(
    await createProductionOrder(
      ctx.db,
      fx.accountant,
      orderBody(...(extra ?? [])),
    ),
  ).code;

async function assigned(code: string) {
  must(
    await assignProductionOrder(ctx.db, fx.accountant, code, await fresh(code)),
  );
}

async function receive(code: string) {
  must(
    await receiveProductionOrder(ctx.db, workshop, code, {
      draftId: randomUUID(),
      ...(await fresh(code)),
    }),
  );
}

const floorLine = (
  code: string,
  finished: number,
  offcut: number,
  materials: [string, number][],
): FloorLineBody => ({
  itemId: item(code),
  finished: String(finished),
  offcutKg: String(offcut),
  materials: materials.map(([material, quantity]) => ({
    itemId: item(material),
    quantity: String(quantity),
  })),
});

/** The numbers of the D20 example. */
const d20 = (): FloorLineBody[] => [
  floorLine("GG-K17", 100, 38, [
    ["VT-ONG42", 1012],
    ["VT-ONG27", 391],
    ["VT-QH", 12.5],
    ["VT-SON", 8],
    ["VT-CHOT", 400],
  ]),
  floorLine("GG-CH", 200, 9, [
    ["VT-ONG27", 586],
    ["VT-SON", 6],
  ]),
];

/** Numbers right on the norm: no approval needed. */
const onNorm = (): FloorLineBody[] => [
  floorLine("GG-K17", 100, 38, [
    ["VT-ONG42", 980],
    ["VT-ONG27", 360],
    ["VT-QH", 12],
    ["VT-SON", 8],
    ["VT-CHOT", 400],
  ]),
  floorLine("GG-CH", 200, 9, [
    ["VT-ONG27", 580],
    ["VT-SON", 6],
  ]),
];

async function report(
  code: string,
  lines: FloorLineBody[],
  draftId = randomUUID(),
) {
  return reportProductionOrder(ctx.db, workshop, code, {
    draftId,
    ...(await fresh(code)),
    lines,
  });
}

async function count(
  code: string,
  lines: FloorLineBody[],
  draftId = randomUUID(),
) {
  return countProductionOrder(ctx.db, warehouse, code, {
    draftId,
    ...(await fresh(code)),
    lines,
  });
}

/** An order all the way to counted (or waiting for the director). */
async function counted(lines: FloorLineBody[] = onNorm()) {
  const code = await draft();
  await assigned(code);
  await receive(code);
  must(await report(code, lines));
  must(await count(code, lines));
  return code;
}

async function approve(code: string) {
  must(
    await approveProductionOrder(ctx.db, fx.director, code, {
      ...(await fresh(code)),
      note: "Ống D27 lô mới cong, chấp nhận",
    }),
  );
}

const post = async (code: string, date = NOV_09) =>
  postProductionOrder(ctx.db, fx.accountant, code, await fresh(code), date);

const ledgerOf = async (code: string) =>
  ctx.db
    .select()
    .from(inventoryLedger)
    .where(eq(inventoryLedger.documentCode, code))
    .orderBy(asc(inventoryLedger.id));

describe("BOMs (spec production-boms)", () => {
  it("logs an edit field by field", async () => {
    const before = must(
      await updateBom(ctx.db, fx.accountant, "GG-K17", {
        ...khung(),
        updatedAt: (await lastBom("GG-K17")).updatedAt.toISOString(),
      }),
    );
    expect(await bomTrail("GG-K17")).toEqual(["CREATE"]);
    must(
      await updateBom(ctx.db, fx.accountant, "GG-K17", {
        ...bomOf(
          [
            ["VT-ONG42", "9.8"],
            ["VT-ONG27", "3.8"],
            ["VT-QH", "0.12"],
            ["VT-SON", "0.08"],
            ["VT-CHOT", "4"],
          ],
          36_000,
        ),
        updatedAt: before.updatedAt.toISOString(),
      }),
    );
    const row = await lastActivity(ctx.db, "GG-K17");
    expect(row?.action).toBe("UPDATE");
    expect(row?.documentType).toBe("PRODUCTION_BOM");
    expect(row?.summary).toBe(
      "VT-ONG27: 3,6 → 3,8 kg / cái; công: 35.000 ₫ → 36.000 ₫",
    );
  });

  it("answers 409 for a stale edit and for a second BOM", async () => {
    const stale = await updateBom(ctx.db, fx.accountant, "GG-K17", {
      ...khung(),
      updatedAt: new Date(0).toISOString(),
    });
    expect(stale).toMatchObject({ ok: false, status: 409 });
    const again = await createBom(ctx.db, fx.accountant, "GG-K17", khung());
    expect(again).toMatchObject({
      ok: false,
      status: 409,
      error: "GG-K17 đã có định mức",
    });
  });

  it("refuses a material of the wrong kind with 422", async () => {
    const bad = await createBom(
      ctx.db,
      fx.accountant,
      "PK-KU",
      bomOf([["GG-CH", "1"]], 0),
    );
    expect(bad).toMatchObject({
      ok: false,
      status: 422,
      error: "Nguyên liệu phải là mã nhóm Vật tư",
    });
    const material = await createBom(
      ctx.db,
      fx.accountant,
      "VT-CHOT",
      bomOf([["VT-QH", "1"]], 0),
    );
    expect(material).toMatchObject({
      status: 422,
      error: "Thành phẩm phải là mã nhóm Thiết bị, đơn vị đếm",
    });
  });

  it("deletes with a log row; a draft cannot be assigned afterwards", async () => {
    const code = await draft([[["GG-CH", 10]]]);
    must(await deleteBom(ctx.db, fx.accountant, "GG-CH"));
    expect(await bomTrail("GG-CH")).toEqual(["CREATE", "DELETE"]);
    const refused = await assignProductionOrder(
      ctx.db,
      fx.accountant,
      code,
      await fresh(code),
    );
    expect(refused).toMatchObject({
      ok: false,
      status: 422,
      error: "GG-CH chưa có định mức",
    });
  });
});

async function bomTrail(code: string) {
  return (await activityRows(ctx.db, code))
    .filter((row) => row.documentType === "PRODUCTION_BOM")
    .map((row) => row.action);
}

async function lastBom(code: string) {
  const rows = await ctx.db.execute<{ updated_at: string }>(
    sql`select b.updated_at from production_bom b join item i on i.id = b.item_id where i.code = ${code}`,
  );
  return { updatedAt: new Date(rows[0]?.updated_at ?? 0) };
}

describe("scrap item", () => {
  it("takes a kg material and refuses anything else", async () => {
    const piece = await setScrapItem(ctx.db, fx.director, {
      itemId: item("VT-CHOT"),
    });
    expect(piece).toMatchObject({
      ok: false,
      status: 422,
      error: "Mã sắt vụn phải tính theo kg, nhóm Vật tư",
    });
  });

  it("logs a change and not a repeat", async () => {
    const before = (await activityRows(ctx.db)).length;
    must(
      await setScrapItem(ctx.db, fx.director, { itemId: item("PL-SATVUN") }),
    );
    expect((await activityRows(ctx.db)).length).toBe(before);
    must(await setScrapItem(ctx.db, fx.director, { itemId: item("VT-QH") }));
    const row = await lastActivity(ctx.db, "VT-QH");
    expect(row?.summary).toBe("Mã sắt vụn: PL-SATVUN → VT-QH");
  });
});

describe("drafts (spec: lập lệnh sản xuất)", () => {
  it("shows the expected materials of a draft", async () => {
    const code = await draft();
    expect(code).toBe("LSX-2026-001");
    const detail = await getProductionOrder(ctx.db, code);
    expect(detail?.status).toBe("DRAFT");
    expect(
      detail?.lines[0]?.materials.map((row) => [row.code, row.expectedMilli]),
    ).toEqual([
      ["VT-ONG42", 980_000],
      ["VT-ONG27", 360_000],
      ["VT-QH", 12_000],
      ["VT-SON", 8_000],
      ["VT-CHOT", 400_000],
    ]);
  });

  it.each<[string, () => ProductionOrderBody, string]>([
    [
      "an item without a BOM",
      () => orderBody([["PK-KU", 1]]),
      "PK-KU chưa có định mức",
    ],
    [
      "a fractional quantity",
      () => orderBody([["GG-K17", 10.5]]),
      "Số kế hoạch phải là số nguyên lớn hơn 0",
    ],
    [
      "a workshop as the yard",
      () => orderBody(undefined, { toLocationId: fx.place("XUONG-01") }),
      "Thành phẩm phải nhập về một bãi",
    ],
    ["no lines", () => orderBody([]), "Lệnh cần ít nhất 1 thành phẩm"],
  ])("refuses %s", async (_name, body, message) => {
    const result = await createProductionOrder(ctx.db, fx.accountant, body());
    expect(result).toMatchObject({ ok: false, status: 422, error: message });
  });

  it("edits and deletes a draft, 409 on a stale edit", async () => {
    const code = await draft();
    const stale = await updateProductionOrder(ctx.db, fx.accountant, code, {
      ...orderBody(),
      updatedAt: new Date(0).toISOString(),
    });
    expect(stale).toMatchObject({
      ok: false,
      status: 409,
      error: "Lệnh vừa được người khác cập nhật, tải lại trang",
    });
    must(
      await updateProductionOrder(ctx.db, fx.accountant, code, {
        ...orderBody([["GG-K17", 120]]),
        ...(await fresh(code)),
      }),
    );
    expect((await lastActivity(ctx.db, code))?.action).toBe("UPDATE");
    must(await deleteProductionOrder(ctx.db, fx.accountant, code));
    expect(await activityTrail(ctx.db, code)).toEqual([
      `CREATE ${code}`,
      `UPDATE ${code}`,
      `DELETE_DRAFT ${code}`,
    ]);
  });
});

describe("assign and recall (spec: giao xưởng chụp định mức)", () => {
  it("copies rates and materials, keeps them when the BOM changes", async () => {
    const code = await draft([[["GG-CH", 200]]]);
    await assigned(code);
    const stamp = await lastBom("GG-CH");
    must(
      await updateBom(ctx.db, fx.accountant, "GG-CH", {
        ...bomOf(
          [
            ["VT-ONG27", "3.5"],
            ["VT-SON", "0.03"],
          ],
          9_000,
        ),
        updatedAt: stamp.updatedAt.toISOString(),
      }),
    );
    const detail = await getProductionOrder(ctx.db, code);
    expect(detail?.lines[0]?.laborRate).toBe(8_000);
    expect(detail?.lines[0]?.materials[0]).toMatchObject({
      code: "VT-ONG27",
      normPerUnitMilli: 2_900,
      expectedMilli: 580_000,
    });
  });

  it("recalls, then assigns again with the new rates", async () => {
    const code = await draft([[["GG-CH", 200]]]);
    await assigned(code);
    must(
      await recallProductionOrder(
        ctx.db,
        fx.accountant,
        code,
        await fresh(code),
      ),
    );
    const [line] = await ctx.db
      .select()
      .from(productionOrderLine)
      .where(eq(productionOrderLine.orderId, (await orderRow(code)).id));
    expect(line?.laborRate).toBeNull();
    expect(
      await ctx.db
        .select()
        .from(productionOrderMaterial)
        .where(eq(productionOrderMaterial.lineId, line?.id ?? "")),
    ).toHaveLength(0);
    must(
      await updateBom(ctx.db, fx.accountant, "GG-CH", {
        ...bomOf(
          [
            ["VT-ONG27", "2.9"],
            ["VT-SON", "0.03"],
          ],
          9_000,
        ),
        updatedAt: (await lastBom("GG-CH")).updatedAt.toISOString(),
      }),
    );
    await assigned(code);
    const detail = await getProductionOrder(ctx.db, code);
    expect(detail?.lines[0]?.laborRate).toBe(9_000);
  });

  it("will not recall once the workshop took it", async () => {
    const code = await draft();
    await assigned(code);
    await receive(code);
    const refused = await recallProductionOrder(
      ctx.db,
      fx.accountant,
      code,
      await fresh(code),
    );
    expect(refused).toMatchObject({ ok: false, status: 409 });
  });
});

describe("return and cancel (spec: bước của văn phòng)", () => {
  it("drops the count and the approval, keeps the report", async () => {
    const lines = d20();
    const code = await counted(lines);
    await approve(code);
    const noNote = await returnProductionOrder(ctx.db, fx.accountant, code, {
      ...(await fresh(code)),
      note: " ",
    });
    expect(noNote).toMatchObject({
      ok: false,
      status: 422,
      error: "Nhập ghi chú trả lại",
    });
    must(
      await returnProductionOrder(ctx.db, fx.accountant, code, {
        ...(await fresh(code)),
        note: "Đếm lại ống D27",
      }),
    );
    const row = await orderRow(code);
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.approvedAt).toBeNull();
    expect(row.countedAt).toBeNull();
    expect(row.returnNote).toBe("Đếm lại ống D27");
    const detail = await getProductionOrder(ctx.db, code);
    expect(detail?.lines[0]?.finishedMilli).toBeNull();
    expect(detail?.lines[0]?.reportedFinishedMilli).toBe(100_000);
    const ong27 = detail?.lines[0]?.materials.find(
      (m) => m.code === "VT-ONG27",
    );
    expect(ong27).toMatchObject({
      reportedMilli: 391_000,
      quantityMilli: null,
    });
    expect((await lastActivity(ctx.db, code))?.summary).toBe(
      "Ghi chú: Đếm lại ống D27",
    );
  });

  it("cancels with a reason and writes no ledger line", async () => {
    const code = await draft();
    await assigned(code);
    await receive(code);
    const noReason = await cancelProductionOrder(ctx.db, fx.accountant, code, {
      ...(await fresh(code)),
      reason: "",
    });
    expect(noReason).toMatchObject({
      ok: false,
      status: 422,
      error: "Nhập lý do hủy",
    });
    must(
      await cancelProductionOrder(ctx.db, fx.accountant, code, {
        ...(await fresh(code)),
        reason: "Khách đổi đơn",
      }),
    );
    expect((await orderRow(code)).status).toBe("CANCELLED");
    expect(await ledgerOf(code)).toHaveLength(0);
  });
});

describe("phone steps (spec production-mobile)", () => {
  it("refuses a second receive with a new draft id", async () => {
    const code = await draft();
    await assigned(code);
    await receive(code);
    const again = await receiveProductionOrder(ctx.db, workshop, code, {
      draftId: randomUUID(),
      ...(await fresh(code)),
    });
    expect(again).toMatchObject({
      ok: false,
      status: 409,
      error: "Lệnh không còn ở trạng thái Đã giao",
    });
  });

  it("does not overwrite d2 when d1 arrives late, and logs nothing", async () => {
    const code = await draft();
    await assigned(code);
    await receive(code);
    const d1 = randomUUID();
    const first = onNorm();
    must(await report(code, first, d1));
    must(
      await returnProductionOrder(ctx.db, fx.accountant, code, {
        ...(await fresh(code)),
        note: "Báo lại",
      }),
    );
    const second = d20();
    must(await report(code, second, randomUUID()));
    const before = await activityTrail(ctx.db, code);
    const late = await reportProductionOrder(ctx.db, workshop, code, {
      draftId: d1,
      updatedAt: new Date(0).toISOString(),
      lines: first,
    });
    expect(late).toMatchObject({
      ok: true,
      data: { code, status: "AWAITING_CHECK" },
    });
    expect(await activityTrail(ctx.db, code)).toEqual(before);
    const detail = await getProductionOrder(ctx.db, code);
    expect(
      detail?.lines[0]?.materials.find((m) => m.code === "VT-ONG27")
        ?.reportedMilli,
    ).toBe(391_000);
  });

  it("answers 409 when a draft id was spent on another order", async () => {
    const first = await draft([[["GG-CH", 1]]]);
    await assigned(first);
    const second = await draft([[["GG-CH", 2]]]);
    await assigned(second);
    const draftId = randomUUID();
    must(
      await receiveProductionOrder(ctx.db, workshop, first, {
        draftId,
        ...(await fresh(first)),
      }),
    );
    const copied = await receiveProductionOrder(ctx.db, workshop, second, {
      draftId,
      ...(await fresh(second)),
    });
    expect(copied).toMatchObject({
      ok: false,
      status: 409,
      error: "Mã nháp đã dùng cho lệnh khác",
    });
  });

  it("answers 422 for a material of the wrong kind or half a piece", async () => {
    const code = await draft();
    await assigned(code);
    await receive(code);
    const kind = await report(code, [
      floorLine("GG-K17", 100, 0, [["GG-CH", 1]]),
      floorLine("GG-CH", 200, 0, []),
    ]);
    expect(kind).toMatchObject({
      ok: false,
      status: 422,
      error: "Nguyên liệu phải là mã nhóm Vật tư",
    });
    const half = await report(code, [
      floorLine("GG-K17", 100, 0, [["VT-CHOT", 400.5]]),
      floorLine("GG-CH", 200, 0, []),
    ]);
    expect(half).toMatchObject({
      ok: false,
      status: 422,
      error: "VT-CHOT tính theo cái, nhập số nguyên",
    });
  });

  it("goes to the accountant when nothing is over, to the director when it is", async () => {
    expect((await orderRow(await counted(onNorm()))).status).toBe("COUNTED");
    expect((await orderRow(await counted(d20()))).status).toBe(
      "AWAITING_APPROVAL",
    );
  });

  it("calls a material outside the norm overuse", async () => {
    const lines = onNorm();
    lines[1]?.materials?.push({ itemId: item("VT-QH"), quantity: "0.5" });
    const code = await counted(lines);
    expect((await orderRow(code)).status).toBe("AWAITING_APPROVAL");
    const added = (
      await getProductionOrder(ctx.db, code)
    )?.lines[1]?.materials.find((m) => m.code === "VT-QH");
    expect(added?.normPerUnitMilli).toBeNull();
  });

  it("logs the count difference without money", async () => {
    const code = await draft();
    await assigned(code);
    await receive(code);
    const reported = onNorm();
    (reported[0] as FloorLineBody).finished = "102";
    must(await report(code, reported));
    expect((await lastActivity(ctx.db, code))?.summary).toBe(
      "302 cái làm xong · 47 kg đầu thừa · 7 nguyên liệu",
    );
    must(await count(code, onNorm()));
    const row = await lastActivity(ctx.db, code);
    expect(row?.action).toBe("COUNT");
    expect(row?.summary).toBe("GG-K17: xưởng báo 102, đếm 100");
    expect(row?.summary).not.toMatch(/₫/);
  });
});

describe("approval (spec: Giám đốc duyệt vượt định mức)", () => {
  it("wants a note, records who and logs the overuse", async () => {
    const code = await counted(d20());
    const empty = await approveProductionOrder(ctx.db, fx.director, code, {
      ...(await fresh(code)),
      note: "",
    });
    expect(empty).toMatchObject({
      ok: false,
      status: 422,
      error: "Nhập ghi chú duyệt",
    });
    await approve(code);
    expect((await orderRow(code)).status).toBe("COUNTED");
    expect((await lastActivity(ctx.db, code))?.summary).toBe(
      "VT-ONG27 (GG-K17) + 8,6 % · Ống D27 lô mới cong, chấp nhận",
    );
  });

  it("will not post while waiting for the director", async () => {
    const code = await counted(d20());
    const result = await post(code);
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: "Lệnh chưa ở trạng thái Chờ ghi sổ",
    });
    expect(await ledgerOf(code)).toHaveLength(0);
  });
});

describe("posting (spec: ghi sổ lệnh sản xuất)", () => {
  it("writes the D20 example to the đồng", async () => {
    await opening([["GG-K17", "NEW", 200, 340_000, "BAI-01"]]);
    const code = await counted(d20());
    await approve(code);
    must(await post(code));
    const lines = await ledgerOf(code);
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    expect(total).toBe(5_100_000);
    const incoming = lines.filter((line) => line.movement === "PRODUCTION_IN");
    expect(
      incoming.map((line) => [
        line.description,
        line.condition,
        line.quantity,
        line.amount,
        line.locationId,
      ]),
    ).toEqual([
      [
        `${code}: nhập sản xuất GG-K17`,
        "NEW",
        "100.000",
        32_660_500,
        fx.place("BAI-01"),
      ],
      [
        `${code}: đầu thừa làm GG-K17`,
        "SCRAP",
        "38.000",
        285_000,
        fx.place("BAI-01"),
      ],
      [
        `${code}: nhập sản xuất GG-CH`,
        "NEW",
        "200.000",
        13_206_500,
        fx.place("BAI-01"),
      ],
      [
        `${code}: đầu thừa làm GG-CH`,
        "SCRAP",
        "9.000",
        67_500,
        fx.place("BAI-01"),
      ],
    ]);
    const outgoing = lines.filter((line) => line.movement === "PRODUCTION_OUT");
    expect(
      outgoing.every((line) => line.locationId === fx.place("XUONG-01")),
    ).toBe(true);
    expect(outgoing.reduce((sum, line) => sum + line.amount, 0)).toBe(
      -41_119_500,
    );
    const [pool] = await ctx.db
      .select()
      .from(inventoryCost)
      .where(
        and(
          eq(inventoryCost.itemId, item("GG-K17")),
          eq(inventoryCost.condition, "NEW"),
        ),
      );
    expect(pool?.avgCost).toBe(335_535);
    const row = await orderRow(code);
    expect(row.status).toBe("POSTED");
    expect(row.scrapPriceUsed).toBe(7_500);
    expect(row.scrapItemId).toBe(item("PL-SATVUN"));
    expect((await lastActivity(ctx.db, code))?.summary).toBe(
      "300 cái Mới về BAI-01, 47 kg phế liệu · nguyên liệu 41.119.500 ₫, công 5.100.000 ₫ · thành phẩm 45.867.000 ₫",
    );
    expect(await reconcileInventory(ctx.db)).toEqual([]);
  });

  it("keeps the posted figures when averages move", async () => {
    const code = await counted(d20());
    await approve(code);
    must(await post(code));
    await opening([["VT-ONG42", "NEW", 1000, 25_000, "XUONG-01"]], NOV_09);
    const detail = await getProductionOrder(ctx.db, code);
    expect(
      detail?.lines[0]?.materials.find((m) => m.code === "VT-ONG42")?.amount,
    ).toBe(19_734_000);
    expect(detail?.lines[0]?.finishedAmount).toBe(32_660_500);
  });

  it("writes nothing when a material is short", async () => {
    const lines = onNorm();
    const stock = 3000;
    (lines[0]?.materials?.[1] as { quantity: string }).quantity = String(stock);
    const code = await counted(lines);
    await approve(code);
    const refused = await post(code);
    expect(refused).toMatchObject({
      ok: false,
      status: 400,
      error: "VT-ONG27 ở XUONG-01 còn 2.000 kg, lệnh cần 3.580 kg",
    });
    expect(await ledgerOf(code)).toHaveLength(0);
    expect((await orderRow(code)).status).toBe("COUNTED");
    expect(await activityTrail(ctx.db, code)).not.toContain(`POST ${code}`);
  });

  it("posts without a scrap price when there are no offcuts", async () => {
    const lines = onNorm().map((line) => ({ ...line, offcutKg: "0" }));
    const code = await counted(lines);
    must(await post(code));
    expect(
      (await ledgerOf(code)).some((line) => line.condition === "SCRAP"),
    ).toBe(false);
    expect((await orderRow(code)).scrapItemId).toBeNull();
  });

  it("refuses a line with nothing finished", async () => {
    const lines = onNorm();
    (lines[1] as FloorLineBody).finished = "0";
    const code = await counted(lines);
    await approve(code);
    const refused = await post(code);
    expect(refused).toMatchObject({
      status: 400,
      error:
        "GG-CH làm xong 0 cái: bỏ nguyên liệu của dòng, nguyên liệu hỏng thì lập phiếu điều chỉnh",
    });
  });

  it("says stale, not wrong state, when someone returned the order first", async () => {
    const code = await counted();
    const seen = await fresh(code);
    must(
      await returnProductionOrder(ctx.db, fx.accountant, code, {
        ...seen,
        note: "Đếm lại",
      }),
    );
    const result = await postProductionOrder(
      ctx.db,
      fx.accountant,
      code,
      seen,
      NOV_09,
    );
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: "Lệnh vừa được người khác cập nhật, tải lại trang",
    });
    expect(await ledgerOf(code)).toHaveLength(0);
  });

  it("answers 409 for a stale post", async () => {
    const code = await counted();
    const result = await postProductionOrder(
      ctx.db,
      fx.accountant,
      code,
      { updatedAt: new Date(0).toISOString() },
      NOV_09,
    );
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: "Lệnh vừa được người khác cập nhật, tải lại trang",
    });
  });
});

describe("D15 (spec gross-profit)", () => {
  it("checks to 0 and shows the labour of the month", async () => {
    const code = await counted(d20());
    await approve(code);
    must(await post(code));
    const range = {
      from: "2026-11-01" as BusinessDate,
      to: "2026-11-30" as BusinessDate,
    };
    const [ledger, repairs, productions] = await Promise.all([
      ledgerSums(ctx.db, range),
      repairSums(ctx.db, range),
      productionSums(ctx.db, range),
    ]);
    expect(productions).toEqual([{ month: "2026-11", laborCost: 5_100_000 }]);
    expect(ledgerCostCheck(ledger, repairs, productions)).toBe(0);
    const rows = monthlyProfit(
      ["2026-11"],
      new Map(),
      ledger,
      repairs,
      new Set(),
      productions,
    );
    const total = sumMonths(rows, ["2026-11"]);
    expect(total.costTotal).toBe(0);
    expect(total.productionSpent).toBe(5_100_000);
  });
});

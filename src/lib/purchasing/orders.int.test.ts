// Purchase order service (purchase-orders tasks 3.1, 3.2, 3.4, 3.5).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  inventoryCost,
  inventoryLedger,
  purchaseOrder,
  purchaseOrderEvent,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { updateItem } from "@/lib/catalog/items";
import {
  createSupplier,
  deleteSupplier,
  updateSupplier,
} from "@/lib/catalog/partners";
import { deleteItem } from "@/lib/catalog/items";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { createTestContext } from "@/test/auth";
import {
  d3Order,
  setupPurchasingFixture,
  type PurchasingFixture,
} from "@/test/purchasing";

import {
  cancelOrder,
  closeOrder,
  createOrder,
  deleteOrder,
  placeOrder,
  updateOrder,
} from "./orders";
import { getOrderByCode, listOrders } from "./queries";

const ctx = createTestContext();
afterAll(ctx.close);

const TODAY = "2026-10-26" as BusinessDate;
const OCT = new Date("2026-10-26T03:00:00Z");

let fx: PurchasingFixture;
beforeEach(async () => {
  fx = await setupPurchasingFixture(ctx);
});

async function made(place = false, body = d3Order(fx)) {
  const result = await createOrder(ctx.db, fx.sales, body, { place, now: OCT });
  if (!result.ok) throw new Error(result.error);
  return result.data.code;
}

async function detail(code: string) {
  const found = await getOrderByCode(ctx.db, code);
  if (!found) throw new Error(`no order ${code}`);
  return found;
}

describe("create, place, read", () => {
  it("saves the D3 order and reads back its lines, costs and totals", async () => {
    const code = await made();
    expect(code).toBe("PO-2026-001");
    const order = await detail(code);
    expect(order.status).toBe("DRAFT");
    expect(
      order.lines.map((line) => [line.itemCode, line.quantity, line.amount]),
    ).toEqual([
      ["GG-K17", 200_000, 37_000_000],
      ["GG-CH", 400_000, 12_800_000],
      ["GG-M16", 150_000, 21_750_000],
      ["PL-SAT", 1_250_500, 9_378_750],
    ]);
    expect(order.costs.map((cost) => cost.amount)).toEqual([
      3_500_000, 1_200_000, 180_000,
    ]);
    expect(order.totals).toEqual({
      goods: 80_928_750,
      costs: 4_880_000,
      total: 85_808_750,
    });
    expect(order.expectedTime).toBe("09:30");
    expect(order.events.map((event) => event.kind)).toEqual(["CREATED"]);
  });

  it("Lưu đơn creates and places in one command", async () => {
    const code = await made(true);
    const order = await detail(code);
    expect(order.status).toBe("IN_PROGRESS");
    expect(order.events.map((event) => event.kind)).toEqual([
      "PLACED",
      "CREATED",
    ]);
    expect(order.events[0]?.actorName).toBe("Quốc Bảo");
  });

  it("numbers orders per year in Vietnam time", async () => {
    await made();
    await made();
    expect(await made()).toBe("PO-2026-003");
    const result = await createOrder(ctx.db, fx.sales, d3Order(fx), {
      now: new Date("2026-12-31T17:10:00Z"),
    });
    expect(result.ok && result.data.code).toBe("PO-2027-001");
  });

  it("keeps a draft with only a supplier, then refuses to place it", async () => {
    const result = await createOrder(ctx.db, fx.sales, {
      supplierId: fx.supplier("NCC-0001"),
      kind: "NEW",
    });
    expect(result.ok).toBe(true);
    const code = result.ok ? result.data.code : "";
    expect(await placeOrder(ctx.db, fx.sales, code)).toEqual({
      ok: false,
      status: 422,
      error: "Đơn cần ít nhất một dòng hàng",
      field: "lines",
    });
    expect((await detail(code)).status).toBe("DRAFT");
  });

  it("refuses to place twice", async () => {
    const code = await made(true);
    expect(await placeOrder(ctx.db, fx.sales, code)).toMatchObject({
      ok: false,
      status: 409,
      error: `Đơn ${code} đã đặt rồi`,
    });
  });

  it("refuses an archived supplier or item, with the field", async () => {
    const archived = await updateSupplier(
      ctx.db,
      fx.director,
      fx.supplier("NCC-0002"),
      { status: "ARCHIVED" },
    );
    expect(archived.ok).toBe(true);
    expect(await createOrder(ctx.db, fx.sales, d3Order(fx))).toMatchObject({
      ok: false,
      status: 409,
      error: "Nhà cung cấp NCC-0002 đã ngừng dùng",
      field: "supplierId",
    });
    await updateSupplier(ctx.db, fx.director, fx.supplier("NCC-0002"), {
      status: "ACTIVE",
    });
    await updateItem(ctx.db, fx.director, fx.item("OT-06"), {
      status: "ARCHIVED",
    });
    const body = d3Order(fx);
    body.lines = [
      { itemId: fx.item("OT-06"), unit: "PIECE", quantity: "1", unitPrice: 1 },
    ];
    expect(await createOrder(ctx.db, fx.sales, body)).toMatchObject({
      ok: false,
      error: "Vật tư OT-06 đã ngừng dùng",
      field: "lines.0.itemId",
    });
  });

  it("checks the lines with their field", async () => {
    const body = d3Order(fx);
    body.lines = [
      {
        itemId: fx.item("PL-SAT"),
        unit: "PIECE",
        quantity: "10",
        unitPrice: 1,
      },
    ];
    expect(await createOrder(ctx.db, fx.sales, body)).toMatchObject({
      status: 422,
      error: "PL-SAT tính theo kg, chỉ đặt được theo kg",
      field: "lines.0.unit",
    });
    body.lines = [
      {
        itemId: fx.item("GG-CH"),
        unit: "PIECE",
        quantity: "2.5",
        unitPrice: 1,
      },
    ];
    expect(await createOrder(ctx.db, fx.sales, body)).toMatchObject({
      error: "GG-CH tính theo cái, số lượng phải là số nguyên",
      field: "lines.0.quantity",
    });
    expect(await ctx.db.select().from(purchaseOrder)).toHaveLength(0);
  });
});

describe("edit, cancel, close, delete", () => {
  it("edits a placed order before goods arrive and logs it", async () => {
    const code = await made(true);
    const before = await detail(code);
    const body = d3Order(fx);
    body.lines = body.lines?.map((line, index) =>
      index === 0 ? { ...line, unitPrice: 188_000 } : line,
    );
    const result = await updateOrder(ctx.db, fx.sales, code, {
      ...body,
      updatedAt: before.updatedAt.toISOString(),
    });
    expect(result.ok).toBe(true);
    const after = await detail(code);
    expect(after.lines[0]?.unitPrice).toBe(188_000);
    expect(after.events[0]?.kind).toBe("UPDATED");
  });

  it("refuses an edit made from a stale form", async () => {
    const code = await made(true);
    const opened = (await detail(code)).updatedAt.toISOString();
    expect(
      (
        await updateOrder(ctx.db, fx.director, code, {
          ...d3Order(fx),
          note: "Giám đốc sửa trước",
          updatedAt: opened,
        })
      ).ok,
    ).toBe(true);
    expect(
      await updateOrder(ctx.db, fx.sales, code, {
        ...d3Order(fx),
        note: "Quốc Bảo sửa sau",
        updatedAt: opened,
      }),
    ).toMatchObject({
      ok: false,
      status: 409,
      error: "Đơn vừa được người khác sửa, tải lại trang",
    });
    expect((await detail(code)).note).toBe("Giám đốc sửa trước");
  });

  it("cancels with a reason, refuses without one", async () => {
    const code = await made(true);
    expect(await cancelOrder(ctx.db, fx.sales, code, " ")).toMatchObject({
      ok: false,
      error: "Nhập lý do hủy đơn",
    });
    expect(
      (await cancelOrder(ctx.db, fx.sales, code, "Người bán bán cho chỗ khác"))
        .ok,
    ).toBe(true);
    const order = await detail(code);
    expect([order.status, order.outcome, order.endReason]).toEqual([
      "DONE",
      "CANCELLED",
      "Người bán bán cho chỗ khác",
    ]);
    expect(await cancelOrder(ctx.db, fx.sales, code, "x")).toMatchObject({
      error: `Đơn ${code} đã xong, không đổi được nữa`,
    });
    expect(
      await updateOrder(ctx.db, fx.sales, code, {
        ...d3Order(fx),
        updatedAt: order.updatedAt.toISOString(),
      }),
    ).toMatchObject({ error: `Đơn ${code} đã xong, không đổi được nữa` });
  });

  it("refuses to close an order no goods came in for", async () => {
    const code = await made(true);
    expect(await closeOrder(ctx.db, fx.sales, code, null)).toMatchObject({
      ok: false,
      error: "Đơn chưa có phiếu nhập, dùng Hủy đơn",
    });
  });

  it("deletes a draft for good and never gives its code again", async () => {
    const draft = await made();
    expect((await deleteOrder(ctx.db, draft)).ok).toBe(true);
    expect(await getOrderByCode(ctx.db, draft)).toBeNull();
    expect(await made()).toBe("PO-2026-002");
    const placed = await made(true);
    expect(await deleteOrder(ctx.db, placed)).toMatchObject({
      ok: false,
      error: "Đơn đã đặt không xóa được, dùng Hủy đơn",
    });
  });

  it("leaves the order untouched when a command fails", async () => {
    const code = await made(true);
    const before = await detail(code);
    const body = d3Order(fx);
    body.costs = [{ label: "", amount: 1 }];
    expect(
      await updateOrder(ctx.db, fx.sales, code, {
        ...body,
        updatedAt: before.updatedAt.toISOString(),
      }),
    ).toMatchObject({ field: "costs.0.label" });
    const after = await detail(code);
    expect(after.costs).toEqual(before.costs);
    expect(after.events).toHaveLength(before.events.length);
  });

  it("answers 404 for an unknown code", async () => {
    expect(await placeOrder(ctx.db, fx.sales, "PO-2026-999")).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe("orders never touch the ledger (design D1)", () => {
  it("leaves ledger and costs as they were", async () => {
    const ledger = async () =>
      (
        await ctx.db
          .select({ n: sql<number>`count(*)::int` })
          .from(inventoryLedger)
      )[0]?.n;
    const costs = () => ctx.db.select().from(inventoryCost);
    const [beforeLedger, beforeCosts] = [await ledger(), await costs()];
    const code = await made();
    const opened = (await detail(code)).updatedAt.toISOString();
    await updateOrder(ctx.db, fx.sales, code, {
      ...d3Order(fx),
      updatedAt: opened,
    });
    await placeOrder(ctx.db, fx.sales, code);
    await cancelOrder(ctx.db, fx.sales, code, "Thử");
    await deleteOrder(ctx.db, await made());
    expect(await ledger()).toBe(beforeLedger);
    expect(await costs()).toEqual(beforeCosts);
    expect((await reconcileInventory(ctx.db)).length).toBe(0);
  });

  it("the purchasing code does not import the posting module", () => {
    const dir = join(process.cwd(), "src/lib/purchasing");
    for (const file of readdirSync(dir)) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(/@\/lib\/inventory\/post/);
    }
  });
});

describe("D2 list", () => {
  it("counts tabs, hides cancelled orders outside Tất cả, finds without accents", async () => {
    const phucLam = await createSupplier(ctx.db, fx.director, {
      kind: "COMPANY",
      name: "Cty TNHH Thép Phúc Lâm",
    });
    if (!phucLam.ok) throw new Error(phucLam.error);
    const waiting = await made(true, {
      ...d3Order(fx),
      supplierId: phucLam.data.id,
      kind: "NEW",
    });
    await made(true);
    await made();
    const cancelled = await made(true);
    await cancelOrder(ctx.db, fx.sales, cancelled, "Thử");
    const all = await listOrders(ctx.db, {}, TODAY);
    expect(all.counts).toEqual({
      all: 4,
      draft: 1,
      waiting: 2,
      receiving: 0,
      done: 0,
    });
    expect(all.arrivingToday).toBe(2);
    // Open orders first, then the draft, then the finished one.
    expect(all.rows.map((row) => row.status)).toEqual([
      "IN_PROGRESS",
      "IN_PROGRESS",
      "DRAFT",
      "DONE",
    ]);
    expect(all.rows[0]?.total).toBe(85_808_750);
    expect(all.rows[0]?.lineCount).toBe(4);
    const tab = await listOrders(ctx.db, { tab: "waiting" }, TODAY);
    expect(tab.rows.map((row) => row.code)).not.toContain(cancelled);
    expect(tab.total).toBe(2);
    const found = await listOrders(ctx.db, { q: "phuc lam" }, TODAY);
    expect(found.rows.map((row) => row.code)).toEqual([waiting]);
    const byCode = await listOrders(
      ctx.db,
      { q: waiting.toLowerCase() },
      TODAY,
    );
    expect(byCode.rows.map((row) => row.code)).toEqual([waiting]);
    expect(
      (await listOrders(ctx.db, { kind: "NEW" }, TODAY)).rows.map(
        (r) => r.code,
      ),
    ).toEqual([waiting]);
  });

  it("counts arrivals of today only", async () => {
    await made(true);
    expect(
      (await listOrders(ctx.db, {}, "2026-10-27" as BusinessDate))
        .arrivingToday,
    ).toBe(0);
  });

  it("pages by 20", async () => {
    for (let index = 0; index < 21; index += 1) await made();
    const second = await listOrders(ctx.db, { page: 2 }, TODAY);
    expect([second.rows.length, second.pageCount, second.page]).toEqual([
      1, 2, 2,
    ]);
  });

  it("returns null for an unknown code", async () => {
    expect(await getOrderByCode(ctx.db, "PO-2026-999")).toBeNull();
  });
});

describe("catalog guards (task 3.5)", () => {
  it("refuses to archive a supplier with an open order", async () => {
    const code = await made(true);
    expect(
      await updateSupplier(ctx.db, fx.director, fx.supplier("NCC-0002"), {
        status: "ARCHIVED",
      }),
    ).toMatchObject({
      ok: false,
      status: 409,
      error: `NCC-0002 còn đơn thu mua đang xử lý: ${code}. Đóng hoặc hủy đơn trước`,
    });
    await cancelOrder(ctx.db, fx.sales, code, "Thử");
    await made();
    expect(
      (
        await updateSupplier(ctx.db, fx.director, fx.supplier("NCC-0002"), {
          status: "ARCHIVED",
        })
      ).ok,
    ).toBe(true);
  });

  it("keeps a supplier an order names", async () => {
    await made();
    expect(await deleteSupplier(ctx.db, fx.supplier("NCC-0002"))).toMatchObject(
      {
        ok: false,
        error: "Nhà cung cấp đã được dùng nên chỉ ngừng dùng được",
      },
    );
  });

  it("refuses to archive an item in an open order, keeps an item in a draft", async () => {
    const code = await made(true);
    expect(
      await updateItem(ctx.db, fx.director, fx.item("PL-SAT"), {
        status: "ARCHIVED",
      }),
    ).toMatchObject({
      ok: false,
      error: `PL-SAT còn trong đơn thu mua đang xử lý: ${code}`,
    });
    const body = d3Order(fx);
    body.lines = [
      { itemId: fx.item("OT-06"), unit: "PIECE", quantity: "5", unitPrice: 1 },
    ];
    await made(false, body);
    expect(await deleteItem(ctx.db, fx.item("OT-06"))).toMatchObject({
      ok: false,
      error: "Vật tư đã được dùng nên chỉ ngừng dùng được",
    });
    expect(
      (
        await updateItem(ctx.db, fx.director, fx.item("OT-06"), {
          status: "ARCHIVED",
        })
      ).ok,
    ).toBe(true);
  });

  it("lists at most three open order codes", async () => {
    for (let index = 0; index < 4; index += 1) await made(true);
    const result = await updateSupplier(
      ctx.db,
      fx.director,
      fx.supplier("NCC-0002"),
      { status: "ARCHIVED" },
    );
    expect(result).toMatchObject({
      error:
        "NCC-0002 còn đơn thu mua đang xử lý: PO-2026-001, PO-2026-002, PO-2026-003…. Đóng hoặc hủy đơn trước",
    });
  });
});

describe("history", () => {
  it("is newest first with the actor's name", async () => {
    const code = await made();
    await placeOrder(ctx.db, fx.director, code);
    const events = await ctx.db
      .select()
      .from(purchaseOrderEvent)
      .where(eq(purchaseOrderEvent.kind, "PLACED"));
    expect(events).toHaveLength(1);
    const order = await detail(code);
    expect(order.events.map((event) => [event.kind, event.actorName])).toEqual([
      ["PLACED", "Minh Anh"],
      ["CREATED", "Quốc Bảo"],
    ]);
  });
});

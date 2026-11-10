// Purchase orders in the activity log (activity-log tasks 5.2).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { purchaseOrder, purchaseOrderEvent } from "@/db/schema";
import { activityRows, activityTrail, lastActivity } from "@/test/activity";
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

const ctx = createTestContext();
afterAll(ctx.close);

const OCT = new Date("2026-10-26T03:00:00Z");
let fx: PurchasingFixture;

beforeEach(async () => {
  fx = await setupPurchasingFixture(ctx);
});

async function made(place = false) {
  const result = await createOrder(ctx.db, fx.sales, d3Order(fx), {
    place,
    now: OCT,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.code;
}

async function updatedAt(code: string) {
  const [row] = await ctx.db
    .select({ updatedAt: purchaseOrder.updatedAt })
    .from(purchaseOrder)
    .where(eq(purchaseOrder.code, code));
  return row?.updatedAt.toISOString() ?? "";
}

describe("purchase orders in the activity log", () => {
  it("Lưu đơn logs a creation and a placing", async () => {
    const code = await made(true);
    const rows = await activityRows(ctx.db, code);
    expect(rows.map((row) => [row.action, row.summary])).toEqual([
      ["CREATE", "NCC-0002 · 4 mã hàng · 80.928.750 ₫"],
      ["SUBMIT", "Dự kiến về 26/10/2026"],
    ]);
    expect(rows[0]).toMatchObject({
      documentType: "PURCHASE_ORDER",
      role: "SALES",
    });
  });

  it("an edit lists the changed price and the new goods total", async () => {
    const code = await made();
    const body = d3Order(fx);
    await updateOrder(ctx.db, fx.sales, code, {
      ...body,
      lines: (body.lines ?? []).map((line, index) =>
        index === 0 ? { ...line, unitPrice: 180_000 } : line,
      ),
      updatedAt: await updatedAt(code),
    });
    const row = await lastActivity(ctx.db, code);
    expect(row?.action).toBe("UPDATE");
    expect(row?.changes).toEqual([
      {
        field: "lines.GG-K17.unitPrice",
        label: "Đơn giá GG-K17",
        before: "185.000 ₫",
        after: "180.000 ₫",
      },
      {
        field: "goodsTotal",
        label: "Tổng tiền hàng của đơn",
        before: "80.928.750 ₫",
        after: "79.928.750 ₫",
      },
    ]);
    expect(row?.summary).toBe(
      "Đơn giá GG-K17: 185.000 ₫ → 180.000 ₫; Tổng tiền hàng của đơn: 80.928.750 ₫ → 79.928.750 ₫",
    );
  });

  it("saving the same order writes no row", async () => {
    const code = await made();
    await updateOrder(ctx.db, fx.sales, code, {
      ...d3Order(fx),
      updatedAt: await updatedAt(code),
    });
    expect(await activityTrail(ctx.db, code)).toEqual([`CREATE ${code}`]);
  });

  it("a stale edit (409) writes no row", async () => {
    const code = await made();
    const stale = await updateOrder(ctx.db, fx.sales, code, {
      ...d3Order(fx),
      vehicle: "Xe khác",
      updatedAt: new Date("2020-01-01").toISOString(),
    });
    expect(stale).toMatchObject({ ok: false, status: 409 });
    expect(await activityTrail(ctx.db, code)).toEqual([`CREATE ${code}`]);
  });

  it("keeps the order's own history as well", async () => {
    const code = await made();
    await placeOrder(ctx.db, fx.sales, code);
    const events = await ctx.db.select().from(purchaseOrderEvent);
    expect(events.map((event) => event.kind).sort()).toEqual([
      "CREATED",
      "PLACED",
    ]);
  });

  it("logs cancel and close with their reason", async () => {
    const first = await made(true);
    const second = await made(true);
    await cancelOrder(ctx.db, fx.sales, first, "Người bán không bán nữa");
    await closeOrder(ctx.db, fx.director, second, null);
    expect(await lastActivity(ctx.db, first)).toMatchObject({
      action: "CANCEL",
      summary: 'Lý do: "Người bán không bán nữa"',
    });
    // Closing an order that never received anything is refused.
    const closed = await activityTrail(ctx.db, second);
    expect(closed.at(-1)).toMatch(/^(CLOSE|SUBMIT) /);
  });

  it("a deleted draft keeps its row", async () => {
    const code = await made();
    expect((await deleteOrder(ctx.db, fx.sales, code)).ok).toBe(true);
    expect(await activityTrail(ctx.db, code)).toEqual([
      `CREATE ${code}`,
      `DELETE_DRAFT ${code}`,
    ]);
    expect((await lastActivity(ctx.db, code))?.summary).toBe(
      "Nháp: NCC-0002 · 4 mã hàng · 80.928.750 ₫",
    );
  });
});

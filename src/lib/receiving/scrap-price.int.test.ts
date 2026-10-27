// Scrap price service (goods-receipt task 4.1) and the order rules that
// depend on a posted receipt (task 4.2).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { goodsReceipt } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { cancelOrder, closeOrder, updateOrder } from "@/lib/purchasing/orders";
import { getOrderByCode, listOrders } from "@/lib/purchasing/queries";
import { createTestContext } from "@/test/auth";
import { d3Order } from "@/test/purchasing";
import {
  OCT_26,
  orderLineIds,
  placedOrder,
  setupReceivingFixture,
  tripOne,
  type ReceivingFixture,
} from "@/test/receiving";

import { postReceipt } from "./post";
import {
  currentScrapPrice,
  scrapPriceHistory,
  setScrapPrice,
} from "./scrap-price";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ReceivingFixture;
beforeEach(async () => {
  fx = await setupReceivingFixture(ctx, { scrapPrice: false });
});

describe("scrap price (4.1)", () => {
  it("starts empty, then keeps every change", async () => {
    expect(await currentScrapPrice(ctx.db)).toBeNull();
    await setScrapPrice(ctx.db, fx.director, { pricePerKg: 7_500 });
    const second = await setScrapPrice(ctx.db, fx.director, {
      pricePerKg: 7_800,
      note: " Giá vựa tháng 11 ",
    });
    expect(second).toMatchObject({
      ok: true,
      data: {
        pricePerKg: 7_800,
        note: "Giá vựa tháng 11",
        createdByName: "Minh Anh",
      },
    });
    expect((await currentScrapPrice(ctx.db))?.pricePerKg).toBe(7_800);
    expect(
      (await scrapPriceHistory(ctx.db)).map((row) => row.pricePerKg),
    ).toEqual([7_800, 7_500]);
  });

  it.each([0, 7_500.5, -1])("refuses %s", async (pricePerKg) => {
    expect(await setScrapPrice(ctx.db, fx.director, { pricePerKg })).toEqual({
      ok: false,
      status: 422,
      error: "Giá sắt vụn phải là số nguyên lớn hơn 0",
      field: "pricePerKg",
    });
    expect(await currentScrapPrice(ctx.db)).toBeNull();
  });

  it("keeps the price a receipt used after a change", async () => {
    await setScrapPrice(ctx.db, fx.director, { pricePerKg: 7_500 });
    const code = await placedOrder(ctx, fx);
    const lines = await orderLineIds(ctx, code);
    const posted = await postReceipt(
      ctx.db,
      fx.warehouse,
      tripOne(code, lines),
      {
        now: OCT_26,
      },
    );
    expect(posted.ok).toBe(true);
    await setScrapPrice(ctx.db, fx.director, { pricePerKg: 7_800 });
    const [row] = await ctx.db.select().from(goodsReceipt);
    expect(row?.scrapPricePerKg).toBe(7_500);
  });
});

describe("an order with a receipt (4.2)", () => {
  let code = "";
  beforeEach(async () => {
    await setScrapPrice(ctx.db, fx.director, { pricePerKg: 7_500 });
    code = await placedOrder(ctx, fx);
    const lines = await orderLineIds(ctx, code);
    const posted = await postReceipt(
      ctx.db,
      fx.warehouse,
      tripOne(code, lines),
      {
        now: OCT_26,
      },
    );
    if (!posted.ok) throw new Error(posted.error);
  });

  it("shows on the Đang nhận tab of D2", async () => {
    const list = await listOrders(
      ctx.db,
      { tab: "receiving" },
      "2026-10-26" as BusinessDate,
    );
    expect(list.rows.map((row) => row.code)).toEqual([code]);
    expect(list.counts).toMatchObject({ receiving: 1, waiting: 0 });
    expect(list.rows[0]?.hasReceipts).toBe(true);
  });

  it("cannot be cancelled but can be closed", async () => {
    expect(await cancelOrder(ctx.db, fx.sales, code, "Thôi")).toMatchObject({
      ok: false,
      error:
        "Đơn đã có phiếu nhập thì không hủy được. Hàng nhập sai thì lập phiếu điều chỉnh kho.",
    });
    expect((await closeOrder(ctx.db, fx.sales, code, null)).ok).toBe(true);
  });

  it("only lets the schedule be edited", async () => {
    const order = await getOrderByCode(ctx.db, code);
    expect(order).toMatchObject({
      trips: 1,
      hasReceipts: true,
      editable: "SCHEDULE",
    });
    const changed = d3Order(fx);
    changed.lines = changed.lines?.slice(1);
    expect(
      await updateOrder(ctx.db, fx.sales, code, {
        ...changed,
        updatedAt: order?.updatedAt.toISOString(),
      }),
    ).toMatchObject({
      ok: false,
      error:
        "Đơn đã có phiếu nhập, chỉ sửa được ngày dự kiến, phương tiện và ghi chú",
    });
    expect(
      await updateOrder(ctx.db, fx.sales, code, {
        ...d3Order(fx),
        expectedDate: "2026-10-28",
        updatedAt: order?.updatedAt.toISOString(),
      }),
    ).toMatchObject({ ok: true });
  });

  it("reads what came in per item, in the line unit", async () => {
    const order = await getOrderByCode(ctx.db, code);
    expect(order?.lines.map((line) => [line.itemCode, line.received])).toEqual([
      ["GG-K17", 196_000],
      ["GG-CH", 400_000],
      ["GG-M16", 0],
      ["PL-SAT", 1_250_500],
    ]);
  });
});

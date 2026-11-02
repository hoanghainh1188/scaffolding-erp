// Two writers at once (purchase-orders task 3.3, design D8). Each case runs
// several rounds on two connection pools so the transactions really overlap.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { PURCHASE_MESSAGES } from "@/domain/purchase-order";
import { updateItem } from "@/lib/catalog/items";
import { updateSupplier } from "@/lib/catalog/partners";
import { createTestContext } from "@/test/auth";
import { resetInventoryTables } from "@/test/inventory";
import {
  d3Order,
  setupPurchasingFixture,
  type PurchasingFixture,
} from "@/test/purchasing";

import { cancelOrder, createOrder, updateOrder } from "./orders";
import { getOrderByCode } from "./queries";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

const ROUNDS = 8;
const OCT = new Date("2026-10-26T03:00:00Z");

let fx: PurchasingFixture;
beforeEach(async () => {
  fx = await setupPurchasingFixture(ctx);
});

describe("purchase orders under concurrency", () => {
  it("two creates get two codes in a row", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await resetInventoryTables();
      const [a, b] = await Promise.all([
        createOrder(ctx.db, fx.sales, d3Order(fx), { now: OCT }),
        createOrder(other.db, fx.director, d3Order(fx), { now: OCT }),
      ]);
      const codes = [a, b].map((r) => (r.ok ? r.data.code : r.error)).sort();
      expect(codes).toEqual(["PO-2026-001", "PO-2026-002"]);
      // Fresh orders for the next round; the counter was reset above.
      await ctx.db.execute(sql`delete from "purchase_order"`);
    }
  });

  it("archiving a supplier while an order for it is placed: one of the two wins", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const supplierId = fx.supplier("NCC-0002");
      await updateSupplier(ctx.db, fx.director, supplierId, {
        status: "ACTIVE",
      });
      const [placed, archived] = await Promise.all([
        createOrder(ctx.db, fx.sales, d3Order(fx), { place: true }),
        updateSupplier(other.db, fx.accountant, supplierId, {
          status: "ARCHIVED",
        }),
      ]);
      expect(placed.ok !== archived.ok).toBe(true);
      if (placed.ok) {
        expect(archived).toMatchObject({
          error: `NCC-0002 còn đơn thu mua đang xử lý: ${placed.data.code}. Đóng hoặc hủy đơn trước`,
        });
        await cancelOrder(ctx.db, fx.sales, placed.data.code, "Thử");
      } else {
        expect(placed.error).toBe("Nhà cung cấp NCC-0002 đã ngừng dùng");
      }
    }
  });

  it("archiving an item while an order with it is placed: one of the two wins", async () => {
    const body = d3Order(fx);
    body.lines = [
      { itemId: fx.item("OT-06"), unit: "PIECE", quantity: "10", unitPrice: 1 },
    ];
    for (let round = 0; round < ROUNDS; round += 1) {
      await updateItem(ctx.db, fx.director, fx.item("OT-06"), {
        status: "ACTIVE",
      });
      const [placed, archived] = await Promise.all([
        createOrder(ctx.db, fx.sales, body, { place: true }),
        updateItem(other.db, fx.director, fx.item("OT-06"), {
          status: "ARCHIVED",
        }),
      ]);
      expect(placed.ok !== archived.ok).toBe(true);
      if (placed.ok) {
        expect(archived.ok ? "" : archived.error).toBe(
          `OT-06 còn trong đơn thu mua đang xử lý: ${placed.data.code}`,
        );
        await cancelOrder(ctx.db, fx.sales, placed.data.code, "Thử");
      } else {
        expect(placed.error).toBe("Vật tư OT-06 đã ngừng dùng");
      }
    }
  });

  it("cancel and edit of one order at once: the later one sees the change", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const created = await createOrder(ctx.db, fx.sales, d3Order(fx), {
        place: true,
      });
      if (!created.ok) throw new Error(created.error);
      const { code } = created.data;
      const opened = (await getOrderByCode(ctx.db, code))?.updatedAt;
      const [cancelled, edited] = await Promise.all([
        cancelOrder(ctx.db, fx.sales, code, "Thử"),
        updateOrder(other.db, fx.director, code, {
          ...d3Order(fx),
          note: "Sửa cùng lúc",
          updatedAt: opened?.toISOString(),
        }),
      ]);
      const order = await getOrderByCode(ctx.db, code);
      expect(order?.status).toBe(cancelled.ok ? "DONE" : "IN_PROGRESS");
      if (cancelled.ok && !edited.ok) {
        expect([
          PURCHASE_MESSAGES.stale,
          PURCHASE_MESSAGES.done(code),
        ]).toContain(edited.error);
      } else {
        // The edit went first: the cancel still ends the order.
        expect(edited.ok).toBe(true);
        expect(cancelled.ok).toBe(true);
        expect(order?.note).toBe("Sửa cùng lúc");
      }
    }
  });
});

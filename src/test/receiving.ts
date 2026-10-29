// Integration-test helpers for goods receipts (goods-receipt tasks 4.x).
import { asc, eq } from "drizzle-orm";

import { item, purchaseOrder, purchaseOrderLine } from "@/db/schema";
import type { ReceiptBody, ReceiptLineBody } from "@/lib/receiving/body";
import { setScrapPrice } from "@/lib/receiving/scrap-price";
import { createOrder, type OrderBody } from "@/lib/purchasing/orders";

import { createTestUser, type TestContext } from "./auth";
import {
  d3Order,
  setupPurchasingFixture,
  type PurchasingFixture,
} from "./purchasing";

export const OCT_26 = new Date("2026-10-26T03:00:00Z");

export interface ReceivingFixture extends PurchasingFixture {
  warehouse: import("./auth").TestUser;
}

/** Purchasing fixture plus Thủ kho Văn Tùng and a scrap price of 7.500 ₫/kg. */
export async function setupReceivingFixture(
  ctx: TestContext,
  options: { scrapPrice?: boolean } = {},
): Promise<ReceivingFixture> {
  const fx = await setupPurchasingFixture(ctx);
  const warehouse = await createTestUser(ctx, {
    role: "WAREHOUSE",
    username: "vantung",
    name: "Văn Tùng",
  });
  if (options.scrapPrice !== false) {
    const set = await setScrapPrice(ctx.db, fx.director, { pricePerKg: 7_500 });
    if (!set.ok) throw new Error(set.error);
  }
  return { ...fx, warehouse };
}

/** Places an order (the D3 one by default) and returns its code. */
export async function placedOrder(
  ctx: TestContext,
  fx: PurchasingFixture,
  body: OrderBody = d3Order(fx),
): Promise<string> {
  const result = await createOrder(ctx.db, fx.sales, body, {
    place: true,
    now: OCT_26,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.code;
}

/** Order line id by item code. */
export async function orderLineIds(
  ctx: TestContext,
  code: string,
): Promise<Map<string, string>> {
  const rows = await ctx.db
    .select({ id: purchaseOrderLine.id, itemCode: item.code })
    .from(purchaseOrderLine)
    .innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseOrderLine.orderId))
    .innerJoin(item, eq(item.id, purchaseOrderLine.itemId))
    .where(eq(purchaseOrder.code, code))
    .orderBy(asc(purchaseOrderLine.lineNo));
  return new Map(rows.map((row) => [row.itemCode, row.id]));
}

export function counted(
  lineId: string,
  quantity: string,
  split: ReceiptLineBody["split"],
  extra: Partial<ReceiptLineBody> = {},
): ReceiptLineBody {
  return {
    orderLineId: lineId,
    status: "COUNTED",
    quantity,
    split,
    awaitsRest: false,
    ...extra,
  };
}

export function notInTrip(lineId: string, awaitsRest = true): ReceiptLineBody {
  return {
    orderLineId: lineId,
    status: "NOT_IN_TRIP",
    quantity: "0",
    awaitsRest,
  };
}

/** Trip 1 of design D4 for the D3 order. */
export function tripOne(
  code: string,
  lines: Map<string, string>,
  draftId: string = crypto.randomUUID(),
): ReceiptBody {
  const id = (itemCode: string) => lines.get(itemCode) ?? "";
  return {
    draftId,
    orderCode: code,
    arrivedAt: "2026-10-26T02:34:00Z",
    vehicle: "29H-123.45",
    lines: [
      counted(id("GG-K17"), "196", {
        GOOD: "150",
        NEEDS_REPAIR: "34",
        SCRAP: "12",
      }),
      counted(id("GG-CH"), "400", { GOOD: "380", NEEDS_REPAIR: "20" }),
      notInTrip(id("GG-M16")),
      counted(id("PL-SAT"), "1250.5", { SCRAP: "1250.5" }),
    ],
    costs: [
      { label: "Cước xe tải", amount: 3_500_000 },
      { label: "Bốc xếp", amount: 1_200_000 },
      { label: "Cầu đường", amount: 180_000 },
    ],
  };
}

/** Trip 2 of design D4: the 150 Mâm, 500.000 ₫ freight. */
export function tripTwo(
  code: string,
  lines: Map<string, string>,
  draftId: string = crypto.randomUUID(),
): ReceiptBody {
  return {
    draftId,
    orderCode: code,
    lines: [
      counted(lines.get("GG-M16") ?? "", "150", {
        GOOD: "146",
        NEEDS_REPAIR: "4",
      }),
    ],
    costs: [{ label: "Cước xe tải", amount: 500_000 }],
  };
}

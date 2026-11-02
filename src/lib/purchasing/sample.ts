// Sample purchase orders for dev and E2E (purchase-orders design D13): the
// order of drawing D3 and a few others, created through the service. Runs
// only while there is no order yet, so running it again adds nothing.
import { asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import { item, purchaseOrder, supplier } from "@/db/schema";
import { toBusinessDate } from "@/domain/business-date";
import type { QuantityUnit } from "@/domain/quantity";
import type { Actor } from "@/lib/catalog/common";

import {
  cancelOrder,
  createOrder,
  type OrderBody,
  type OrderLineBody,
} from "./orders";

/** Suppliers of the sample orders (seedCatalog creates them). */
export const SAMPLE_SUPPLIERS = {
  used: "Chú Ba ve chai",
  new: "Cty TNHH Thép Hòa Phát Hà Nội",
} as const;

async function ids(db: Database) {
  const items = new Map(
    (
      await db
        .select({ id: item.id, code: item.code })
        .from(item)
        .where(
          inArray(item.code, [
            "GG-K17",
            "GG-CH",
            "GG-M16",
            "PL-SAT",
            "OT-06",
            "PK-KU",
          ]),
        )
    ).map((row) => [row.code, row.id]),
  );
  const suppliers = new Map(
    (
      await db
        .select({ id: supplier.id, name: supplier.name })
        .from(supplier)
        .where(inArray(supplier.name, Object.values(SAMPLE_SUPPLIERS)))
        .orderBy(asc(supplier.code))
    ).map((row) => [row.name, row.id]),
  );
  return { items, suppliers };
}

const line = (
  itemId: string | undefined,
  unit: QuantityUnit,
  quantity: string,
  unitPrice: number,
): OrderLineBody => ({ itemId, unit, quantity, unitPrice });

/** Number of orders created (0 when some already exist). */
export async function seedPurchasing(
  db: Database,
  actor: Actor,
  now = new Date(),
): Promise<number> {
  const [any] = await db
    .select({ id: purchaseOrder.id })
    .from(purchaseOrder)
    .limit(1);
  if (any) return 0;
  const { items, suppliers } = await ids(db);
  const used = suppliers.get(SAMPLE_SUPPLIERS.used);
  const fresh = suppliers.get(SAMPLE_SUPPLIERS.new);
  if (!used || !fresh) throw new Error("Run seedCatalog first: no suppliers.");
  const today = toBusinessDate(now);

  const orders: { body: OrderBody; place: boolean; cancel?: string }[] = [
    {
      // Drawing D3: 4 lines, 3 costs, split by value (design D3).
      place: true,
      body: {
        supplierId: used,
        kind: "USED",
        expectedDate: "2026-10-26",
        expectedTime: "09:30",
        vehicle: "Xe tải 29C-123.45",
        allocationMethod: "VALUE",
        lines: [
          line(items.get("GG-K17"), "PIECE", "200", 185_000),
          line(items.get("GG-CH"), "PIECE", "400", 32_000),
          line(items.get("GG-M16"), "PIECE", "150", 145_000),
          line(items.get("PL-SAT"), "KG", "1250.5", 7_500),
        ],
        costs: [
          { label: "Cước xe tải", amount: 3_500_000 },
          { label: "Bốc xếp", amount: 1_200_000 },
          { label: "Cầu đường", amount: 180_000 },
        ],
      },
    },
    {
      place: true,
      body: {
        supplierId: fresh,
        kind: "NEW",
        expectedDate: "2026-10-28",
        expectedTime: "14:00",
        allocationMethod: "WEIGHT",
        lines: [
          line(items.get("OT-06"), "PIECE", "300", 285_000),
          line(items.get("PK-KU"), "PIECE", "500", 42_000),
        ],
        costs: [{ label: "Cước xe tải", amount: 2_000_000 }],
      },
    },
    {
      place: false,
      body: {
        supplierId: used,
        kind: "USED",
        expectedDate: "2026-10-30",
        lines: [line(items.get("GG-K17"), "KG", "2000", 14_000)],
      },
    },
    {
      place: true,
      cancel: "Người bán bán cho chỗ khác",
      body: {
        supplierId: used,
        kind: "USED",
        expectedDate: "2026-10-21",
        lines: [line(items.get("PL-SAT"), "KG", "1200", 8_000)],
      },
    },
    {
      // Arrives today: the "xe sắp về" reminder of D2.
      place: true,
      body: {
        supplierId: fresh,
        kind: "NEW",
        expectedDate: today,
        lines: [line(items.get("GG-CH"), "PIECE", "100", 33_000)],
        costs: [{ label: "Bốc xếp", amount: 300_000 }],
      },
    },
  ];

  let count = 0;
  for (const order of orders) {
    const created = await createOrder(db, actor, order.body, {
      place: order.place,
      now,
    });
    if (!created.ok) throw new Error(`Đơn mẫu: ${created.error}`);
    if (order.cancel) {
      const cancelled = await cancelOrder(
        db,
        actor,
        created.data.code,
        order.cancel,
      );
      if (!cancelled.ok) throw new Error(`Đơn mẫu: ${cancelled.error}`);
    }
    count += 1;
  }
  return count;
}

/** Code of the D3 sample order, for screenshots and checks. */
export async function sampleD3OrderCode(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ code: purchaseOrder.code })
    .from(purchaseOrder)
    .where(eq(purchaseOrder.vehicle, "Xe tải 29C-123.45"))
    .orderBy(asc(purchaseOrder.createdAt))
    .limit(1);
  return row?.code ?? null;
}

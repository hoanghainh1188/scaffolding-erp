// Sample goods receipts for dev and E2E (goods-receipt design D14): a scrap
// price, and an order like PO-2026-051 of drawing D3b with two trips
// posted, so D3b and M1 show an order "Đang nhận" waiting for 40 Mâm.
// Runs only while there is no receipt yet.
import { eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  documentCounter,
  goodsReceipt,
  item,
  location,
  purchaseOrderLine,
  purchaseOrder,
  supplier,
} from "@/db/schema";
import { toBusinessDate } from "@/domain/business-date";
import { RECEIPT_PREFIX } from "@/domain/goods-receipt";
import type { Actor } from "@/lib/catalog/common";
import { createOrder } from "@/lib/purchasing/orders";
import { SAMPLE_SUPPLIERS } from "@/lib/purchasing/sample";

import type { ReceiptBody, ReceiptLineBody } from "./body";
import { postReceipt } from "./post";
import { currentScrapPrice, setScrapPrice } from "./scrap-price";

/** The sample ledger already uses PN-2026-087; real receipts start after. */
const FIRST_FREE_NUMBER = 89;

/** Note of the sample receiving order, to find it again. */
export const SAMPLE_RECEIVING_NOTE = "Đơn mẫu đang nhận (D3b)";

async function bumpCounter(db: Database, year: number) {
  await db
    .insert(documentCounter)
    .values({ prefix: RECEIPT_PREFIX, year, lastNumber: FIRST_FREE_NUMBER })
    .onConflictDoUpdate({
      target: [documentCounter.prefix, documentCounter.year],
      set: {
        lastNumber: sql`greatest(${documentCounter.lastNumber}, ${FIRST_FREE_NUMBER})`,
      },
    });
}

const counted = (
  id: string,
  quantity: string,
  extra: Partial<ReceiptLineBody> = {},
): ReceiptLineBody => ({
  orderLineId: id,
  status: "COUNTED",
  quantity,
  split: { GOOD: quantity },
  awaitsRest: false,
  ...extra,
});

const notInTrip = (id: string): ReceiptLineBody => ({
  orderLineId: id,
  status: "NOT_IN_TRIP",
  quantity: "0",
  awaitsRest: true,
});

/**
 * When the sample trips are posted: a fixed day, so D11 and D3b show the
 * same dates whatever day the seed runs (the sample ledger ends 22/10).
 */
export const SAMPLE_RECEIVING_AT = new Date("2026-10-24T03:00:00Z");

/** Number of receipts created (0 when some already exist). */
export async function seedReceiving(
  db: Database,
  actors: { director: Actor; warehouse: Actor },
  now = SAMPLE_RECEIVING_AT,
): Promise<number> {
  const [any] = await db
    .select({ id: goodsReceipt.id })
    .from(goodsReceipt)
    .limit(1);
  if (any) return 0;
  if (!(await currentScrapPrice(db))) {
    await setScrapPrice(db, actors.director, { pricePerKg: 7_500 });
  }
  await bumpCounter(db, Number(toBusinessDate(now).slice(0, 4)));

  const [seller] = await db
    .select({ id: supplier.id })
    .from(supplier)
    .where(eq(supplier.name, SAMPLE_SUPPLIERS.used));
  const items = new Map(
    (
      await db
        .select({ id: item.id, code: item.code })
        .from(item)
        .where(
          inArray(item.code, ["GG-K17", "GG-CH", "GG-M16", "PK-KU", "PL-SAT"]),
        )
    ).map((row) => [row.code, row.id]),
  );
  const [yard] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  if (!seller || !yard) throw new Error("Run seedCatalog first.");
  const created = await createOrder(
    db,
    actors.director,
    {
      supplierId: seller.id,
      kind: "USED",
      // Fixed, so D3b screenshots do not change with the day; late orders
      // still show on M1.
      expectedDate: "2026-10-24",
      vehicle: "29C-123.45",
      note: SAMPLE_RECEIVING_NOTE,
      allocationMethod: "VALUE",
      lines: [
        ["GG-K17", "PIECE", "200", 190_000],
        ["GG-CH", "PIECE", "200", 22_500],
        ["GG-M16", "PIECE", "100", 145_000],
        ["PK-KU", "PIECE", "50", 40_000],
        ["PL-SAT", "KG", "200", 8_200],
      ].map(([code, unit, quantity, unitPrice]) => ({
        itemId: items.get(code as string),
        unit: unit as string,
        quantity: quantity as string,
        unitPrice: unitPrice as number,
      })),
      costs: [{ label: "Cước xe tải", amount: 1_500_000 }],
    },
    { place: true, now },
  );
  if (!created.ok) throw new Error(`Đơn mẫu: ${created.error}`);
  const lines = new Map(
    (
      await db
        .select({ id: purchaseOrderLine.id, itemId: purchaseOrderLine.itemId })
        .from(purchaseOrderLine)
        .innerJoin(
          purchaseOrder,
          eq(purchaseOrder.id, purchaseOrderLine.orderId),
        )
        .where(eq(purchaseOrder.code, created.data.code))
    ).map((row) => [
      [...items].find(([, id]) => id === row.itemId)?.[0] ?? "",
      row.id,
    ]),
  );
  const id = (code: string) => lines.get(code) ?? "";
  const trips: ReceiptBody[] = [
    {
      lines: [
        counted(id("GG-K17"), "120", { awaitsRest: true }),
        counted(id("GG-CH"), "200"),
        counted(id("GG-M16"), "60", { awaitsRest: true }),
        notInTrip(id("PK-KU")),
        counted(id("PL-SAT"), "212.5", { split: { SCRAP: "212.5" } }),
      ],
      costs: [
        { label: "Cước xe tải", amount: 1_500_000 },
        { label: "Bốc xếp", amount: 300_000 },
      ],
      confirmedOverrides: ["costs"],
    },
    {
      lines: [
        counted(id("GG-K17"), "80"),
        notInTrip(id("GG-M16")),
        counted(id("PK-KU"), "50"),
      ],
      costs: [{ label: "Cước xe tải", amount: 500_000 }],
    },
  ];
  for (const trip of trips) {
    const posted = await postReceipt(
      db,
      actors.warehouse,
      {
        ...trip,
        draftId: crypto.randomUUID(),
        orderCode: created.data.code,
        locationId: yard.id,
        vehicle: "29C-123.45",
      },
      { now },
    );
    if (!posted.ok) throw new Error(`Phiếu nhập mẫu: ${posted.error}`);
  }
  return trips.length;
}

/** Code of the sample receiving order, for screenshots and checks. */
export async function sampleReceivingOrderCode(
  db: Database,
): Promise<string | null> {
  const [row] = await db
    .select({ code: purchaseOrder.code })
    .from(purchaseOrder)
    .where(eq(purchaseOrder.note, SAMPLE_RECEIVING_NOTE))
    .limit(1);
  return row?.code ?? null;
}

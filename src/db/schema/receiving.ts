// Goods receipts (goods-receipt, design D8): one row per posted truck trip.
// A receipt exists only once it is posted; drafts live on the phone (D1).
// Money is not stored here: goods value comes from the order line price and
// the allocated costs come back from the inventory ledger (D8). Posted
// receipts never change: the three tables are append-only (payables D5).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { item, location } from "./catalog";
import { purchaseOrder, purchaseOrderLine } from "./purchasing";

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "restrict" });

/** Reference scrap price per kg (design D9). Append-only by trigger. */
export const scrapPrice = pgTable(
  "scrap_price",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    pricePerKg: bigint("price_per_kg", { mode: "number" }).notNull(),
    note: text("note"),
    createdBy: userRef("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("scrap_price_value_check", sql`${table.pricePerKg} > 0`)],
);

export const goodsReceipt = pgTable(
  "goods_receipt",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => purchaseOrder.id, { onDelete: "restrict" }),
    tripNo: integer("trip_no").notNull(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    clientDraftId: uuid("client_draft_id").notNull().unique(),
    businessDate: date("business_date").notNull(),
    /** Due date of what the seller is owed (payables design D2, 0.2 #99). */
    dueDate: date("due_date").notNull(),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    vehicle: text("vehicle"),
    scrapPriceId: bigint("scrap_price_id", { mode: "number" }).references(
      () => scrapPrice.id,
      { onDelete: "restrict" },
    ),
    scrapPricePerKg: bigint("scrap_price_per_kg", { mode: "number" }),
    postingId: uuid("posting_id").notNull(),
    createdBy: userRef("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("goods_receipt_trip_check", sql`${table.tripNo} > 0`),
    check(
      "goods_receipt_scrap_price_check",
      sql`(${table.scrapPriceId} is null) = (${table.scrapPricePerKg} is null)`,
    ),
    unique("goods_receipt_trip_unique").on(table.orderId, table.tripNo),
    index("goods_receipt_order_idx").on(table.orderId),
    index("goods_receipt_date_idx").on(table.businessDate),
  ],
);

export const goodsReceiptLine = pgTable(
  "goods_receipt_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => goodsReceipt.id, { onDelete: "restrict" }),
    lineNo: integer("line_no").notNull(),
    orderLineId: uuid("order_line_id")
      .notNull()
      .references(() => purchaseOrderLine.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    weighedKg: numeric("weighed_kg", { precision: 14, scale: 3 }),
    qtyNew: numeric("qty_new", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    qtyGood: numeric("qty_good", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    qtyNeedsRepair: numeric("qty_needs_repair", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    qtyScrap: numeric("qty_scrap", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    awaitsRest: boolean("awaits_rest").notNull().default(false),
  },
  (table) => [
    check(
      "goods_receipt_line_status_check",
      sql`${table.status} in ('COUNTED', 'NOT_IN_TRIP')`,
    ),
    check(
      "goods_receipt_line_values_check",
      sql`${table.quantity} >= 0 and (${table.weighedKg} is null or ${table.weighedKg} > 0) and ${table.qtyNew} >= 0 and ${table.qtyGood} >= 0 and ${table.qtyNeedsRepair} >= 0 and ${table.qtyScrap} >= 0`,
    ),
    check(
      "goods_receipt_line_split_check",
      sql`${table.qtyNew} + ${table.qtyGood} + ${table.qtyNeedsRepair} + ${table.qtyScrap} = ${table.quantity}`,
    ),
    check(
      "goods_receipt_line_state_check",
      sql`(${table.status} = 'NOT_IN_TRIP' and ${table.quantity} = 0 and ${table.weighedKg} is null) or (${table.status} = 'COUNTED' and ${table.quantity} > 0)`,
    ),
    unique("goods_receipt_line_order_line_unique").on(
      table.receiptId,
      table.orderLineId,
    ),
    index("goods_receipt_line_order_line_idx").on(table.orderLineId),
  ],
);

export const goodsReceiptCost = pgTable(
  "goods_receipt_cost",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => goodsReceipt.id, { onDelete: "restrict" }),
    lineNo: integer("line_no").notNull(),
    label: text("label").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
  },
  (table) => [
    check(
      "goods_receipt_cost_values_check",
      sql`${table.amount} > 0 and length(${table.label}) between 1 and 60`,
    ),
    index("goods_receipt_cost_receipt_idx").on(table.receiptId, table.lineNo),
  ],
);

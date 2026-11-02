// Purchase orders (purchase-orders, design D7). An order only holds the
// expected lines and costs: it never posts to the inventory ledger (D1).
// Totals are not stored; they are computed from the lines.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { item, supplier } from "./catalog";
import { UNIT_SQL } from "./units";

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "restrict" });

export const purchaseOrder = pgTable(
  "purchase_order",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("DRAFT"),
    outcome: text("outcome"),
    expectedDate: date("expected_date"),
    expectedTime: time("expected_time"),
    vehicle: text("vehicle"),
    note: text("note"),
    allocationMethod: text("allocation_method").notNull().default("VALUE"),
    endReason: text("end_reason"),
    createdBy: userRef("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    placedBy: userRef("placed_by"),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    endedBy: userRef("ended_by"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    check("purchase_order_kind_check", sql`${table.kind} in ('NEW', 'USED')`),
    check(
      "purchase_order_status_check",
      sql`${table.status} in ('DRAFT', 'IN_PROGRESS', 'DONE')`,
    ),
    check(
      "purchase_order_outcome_check",
      sql`(${table.status} = 'DONE') = (${table.outcome} is not null) and (${table.outcome} is null or ${table.outcome} in ('RECEIVED', 'CLOSED', 'CANCELLED'))`,
    ),
    check(
      "purchase_order_expected_check",
      sql`${table.status} = 'DRAFT' or ${table.expectedDate} is not null`,
    ),
    check(
      "purchase_order_cancel_check",
      sql`${table.outcome} is distinct from 'CANCELLED' or ${table.endReason} is not null`,
    ),
    check(
      "purchase_order_allocation_check",
      sql`${table.allocationMethod} in ('VALUE', 'WEIGHT')`,
    ),
    index("purchase_order_status_idx").on(table.status, table.expectedDate),
    index("purchase_order_supplier_idx").on(table.supplierId),
  ],
);

export const purchaseOrderLine = pgTable(
  "purchase_order_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => purchaseOrder.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    unit: text("unit").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
  },
  (table) => [
    check("purchase_order_line_unit_check", sql`${table.unit} in ${UNIT_SQL}`),
    check(
      "purchase_order_line_values_check",
      sql`${table.quantity} > 0 and ${table.unitPrice} >= 0`,
    ),
    unique("purchase_order_line_item_unique").on(table.orderId, table.itemId),
    index("purchase_order_line_item_idx").on(table.itemId),
  ],
);

export const purchaseOrderCost = pgTable(
  "purchase_order_cost",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => purchaseOrder.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    label: text("label").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
  },
  (table) => [
    check(
      "purchase_order_cost_values_check",
      sql`${table.amount} > 0 and length(${table.label}) between 1 and 60`,
    ),
    index("purchase_order_cost_order_idx").on(table.orderId, table.lineNo),
  ],
);

/** Append-only history of an order (D7); goods-receipt adds its kinds. */
export const purchaseOrderEvent = pgTable(
  "purchase_order_event",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => purchaseOrder.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    actorId: userRef("actor_id").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "purchase_order_event_kind_check",
      sql`${table.kind} in ('CREATED', 'PLACED', 'UPDATED', 'CANCELLED', 'CLOSED', 'RECEIPT_POSTED', 'BACKORDER_MARKED', 'RECEIVED')`,
    ),
    index("purchase_order_event_order_idx").on(table.orderId, table.id),
  ],
);

// Inventory ledger (inventory-ledger, design D1, D4, D8). The ledger is
// append-only: triggers in drizzle/0003_inventory_ledger.sql refuse UPDATE,
// DELETE and TRUNCATE. inventory_cost is the one stored figure next to it,
// written in the same transaction and reconciled by `npm run inventory:check`.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { item, location } from "./catalog";

const CONDITIONS_SQL = sql.raw(`('NEW', 'GOOD', 'NEEDS_REPAIR', 'SCRAP')`);

/** Same list as src/domain/movement.ts. */
const MOVEMENTS_IN = [
  "OPENING",
  "PURCHASE_IN",
  "REPAIR_IN",
  "DELIVERY_IN",
  "RETURN_IN",
  "TRANSFER_IN",
  "ADJUST_IN",
];
const MOVEMENTS_OUT = [
  "REPAIR_OUT",
  "DELIVERY_OUT",
  "RETURN_OUT",
  "TRANSFER_OUT",
  "SALE_OUT",
  "ADJUST_OUT",
];
const sqlList = (values: string[]) =>
  sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`);

export const inventoryLedger = pgTable(
  "inventory_ledger",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    postingId: uuid("posting_id").notNull(),
    businessDate: date("business_date").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    condition: text("condition").notNull(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    movement: text("movement").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: bigint("unit_cost", { mode: "number" }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    avgCostAfter: bigint("avg_cost_after", { mode: "number" }).notNull(),
    poolQuantityAfter: numeric("pool_quantity_after", {
      precision: 14,
      scale: 3,
    }).notNull(),
    weighedKg: numeric("weighed_kg", { precision: 14, scale: 3 }),
    documentType: text("document_type").notNull(),
    documentId: uuid("document_id"),
    documentCode: text("document_code").notNull(),
    description: text("description").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "inventory_ledger_condition_check",
      sql`${table.condition} in ${CONDITIONS_SQL}`,
    ),
    check(
      "inventory_ledger_movement_check",
      sql`(${table.movement} in ${sqlList(MOVEMENTS_IN)} and ${table.quantity} > 0) or (${table.movement} in ${sqlList(MOVEMENTS_OUT)} and ${table.quantity} < 0)`,
    ),
    check(
      "inventory_ledger_cost_check",
      sql`${table.unitCost} >= 0 and ${table.avgCostAfter} >= 0 and ${table.poolQuantityAfter} >= 0 and coalesce(${table.weighedKg}, 0) >= 0`,
    ),
    index("inventory_ledger_stock_idx").on(
      table.itemId,
      table.condition,
      table.locationId,
    ),
    index("inventory_ledger_location_idx").on(table.locationId),
    index("inventory_ledger_card_idx").on(
      table.itemId,
      table.businessDate,
      table.id,
    ),
    index("inventory_ledger_document_idx").on(
      table.documentType,
      table.documentId,
    ),
  ],
);

export const inventoryCost = pgTable(
  "inventory_cost",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    condition: text("condition").notNull(),
    avgCost: bigint("avg_cost", { mode: "number" }),
    poolQuantity: numeric("pool_quantity", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    lastBusinessDate: date("last_business_date"),
    lastLedgerId: bigint("last_ledger_id", { mode: "number" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.condition] }),
    check(
      "inventory_cost_condition_check",
      sql`${table.condition} in ${CONDITIONS_SQL}`,
    ),
    check(
      "inventory_cost_values_check",
      sql`coalesce(${table.avgCost}, 0) >= 0 and ${table.poolQuantity} >= 0`,
    ),
  ],
);

export const stockAdjustment = pgTable(
  "stock_adjustment",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("DRAFT"),
    reason: text("reason").notNull(),
    relatedDocumentCode: text("related_document_code"),
    openingDate: date("opening_date"),
    returnedReason: text("returned_reason"),
    postingId: uuid("posting_id"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedBy: text("submitted_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: text("approved_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    returnedBy: text("returned_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "stock_adjustment_kind_check",
      sql`${table.kind} in ('ADJUSTMENT', 'OPENING')`,
    ),
    check(
      "stock_adjustment_status_check",
      sql`${table.status} in ('DRAFT', 'PENDING_APPROVAL', 'DONE')`,
    ),
    check(
      "stock_adjustment_opening_check",
      sql`(${table.kind} = 'OPENING') = (${table.openingDate} is not null)`,
    ),
    check(
      "stock_adjustment_done_check",
      sql`(${table.status} = 'DONE') = (${table.postingId} is not null)`,
    ),
    index("stock_adjustment_status_idx").on(table.status, table.createdAt),
  ],
);

export const stockAdjustmentLine = pgTable(
  "stock_adjustment_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    adjustmentId: uuid("adjustment_id")
      .notNull()
      .references(() => stockAdjustment.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    lineType: text("line_type").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    condition: text("condition").notNull(),
    toCondition: text("to_condition"),
    locationId: uuid("location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    toLocationId: uuid("to_location_id").references(() => location.id, {
      onDelete: "restrict",
    }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: bigint("unit_cost", { mode: "number" }),
  },
  (table) => [
    check(
      "stock_adjustment_line_type_check",
      sql`${table.lineType} in ('QUANTITY', 'CONDITION', 'LOCATION', 'OPENING')`,
    ),
    check(
      "stock_adjustment_line_condition_check",
      sql`${table.condition} in ${CONDITIONS_SQL} and (${table.toCondition} is null or ${table.toCondition} in ${CONDITIONS_SQL})`,
    ),
    check(
      "stock_adjustment_line_shape_check",
      sql`(${table.lineType} = 'QUANTITY' and ${table.quantity} <> 0 and ${table.toCondition} is null and ${table.toLocationId} is null)
        or (${table.lineType} = 'CONDITION' and ${table.quantity} > 0 and ${table.toCondition} is not null and ${table.toCondition} <> ${table.condition} and ${table.toLocationId} is null)
        or (${table.lineType} = 'LOCATION' and ${table.quantity} > 0 and ${table.toLocationId} is not null and ${table.toLocationId} <> ${table.locationId} and ${table.toCondition} is null)
        or (${table.lineType} = 'OPENING' and ${table.quantity} > 0 and ${table.unitCost} is not null and ${table.toCondition} is null and ${table.toLocationId} is null)`,
    ),
    check(
      "stock_adjustment_line_cost_check",
      sql`coalesce(${table.unitCost}, 0) >= 0`,
    ),
    index("stock_adjustment_line_adjustment_idx").on(
      table.adjustmentId,
      table.lineNo,
    ),
  ],
);

/** Yearly document numbers (ĐC-2026-004, TĐK-2026-001; later PN, PX...). */
export const documentCounter = pgTable(
  "document_counter",
  {
    prefix: text("prefix").notNull(),
    year: integer("year").notNull(),
    lastNumber: integer("last_number").notNull(),
  },
  (table) => [primaryKey({ columns: [table.prefix, table.year] })],
);

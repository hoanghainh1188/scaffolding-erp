// Production (production-orders design D1, D9): finished goods made from
// supplies. A BOM per finished item, one shared scrap item for the offcuts,
// and orders that take a copy of the BOM when assigned. Separate tables from
// repair orders: a production line has nothing taken in. Amounts are written
// once, on posting; before that everything is computed.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
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

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "restrict" });

const at = (name: string) => timestamp(name, { withTimezone: true });

const quantity = (name: string) => numeric(name, { precision: 14, scale: 3 });

export const productionBom = pgTable(
  "production_bom",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    itemId: uuid("item_id")
      .notNull()
      .unique()
      .references(() => item.id, { onDelete: "restrict" }),
    /** ₫ per finished piece. */
    laborRate: bigint("labor_rate", { mode: "number" }).notNull(),
    note: text("note"),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedBy: userRef("updated_by").notNull(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("production_bom_labor_check", sql`${table.laborRate} >= 0`),
    check(
      "production_bom_note_check",
      sql`${table.note} is null or length(${table.note}) between 1 and 500`,
    ),
  ],
);

export const productionBomMaterial = pgTable(
  "production_bom_material",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    bomId: uuid("bom_id")
      .notNull()
      .references(() => productionBom.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    quantityPerUnit: quantity("quantity_per_unit").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    check(
      "production_bom_material_quantity_check",
      sql`${table.quantityPerUnit} > 0`,
    ),
    unique("production_bom_material_unique").on(table.bomId, table.itemId),
    index("production_bom_material_item_idx").on(table.itemId),
  ],
);

/** One row: which item receives the offcuts (0.2 số 152). */
export const productionSetting = pgTable(
  "production_setting",
  {
    id: integer("id").primaryKey().default(1),
    scrapItemId: uuid("scrap_item_id").references(() => item.id, {
      onDelete: "restrict",
    }),
    updatedBy: userRef("updated_by").notNull(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (table) => [check("production_setting_single_check", sql`${table.id} = 1`)],
);

export const productionOrder = pgTable(
  "production_order",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    status: text("status").notNull().default("DRAFT"),
    workshopId: uuid("workshop_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    /** The yard the finished goods and the offcuts go to (0.2 số 146). */
    toLocationId: uuid("to_location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    team: text("team"),
    note: text("note"),
    assignedBy: userRef("assigned_by"),
    assignedAt: at("assigned_at"),
    receivedBy: userRef("received_by"),
    receivedAt: at("received_at"),
    reportedBy: userRef("reported_by"),
    reportedAt: at("reported_at"),
    countedBy: userRef("counted_by"),
    countedAt: at("counted_at"),
    approvedBy: userRef("approved_by"),
    approvedAt: at("approved_at"),
    approveNote: text("approve_note"),
    returnedBy: userRef("returned_by"),
    returnedAt: at("returned_at"),
    returnNote: text("return_note"),
    cancelledBy: userRef("cancelled_by"),
    cancelledAt: at("cancelled_at"),
    cancelReason: text("cancel_reason"),
    postedBy: userRef("posted_by"),
    postedAt: at("posted_at"),
    /** Read on posting, only when the order has offcuts. */
    scrapItemId: uuid("scrap_item_id").references(() => item.id, {
      onDelete: "restrict",
    }),
    scrapPriceUsed: bigint("scrap_price_used", { mode: "number" }),
    postingId: uuid("posting_id"),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "production_order_status_check",
      sql`${table.status} in ('DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_CHECK', 'AWAITING_APPROVAL', 'COUNTED', 'POSTED', 'CANCELLED')`,
    ),
    check(
      "production_order_cancelled_check",
      sql`(${table.status} = 'CANCELLED') = (${table.cancelReason} is not null and ${table.cancelledBy} is not null and ${table.cancelledAt} is not null)`,
    ),
    check(
      "production_order_posted_check",
      sql`(${table.status} = 'POSTED') = (${table.postedBy} is not null and ${table.postedAt} is not null and ${table.postingId} is not null)`,
    ),
    check(
      "production_order_text_check",
      sql`(${table.team} is null or length(${table.team}) between 1 and 100) and (${table.note} is null or length(${table.note}) between 1 and 500) and (${table.approveNote} is null or length(${table.approveNote}) between 1 and 500) and (${table.returnNote} is null or length(${table.returnNote}) between 1 and 500) and (${table.cancelReason} is null or length(${table.cancelReason}) between 1 and 500)`,
    ),
    check(
      "production_order_scrap_price_check",
      sql`${table.scrapPriceUsed} is null or ${table.scrapPriceUsed} > 0`,
    ),
    index("production_order_status_idx").on(table.status, table.createdAt),
  ],
);

export const productionOrderLine = pgTable(
  "production_order_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => productionOrder.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    quantityPlanned: quantity("quantity_planned").notNull(),
    /** ₫ per piece, taken on assignment; null while a draft. */
    laborRate: bigint("labor_rate", { mode: "number" }),
    /** What the workshop reported (kept when the storekeeper differs). */
    reportedFinished: quantity("reported_finished"),
    reportedOffcutKg: quantity("reported_offcut_kg"),
    /** What the storekeeper counted: the numbers posted. */
    quantityFinished: quantity("quantity_finished"),
    offcutKg: quantity("offcut_kg"),
    /** Set when posting. */
    laborAmount: bigint("labor_amount", { mode: "number" }),
    materialAmount: bigint("material_amount", { mode: "number" }),
    offcutAmount: bigint("offcut_amount", { mode: "number" }),
    finishedAmount: bigint("finished_amount", { mode: "number" }),
  },
  (table) => [
    check(
      "production_order_line_planned_check",
      sql`${table.quantityPlanned} > 0 and ${table.quantityPlanned} = trunc(${table.quantityPlanned})`,
    ),
    check(
      "production_order_line_figures_check",
      sql`coalesce(${table.laborRate}, 0) >= 0 and coalesce(${table.reportedFinished}, 0) >= 0 and coalesce(${table.reportedOffcutKg}, 0) >= 0 and coalesce(${table.quantityFinished}, 0) >= 0 and coalesce(${table.offcutKg}, 0) >= 0 and coalesce(${table.laborAmount}, 0) >= 0 and coalesce(${table.materialAmount}, 0) >= 0 and coalesce(${table.offcutAmount}, 0) >= 0 and coalesce(${table.finishedAmount}, 1) > 0`,
    ),
    unique("production_order_line_item_unique").on(table.orderId, table.itemId),
    index("production_order_line_item_idx").on(table.itemId),
  ],
);

export const productionOrderMaterial = pgTable(
  "production_order_material",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    lineId: uuid("line_id")
      .notNull()
      .references(() => productionOrderLine.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    /** Per finished piece, taken on assignment; null: added by the workshop. */
    normPerUnit: quantity("norm_per_unit"),
    reportedQuantity: quantity("reported_quantity"),
    quantity: quantity("quantity"),
    /** Set when posting: − the ledger lines of (line, material). */
    amount: bigint("amount", { mode: "number" }),
  },
  (table) => [
    check(
      "production_order_material_check",
      sql`coalesce(${table.normPerUnit}, 1) > 0 and coalesce(${table.reportedQuantity}, 0) >= 0 and coalesce(${table.quantity}, 0) >= 0 and coalesce(${table.amount}, 0) >= 0`,
    ),
    unique("production_order_material_unique").on(table.lineId, table.itemId),
    index("production_order_material_item_idx").on(table.itemId),
  ],
);

/** Every phone draft id an order has used (design D9). Append-only. */
export const productionOrderSubmission = pgTable(
  "production_order_submission",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => productionOrder.id, { onDelete: "restrict" }),
    step: text("step").notNull(),
    draftId: uuid("draft_id").notNull().unique(),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "production_order_submission_step_check",
      sql`${table.step} in ('RECEIVE', 'REPORT', 'COUNT')`,
    ),
    index("production_order_submission_order_idx").on(table.orderId),
  ],
);

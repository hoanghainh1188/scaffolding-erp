// Repair slips (simple-repair, design D8) and repair work orders
// (repair-work-orders, design D1, D7): needs-repair stock goes to Good or
// Scrap. A simple slip stores what the user types; a work order also keeps
// the labour rate taken on assignment, what the workshop reported and the
// labour and supply amounts fixed on posting. Every other figure is read
// back from the ledger.
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
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { item, location } from "./catalog";

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "restrict" });

export const repairOrder = pgTable(
  "repair_order",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    /** SIMPLE: the old one-step slip; WORK_ORDER: the full flow. */
    kind: text("kind").notNull().default("SIMPLE"),
    status: text("status").notNull().default("DRAFT"),
    /** Day the repair was done: shown on the slip, not used by the ledger. */
    repairDate: date("repair_date").notNull(),
    repairedBy: text("repaired_by"),
    note: text("note"),
    fromLocationId: uuid("from_location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    toLocationId: uuid("to_location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    /** ₫/kg read when posting, only when the slip has scrap. */
    scrapPriceUsed: bigint("scrap_price_used", { mode: "number" }),
    confirmedNote: text("confirmed_note"),
    postingId: uuid("posting_id"),
    createdBy: userRef("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    postedBy: userRef("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    // Work-order steps (repair-work-orders design D7). For a work order
    // to_location_id is the workshop; from_location_id is where the stock
    // is taken from and where Good and Scrap go back to (0.2 số 130).
    assignedBy: userRef("assigned_by"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    receivedBy: userRef("received_by"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receivePostingId: uuid("receive_posting_id"),
    reportedBy: userRef("reported_by"),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    countedBy: userRef("counted_by"),
    countedAt: timestamp("counted_at", { withTimezone: true }),
    returnedBy: userRef("returned_by"),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnNote: text("return_note"),
    cancelledBy: userRef("cancelled_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    cancelPostingId: uuid("cancel_posting_id"),
  },
  (table) => [
    check(
      "repair_order_status_check",
      sql`(${table.kind} = 'SIMPLE' and ${table.status} in ('DRAFT', 'POSTED')) or (${table.kind} = 'WORK_ORDER' and ${table.status} in ('DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_CHECK', 'COUNTED', 'POSTED', 'CANCELLED'))`,
    ),
    check(
      "repair_order_kind_check",
      sql`${table.kind} in ('SIMPLE', 'WORK_ORDER')`,
    ),
    check(
      "repair_order_reason_check",
      sql`(${table.returnNote} is null or length(${table.returnNote}) between 1 and 500) and (${table.cancelReason} is null or length(${table.cancelReason}) between 1 and 500) and ((${table.status} = 'CANCELLED') = (${table.cancelReason} is not null and ${table.cancelledBy} is not null and ${table.cancelledAt} is not null))`,
    ),
    check(
      "repair_order_posted_check",
      sql`(${table.status} <> 'POSTED' and ${table.postedBy} is null and ${table.postedAt} is null and ${table.postingId} is null) or (${table.status} = 'POSTED' and ${table.postedBy} is not null and ${table.postedAt} is not null and ${table.postingId} is not null)`,
    ),
    check(
      "repair_order_text_check",
      sql`(${table.repairedBy} is null or length(${table.repairedBy}) between 1 and 100) and (${table.note} is null or length(${table.note}) between 1 and 500)`,
    ),
    check(
      "repair_order_scrap_price_check",
      sql`${table.scrapPriceUsed} is null or ${table.scrapPriceUsed} > 0`,
    ),
    index("repair_order_status_idx").on(table.status, table.createdAt),
  ],
);

export const repairOrderLine = pgTable(
  "repair_order_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => repairOrder.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    quantityTaken: numeric("quantity_taken", {
      precision: 14,
      scale: 3,
    }).notNull(),
    quantityGood: numeric("quantity_good", {
      precision: 14,
      scale: 3,
    }).notNull(),
    quantityScrap: numeric("quantity_scrap", {
      precision: 14,
      scale: 3,
    }).notNull(),
    repairCost: bigint("repair_cost", { mode: "number" }).notNull(),
    /** Set when posting: value lost on a line with nothing repaired. */
    lossAmount: bigint("loss_amount", { mode: "number" }),
    /** Work order: ₫ per repaired piece, taken on assignment (0.2 số 126). */
    laborRate: bigint("labor_rate", { mode: "number" }),
    /** Work order: what the workshop reported (the storekeeper may differ). */
    reportedGood: numeric("reported_good", { precision: 14, scale: 3 }),
    reportedScrap: numeric("reported_scrap", { precision: 14, scale: 3 }),
    /** Work order, set when posting: repaired × rate, and supplies issued. */
    laborAmount: bigint("labor_amount", { mode: "number" }),
    /** Supplies of the line out of the ledger; 0 on simple slips (D3). */
    materialAmount: bigint("material_amount", { mode: "number" })
      .notNull()
      .default(0),
  },
  (table) => [
    check(
      "repair_order_line_quantity_check",
      sql`${table.quantityTaken} > 0 and ${table.quantityGood} >= 0 and ${table.quantityScrap} >= 0 and (${table.quantityGood} + ${table.quantityScrap} = ${table.quantityTaken} or (${table.quantityGood} = 0 and ${table.quantityScrap} = 0))`,
    ),
    check(
      "repair_order_line_work_check",
      sql`coalesce(${table.laborRate}, 0) >= 0 and coalesce(${table.laborAmount}, 0) >= 0 and ${table.materialAmount} >= 0 and coalesce(${table.reportedGood}, 0) >= 0 and coalesce(${table.reportedScrap}, 0) >= 0`,
    ),
    check(
      "repair_order_line_cost_check",
      sql`${table.repairCost} >= 0 and (${table.repairCost} = 0 or ${table.quantityGood} > 0)`,
    ),
    check(
      "repair_order_line_loss_check",
      sql`${table.lossAmount} is null or (${table.lossAmount} >= 0 and (${table.lossAmount} = 0 or ${table.quantityGood} = 0))`,
    ),
    unique("repair_order_line_item_unique").on(table.orderId, table.itemId),
    index("repair_order_line_item_idx").on(table.itemId),
  ],
);

/** Supplies a work-order line used (0.2 số 118); amount fixed on posting. */
export const repairOrderMaterial = pgTable(
  "repair_order_material",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    lineId: uuid("line_id")
      .notNull()
      .references(() => repairOrderLine.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    amount: bigint("amount", { mode: "number" }),
  },
  (table) => [
    check(
      "repair_order_material_check",
      sql`${table.quantity} > 0 and coalesce(${table.amount}, 0) >= 0`,
    ),
    unique("repair_order_material_unique").on(table.lineId, table.itemId),
    index("repair_order_material_item_idx").on(table.itemId),
  ],
);

/**
 * Every phone draft id a work order has used (design D5): a late resend of
 * an earlier step is known even after the order moved on. Append-only.
 */
export const repairOrderSubmission = pgTable(
  "repair_order_submission",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => repairOrder.id, { onDelete: "restrict" }),
    step: text("step").notNull(),
    draftId: uuid("draft_id").notNull().unique(),
    createdBy: userRef("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "repair_order_submission_step_check",
      sql`${table.step} in ('RECEIVE', 'REPORT', 'COUNT')`,
    ),
    index("repair_order_submission_order_idx").on(table.orderId),
  ],
);

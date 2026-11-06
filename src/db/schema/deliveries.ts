// Delivery notes (deliveries design D10): one row per truck trip of a
// contract, planned by the office, picked and posted by the warehouse.
// Rental lines have no condition (picked as NEW or GOOD); sale lines carry
// the condition and pricing unit of their contract line. A posted or
// cancelled note is frozen by a trigger, child rows included.
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
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { item, kit, location } from "./catalog";
import { contract, contractRevision } from "./contracts";

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "restrict" });

const at = (name: string) => timestamp(name, { withTimezone: true });

export const deliveryNote = pgTable(
  "delivery_note",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "restrict" }),
    /** "Đợt N" within the contract; a cancelled note keeps its number. */
    batchNo: integer("batch_no").notNull(),
    status: text("status").notNull().default("PLANNED"),
    /** The one yard the goods leave from (design D7). */
    sourceLocationId: uuid("source_location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    /** The SITE location of a rental contract; null for a sale. */
    siteLocationId: uuid("site_location_id").references(() => location.id, {
      onDelete: "restrict",
    }),
    plannedDate: date("planned_date"),
    companyTruck: boolean("company_truck").notNull().default(false),
    /** One-way freight in VND; only when the company calls the truck. */
    freightAmount: bigint("freight_amount", { mode: "number" }),
    vehiclePlate: text("vehicle_plate"),
    note: text("note"),
    overContractConfirmed: boolean("over_contract_confirmed")
      .notNull()
      .default(false),
    pickingBy: userRef("picking_by"),
    pickingStartedAt: at("picking_started_at"),
    returnedReason: text("returned_reason"),
    cancelledReason: text("cancelled_reason"),
    clientDraftId: uuid("client_draft_id").unique(),
    postingId: uuid("posting_id"),
    /** Delivery date = the day the posting ran, Vietnam time (design D2). */
    businessDate: date("business_date"),
    /** When the phone tapped "Xác nhận xe rời bãi"; information only. */
    departedAt: at("departed_at"),
    /** The contract revision in force on the delivery date. */
    contractRevisionId: uuid("contract_revision_id").references(
      () => contractRevision.id,
      { onDelete: "restrict" },
    ),
    postedBy: userRef("posted_by"),
    postedAt: at("posted_at"),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("delivery_note_batch_unique").on(table.contractId, table.batchNo),
    check(
      "delivery_note_status_check",
      sql`${table.status} in ('PLANNED', 'PICKING', 'POSTED', 'CANCELLED')`,
    ),
    check(
      "delivery_note_posted_check",
      sql`(${table.status} = 'POSTED') = (${table.businessDate} is not null and ${table.postingId} is not null and ${table.clientDraftId} is not null and ${table.postedBy} is not null and ${table.postedAt} is not null and ${table.contractRevisionId} is not null)`,
    ),
    check(
      "delivery_note_picking_check",
      sql`${table.status} <> 'PICKING' or (${table.pickingBy} is not null and ${table.pickingStartedAt} is not null)`,
    ),
    check(
      "delivery_note_freight_check",
      sql`${table.freightAmount} is null or (${table.freightAmount} >= 0 and ${table.companyTruck})`,
    ),
    check("delivery_note_batch_check", sql`${table.batchNo} > 0`),
    check(
      "delivery_note_text_check",
      sql`(${table.vehiclePlate} is null or length(${table.vehiclePlate}) between 1 and 20) and (${table.note} is null or length(${table.note}) between 1 and 500) and (${table.returnedReason} is null or length(${table.returnedReason}) between 1 and 500) and (${table.cancelledReason} is null or length(${table.cancelledReason}) between 1 and 500)`,
    ),
    index("delivery_note_contract_idx").on(table.contractId),
    index("delivery_note_status_idx").on(table.status, table.plannedDate),
    // dashboard-basic design D2: sale revenue by day, top 5 by kg.
    index("delivery_note_posted_date_idx")
      .on(table.businessDate)
      .where(sql`${table.status} = 'POSTED'`),
  ],
);

/** Kits chosen when the batch was made, kept to show "60 bộ 1,7m". */
export const deliveryNoteKit = pgTable(
  "delivery_note_kit",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => deliveryNote.id, { onDelete: "cascade" }),
    kitId: uuid("kit_id")
      .notNull()
      .references(() => kit.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.kitId] }),
    check("delivery_note_kit_quantity_check", sql`${table.quantity} >= 1`),
  ],
);

export const deliveryNoteLine = pgTable(
  "delivery_note_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    noteId: uuid("note_id")
      .notNull()
      .references(() => deliveryNote.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    /** Sale lines only: the condition of the contract line. */
    condition: text("condition"),
    /** Sale lines only: ITEM or KG. */
    pricingUnit: text("pricing_unit"),
    /** In the item's unit; in kg for a sale line priced by kg. */
    requestedQuantity: numeric("requested_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    /** Sale lines: the contract price on the delivery date, set on posting. */
    unitPrice: bigint("unit_price", { mode: "number" }),
  },
  (table) => [
    unique("delivery_note_line_no_unique").on(table.noteId, table.lineNo),
    uniqueIndex("delivery_note_line_rental_unique")
      .on(table.noteId, table.itemId)
      .where(sql`${table.condition} is null`),
    uniqueIndex("delivery_note_line_sale_unique")
      .on(table.noteId, table.itemId, table.condition, table.pricingUnit)
      .where(sql`${table.condition} is not null`),
    check(
      "delivery_note_line_shape_check",
      sql`(${table.condition} is null and ${table.pricingUnit} is null and ${table.unitPrice} is null) or (${table.condition} in ('NEW', 'GOOD', 'SCRAP') and ${table.pricingUnit} in ('ITEM', 'KG') and (${table.condition} <> 'SCRAP' or ${table.pricingUnit} = 'KG'))`,
    ),
    check(
      "delivery_note_line_quantity_check",
      sql`${table.requestedQuantity} > 0 and (${table.unitPrice} is null or ${table.unitPrice} >= 0)`,
    ),
    index("delivery_note_line_item_idx").on(table.itemId),
  ],
);

/** What was picked for a line, per condition (rental: NEW and/or GOOD). */
export const deliveryNotePick = pgTable(
  "delivery_note_pick",
  {
    lineId: uuid("line_id")
      .notNull()
      .references(() => deliveryNoteLine.id, { onDelete: "cascade" }),
    condition: text("condition").notNull(),
    /** In the item's unit: what leaves the yard stock. */
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    weighedKg: numeric("weighed_kg", { precision: 14, scale: 3 }),
    /** Pieces estimated from the weighed kg (scrap that was not counted). */
    piecesEstimated: boolean("pieces_estimated").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.lineId, table.condition] }),
    check(
      "delivery_note_pick_condition_check",
      sql`${table.condition} in ('NEW', 'GOOD', 'SCRAP')`,
    ),
    check(
      "delivery_note_pick_quantity_check",
      sql`${table.quantity} > 0 and (${table.weighedKg} is null or ${table.weighedKg} > 0) and (not ${table.piecesEstimated} or ${table.weighedKg} is not null)`,
    ),
  ],
);

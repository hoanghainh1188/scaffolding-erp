// Site transfers, buy-back notes and on-site exchanges (site-operations
// design D1, D5, D6, D9). A transfer moves rented goods straight from the
// site of one rental contract to the site of another; once posted or
// cancelled it is frozen by a trigger, and its lines' moved quantity can
// only be written by the posting transaction (posted_xact). A buy-back note
// is frozen once approved or rejected. An exchange links one delivery note
// to the return note that brings the old items back; it has no document of
// its own.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { item, location } from "./catalog";
import { contract, contractRevision } from "./contracts";
import { deliveryNote } from "./deliveries";
import { returnNote } from "./returns";

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "restrict" });

const at = (name: string) => timestamp(name, { withTimezone: true });

const xid8 = customType<{ data: string }>({ dataType: () => "xid8" });

export const siteTransfer = pgTable(
  "site_transfer",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    fromContractId: uuid("from_contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "restrict" }),
    toContractId: uuid("to_contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "restrict" }),
    fromSiteLocationId: uuid("from_site_location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    toSiteLocationId: uuid("to_site_location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("DRAFT"),
    /** OFFICE: posted from D6b; PHONE: sent to M9 (0.2 #66). */
    confirmMode: text("confirm_mode").notNull().default("OFFICE"),
    vehiclePlate: text("vehicle_plate"),
    note: text("note"),
    otherCustomerConfirmed: boolean("other_customer_confirmed")
      .notNull()
      .default(false),
    overContractConfirmed: boolean("over_contract_confirmed")
      .notNull()
      .default(false),
    /** Both contracts of one customer, set on posting (0.2 #70). */
    sameCustomer: boolean("same_customer"),
    cancelledReason: text("cancelled_reason"),
    clientDraftId: uuid("client_draft_id").unique(),
    postingId: uuid("posting_id"),
    /** Transfer date = the day the posting ran, Vietnam time. */
    businessDate: date("business_date"),
    /** When the phone tapped confirm on M9; information only. */
    confirmedOnDeviceAt: at("confirmed_on_device_at"),
    /** The posting transaction; only it may write moved quantities. */
    postedXact: xid8("posted_xact"),
    postedBy: userRef("posted_by"),
    postedAt: at("posted_at"),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "site_transfer_status_check",
      sql`${table.status} in ('DRAFT', 'SENT', 'POSTED', 'CANCELLED')`,
    ),
    check(
      "site_transfer_confirm_mode_check",
      sql`${table.confirmMode} in ('OFFICE', 'PHONE')`,
    ),
    check(
      "site_transfer_contracts_check",
      sql`${table.fromContractId} <> ${table.toContractId}`,
    ),
    check(
      "site_transfer_posted_check",
      sql`(${table.status} = 'POSTED') = (${table.businessDate} is not null and ${table.postingId} is not null and ${table.postedBy} is not null and ${table.postedAt} is not null and ${table.postedXact} is not null and ${table.sameCustomer} is not null)`,
    ),
    check(
      "site_transfer_cancelled_check",
      sql`(${table.status} = 'CANCELLED') = (${table.cancelledReason} is not null)`,
    ),
    check(
      "site_transfer_text_check",
      sql`(${table.vehiclePlate} is null or length(${table.vehiclePlate}) between 1 and 20) and (${table.note} is null or length(${table.note}) between 1 and 500) and (${table.cancelledReason} is null or length(${table.cancelledReason}) between 1 and 500)`,
    ),
    index("site_transfer_from_idx").on(table.fromContractId),
    index("site_transfer_to_idx").on(table.toContractId),
    index("site_transfer_status_idx").on(table.status),
  ],
);

export const siteTransferLine = pgTable(
  "site_transfer_line",
  {
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => siteTransfer.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    /** What the office wrote, in the item's unit. */
    plannedQuantity: numeric("planned_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    /** What the truck carried; set when the transfer is posted. */
    movedQuantity: numeric("moved_quantity", { precision: 14, scale: 3 }),
  },
  (table) => [
    primaryKey({ columns: [table.transferId, table.itemId] }),
    unique("site_transfer_line_no_unique").on(table.transferId, table.lineNo),
    check(
      "site_transfer_line_quantity_check",
      sql`${table.plannedQuantity} > 0 and (${table.movedQuantity} is null or (${table.movedQuantity} >= 0 and ${table.movedQuantity} <= ${table.plannedQuantity}))`,
    ),
    index("site_transfer_line_item_idx").on(table.itemId),
  ],
);

export const buyBackNote = pgTable(
  "buy_back_note",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "restrict" }),
    siteLocationId: uuid("site_location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    /** The revision in force when the note was made (lost prices). */
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => contractRevision.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("PENDING"),
    reason: text("reason").notNull(),
    approvalReason: text("approval_reason"),
    rejectedReason: text("rejected_reason"),
    amountDue: bigint("amount_due", { mode: "number" }),
    approvedBy: userRef("approved_by"),
    approvedAt: at("approved_at"),
    /** Rent stops after this day; the ledger lines carry it too. */
    approvedDate: date("approved_date"),
    dueDate: date("due_date"),
    postingId: uuid("posting_id"),
    rejectedBy: userRef("rejected_by"),
    rejectedAt: at("rejected_at"),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "buy_back_note_status_check",
      sql`${table.status} in ('PENDING', 'APPROVED', 'REJECTED')`,
    ),
    check(
      "buy_back_note_approved_check",
      sql`(${table.status} = 'APPROVED') = (${table.amountDue} is not null and ${table.approvedBy} is not null and ${table.approvedAt} is not null and ${table.approvedDate} is not null and ${table.dueDate} is not null and ${table.postingId} is not null)`,
    ),
    check(
      "buy_back_note_rejected_check",
      sql`(${table.status} = 'REJECTED') = (${table.rejectedReason} is not null and ${table.rejectedBy} is not null and ${table.rejectedAt} is not null)`,
    ),
    check(
      "buy_back_note_amount_check",
      sql`${table.amountDue} is null or ${table.amountDue} >= 0`,
    ),
    check(
      "buy_back_note_text_check",
      sql`length(${table.reason}) between 1 and 500 and (${table.approvalReason} is null or length(${table.approvalReason}) between 1 and 500) and (${table.rejectedReason} is null or length(${table.rejectedReason}) between 1 and 500)`,
    ),
    index("buy_back_note_contract_idx").on(table.contractId),
    index("buy_back_note_status_idx").on(table.status, table.createdAt),
  ],
);

export const buyBackNoteLine = pgTable(
  "buy_back_note_line",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => buyBackNote.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
    /** The lost price of the contract; null when it has none. */
    contractPrice: bigint("contract_price", { mode: "number" }),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.itemId] }),
    unique("buy_back_note_line_no_unique").on(table.noteId, table.lineNo),
    check(
      "buy_back_note_line_amount_check",
      sql`${table.quantity} > 0 and ${table.unitPrice} >= 0 and (${table.contractPrice} is null or ${table.contractPrice} >= 0)`,
    ),
    index("buy_back_note_line_item_idx").on(table.itemId),
  ],
);

export const deliveryExchange = pgTable(
  "delivery_exchange",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "restrict" }),
    deliveryNoteId: uuid("delivery_note_id")
      .notNull()
      .unique()
      .references(() => deliveryNote.id, { onDelete: "restrict" }),
    returnNoteId: uuid("return_note_id")
      .unique()
      .references(() => returnNote.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("WAITING"),
    cancelledReason: text("cancelled_reason"),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "delivery_exchange_status_check",
      sql`${table.status} in ('WAITING', 'DONE', 'CANCELLED')`,
    ),
    check(
      "delivery_exchange_done_check",
      sql`(${table.status} = 'DONE') = (${table.returnNoteId} is not null)`,
    ),
    check(
      "delivery_exchange_cancelled_check",
      sql`(${table.status} = 'CANCELLED') = (${table.cancelledReason} is not null) and (${table.cancelledReason} is null or length(${table.cancelledReason}) between 1 and 500)`,
    ),
    index("delivery_exchange_contract_idx").on(table.contractId),
  ],
);

export const deliveryExchangeLine = pgTable(
  "delivery_exchange_line",
  {
    exchangeId: uuid("exchange_id")
      .notNull()
      .references(() => deliveryExchange.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    expectedQuantity: numeric("expected_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.exchangeId, table.itemId] }),
    unique("delivery_exchange_line_no_unique").on(
      table.exchangeId,
      table.lineNo,
    ),
    check(
      "delivery_exchange_line_quantity_check",
      sql`${table.expectedQuantity} > 0`,
    ),
  ],
);

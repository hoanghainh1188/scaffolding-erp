// Return notes, compensation notes and return photos (returns-and-compensation
// design D3, D4, D9). A return note exists only once posted and is frozen by
// a trigger; its lines, and the lines of a compensation note, can only be
// inserted in the transaction that created the parent (created_xact). A
// compensation note is frozen once approved or rejected. Photos are WebP
// bytes kept private in Postgres; list queries never select `content`.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  customType,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { item, location } from "./catalog";
import { contract, contractRevision } from "./contracts";

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "restrict" });

const at = (name: string) => timestamp(name, { withTimezone: true });

const quantity = (name: string) =>
  numeric(name, { precision: 14, scale: 3 }).notNull().default("0");

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** The creating transaction; set by the database, never by the code. */
const xid8 = customType<{ data: string }>({ dataType: () => "xid8" });
const createdXact = () =>
  xid8("created_xact")
    .notNull()
    .default(sql`pg_current_xact_id()`);

export const returnNote = pgTable(
  "return_note",
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
    yardLocationId: uuid("yard_location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    /** Return date = the day the posting ran, Vietnam time (0.2 #61). */
    businessDate: date("business_date").notNull(),
    vehiclePlate: text("vehicle_plate"),
    note: text("note"),
    clientDraftId: uuid("client_draft_id").notNull().unique(),
    postingId: uuid("posting_id").notNull(),
    /** When the phone tapped "Lưu phiếu thu hồi"; information only. */
    savedOnDeviceAt: at("saved_on_device_at"),
    postedBy: userRef("posted_by").notNull(),
    postedAt: at("posted_at").notNull(),
    createdXact: createdXact(),
  },
  (table) => [
    check(
      "return_note_text_check",
      sql`(${table.vehiclePlate} is null or length(${table.vehiclePlate}) between 1 and 20) and (${table.note} is null or length(${table.note}) between 1 and 500)`,
    ),
    check(
      "return_note_location_check",
      sql`${table.siteLocationId} <> ${table.yardLocationId}`,
    ),
    index("return_note_contract_idx").on(table.contractId),
    index("return_note_date_idx").on(table.businessDate),
  ],
);

export const returnNoteLine = pgTable(
  "return_note_line",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => returnNote.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    goodQuantity: quantity("good_quantity"),
    repairQuantity: quantity("repair_quantity"),
    scrapQuantity: quantity("scrap_quantity"),
    lostQuantity: quantity("lost_quantity"),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.itemId] }),
    unique("return_note_line_no_unique").on(table.noteId, table.lineNo),
    check(
      "return_note_line_quantity_check",
      sql`${table.goodQuantity} >= 0 and ${table.repairQuantity} >= 0 and ${table.scrapQuantity} >= 0 and ${table.lostQuantity} >= 0 and ${table.goodQuantity} + ${table.repairQuantity} + ${table.scrapQuantity} + ${table.lostQuantity} > 0`,
    ),
    index("return_note_line_item_idx").on(table.itemId),
  ],
);

export const compensationNote = pgTable(
  "compensation_note",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    returnNoteId: uuid("return_note_id")
      .notNull()
      .unique()
      .references(() => returnNote.id, { onDelete: "restrict" }),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "restrict" }),
    /** The contract revision in force on the return date. */
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => contractRevision.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("PENDING"),
    discountAmount: bigint("discount_amount", { mode: "number" })
      .notNull()
      .default(0),
    discountReason: text("discount_reason"),
    approvalReason: text("approval_reason"),
    rejectedReason: text("rejected_reason"),
    /** Total − discount, set on approval; what receivables reads (D5). */
    amountDue: bigint("amount_due", { mode: "number" }),
    approvedBy: userRef("approved_by"),
    approvedAt: at("approved_at"),
    approvedDate: date("approved_date"),
    dueDate: date("due_date"),
    rejectedBy: userRef("rejected_by"),
    rejectedAt: at("rejected_at"),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
    createdXact: createdXact(),
  },
  (table) => [
    check(
      "compensation_note_status_check",
      sql`${table.status} in ('PENDING', 'APPROVED', 'REJECTED')`,
    ),
    check(
      "compensation_note_approved_check",
      sql`(${table.status} = 'APPROVED') = (${table.amountDue} is not null and ${table.approvedBy} is not null and ${table.approvedAt} is not null and ${table.approvedDate} is not null and ${table.dueDate} is not null)`,
    ),
    check(
      "compensation_note_rejected_check",
      sql`(${table.status} = 'REJECTED') = (${table.rejectedReason} is not null and ${table.rejectedBy} is not null and ${table.rejectedAt} is not null)`,
    ),
    check(
      "compensation_note_discount_check",
      sql`${table.discountAmount} >= 0 and (${table.discountAmount} = 0 or ${table.discountReason} is not null) and (${table.amountDue} is null or ${table.amountDue} >= 0)`,
    ),
    check(
      "compensation_note_text_check",
      sql`(${table.discountReason} is null or length(${table.discountReason}) between 1 and 500) and (${table.approvalReason} is null or length(${table.approvalReason}) between 1 and 500) and (${table.rejectedReason} is null or length(${table.rejectedReason}) between 1 and 500)`,
    ),
    index("compensation_note_contract_idx").on(table.contractId),
    index("compensation_note_status_idx").on(table.status, table.createdAt),
  ],
);

export const compensationNoteLine = pgTable(
  "compensation_note_line",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => compensationNote.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    /** DAMAGED (Chờ sửa), SCRAPPED (Phế liệu), LOST (Mất). */
    kind: text("kind").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    /** Null until a price is known: the contract had none. */
    unitPrice: bigint("unit_price", { mode: "number" }),
    /** The contract price when the note was made; null = typed by hand. */
    contractPrice: bigint("contract_price", { mode: "number" }),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.itemId, table.kind] }),
    check(
      "compensation_note_line_kind_check",
      sql`${table.kind} in ('DAMAGED', 'SCRAPPED', 'LOST')`,
    ),
    check(
      "compensation_note_line_amount_check",
      sql`${table.quantity} > 0 and (${table.unitPrice} is null or ${table.unitPrice} >= 0) and (${table.contractPrice} is null or ${table.contractPrice} >= 0)`,
    ),
  ],
);

export const returnPhoto = pgTable(
  "return_photo",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clientDraftId: uuid("client_draft_id").notNull(),
    clientPhotoId: uuid("client_photo_id").notNull(),
    /** Null while the photo belongs to a draft only. */
    returnNoteId: uuid("return_note_id").references(() => returnNote.id, {
      onDelete: "restrict",
    }),
    position: smallint("position").notNull().default(0),
    caption: text("caption"),
    content: bytea("content").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    uploadedBy: userRef("uploaded_by").notNull(),
    uploadedAt: at("uploaded_at").notNull().defaultNow(),
  },
  (table) => [
    unique("return_photo_client_unique").on(
      table.clientDraftId,
      table.clientPhotoId,
    ),
    check(
      "return_photo_shape_check",
      sql`${table.byteSize} > 0 and ${table.width} > 0 and ${table.height} > 0 and ${table.position} >= 0 and (${table.caption} is null or length(${table.caption}) between 1 and 100)`,
    ),
    index("return_photo_note_idx").on(table.returnNoteId),
    index("return_photo_draft_idx").on(table.clientDraftId),
    index("return_photo_orphan_idx")
      .on(table.uploadedAt)
      .where(sql`${table.returnNoteId} is null`),
  ],
);

// Rent by period (rental-billing design D4, D5, D11). Open periods are
// computed from the ledger and never stored; closing a period copies the
// whole statement into billing_period and its child tables, which only
// grow (APPEND_ONLY_TABLES + trigger): children are inserted only by the
// transaction that created the period (created_xact). Adjustments of a
// closed period are written into a later, open one and freeze with it.
// Holidays apply to every rental contract and never overlap.
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
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { item } from "./catalog";
import { contract, contractRevision } from "./contracts";
import { deliveryNote } from "./deliveries";

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "restrict" });

const at = (name: string) => timestamp(name, { withTimezone: true });

const money = (name: string) => bigint(name, { mode: "number" });

/** The creating transaction; set by the database, never by the code. */
const xid8 = customType<{ data: string }>({ dataType: () => "xid8" });

export const rentalHoliday = pgTable(
  "rental_holiday",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    /** Both ends count as holidays. */
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    createdBy: userRef("created_by").notNull(),
    updatedBy: userRef("updated_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "rental_holiday_name_check",
      sql`length(btrim(${table.name})) between 1 and 100`,
    ),
    check(
      "rental_holiday_range_check",
      sql`${table.endDate} >= ${table.startDate} and ${table.endDate} - ${table.startDate} <= 30`,
    ),
    index("rental_holiday_start_idx").on(table.startDate),
  ],
);

export const billingPeriod = pgTable(
  "billing_period",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "restrict" }),
    /** First day of the month. */
    month: date("month").notNull(),
    periodEnd: date("period_end").notNull(),
    /** The revision in force on the last day of the period. */
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => contractRevision.id, { onDelete: "restrict" }),
    /** Rent lines and minimum top-ups. */
    rentAmount: money("rent_amount").notNull(),
    adjustmentAmount: money("adjustment_amount").notNull(),
    freightAmount: money("freight_amount").notNull(),
    vatAmount: money("vat_amount").notNull(),
    totalAmount: money("total_amount").notNull(),
    paymentTermsDays: integer("payment_terms_days").notNull(),
    /** period_end + payment_terms_days (0.2 #18, #78). */
    dueDate: date("due_date").notNull(),
    holidayDays: integer("holiday_days").notNull(),
    lineCount: integer("line_count").notNull(),
    createdXact: xid8("created_xact")
      .notNull()
      .default(sql`pg_current_xact_id()`),
    closedBy: userRef("closed_by").notNull(),
    closedAt: at("closed_at").notNull(),
  },
  (table) => [
    unique("billing_period_contract_month_unique").on(
      table.contractId,
      table.month,
    ),
    check(
      "billing_period_month_check",
      sql`extract(day from ${table.month}) = 1 and ${table.periodEnd} = (${table.month} + interval '1 month' - interval '1 day')::date`,
    ),
    check(
      "billing_period_amount_check",
      sql`${table.rentAmount} >= 0 and ${table.freightAmount} >= 0 and ${table.vatAmount} >= 0 and ${table.totalAmount} = ${table.rentAmount} + ${table.adjustmentAmount} + ${table.freightAmount} + ${table.vatAmount}`,
    ),
    check(
      "billing_period_due_check",
      sql`${table.paymentTermsDays} between 0 and 365 and ${table.dueDate} = ${table.periodEnd} + ${table.paymentTermsDays}`,
    ),
    check(
      "billing_period_count_check",
      sql`${table.holidayDays} >= 0 and ${table.lineCount} >= 0`,
    ),
    index("billing_period_end_idx").on(table.contractId, table.periodEnd),
    // dashboard-basic design D2: closed periods of every contract by month.
    index("billing_period_month_idx").on(table.month),
  ],
);

export const billingPeriodLine = pgTable(
  "billing_period_line",
  {
    periodId: uuid("period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "restrict" }),
    lineNo: integer("line_no").notNull(),
    /** RENT, MINIMUM (top-up to the minimum days), ADJUSTMENT. */
    kind: text("kind").notNull(),
    itemId: uuid("item_id").references(() => item.id, {
      onDelete: "restrict",
    }),
    itemCode: text("item_code"),
    itemName: text("item_name"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }),
    fromDate: date("from_date"),
    toDate: date("to_date"),
    calendarDays: integer("calendar_days"),
    holidayDays: integer("holiday_days"),
    chargedDays: integer("charged_days"),
    dailyPrice: money("daily_price"),
    amount: money("amount").notNull(),
    /** Null when the line carries no VAT. */
    vatRate: numeric("vat_rate", { precision: 5, scale: 2 }),
    /** Code of the revision the price came from ("…/02"). */
    revisionCode: text("revision_code"),
    priceChanged: boolean("price_changed").notNull().default(false),
    inDocumentType: text("in_document_type"),
    inDocumentCode: text("in_document_code"),
    inDate: date("in_date"),
    /** First delivery of a same-customer transfer chain (0.2 #70). */
    originDate: date("origin_date"),
    outKind: text("out_kind"),
    outDocumentType: text("out_document_type"),
    outDocumentCode: text("out_document_code"),
    outDate: date("out_date"),
    adjustmentId: uuid("adjustment_id"),
    refMonth: date("ref_month"),
    note: text("note"),
  },
  (table) => [
    unique("billing_period_line_no_unique").on(table.periodId, table.lineNo),
    check(
      "billing_period_line_kind_check",
      sql`${table.kind} in ('RENT', 'MINIMUM', 'ADJUSTMENT')`,
    ),
    check(
      "billing_period_line_out_kind_check",
      sql`${table.outKind} is null or ${table.outKind} in ('RETURN', 'LOSS', 'BUY_BACK', 'TRANSFER')`,
    ),
    check(
      "billing_period_line_shape_check",
      sql`(${table.kind} = 'RENT' and ${table.itemId} is not null and ${table.quantity} > 0 and ${table.fromDate} <= ${table.toDate} and ${table.chargedDays} = ${table.calendarDays} - ${table.holidayDays} and ${table.chargedDays} >= 0 and ${table.dailyPrice} >= 0 and ${table.amount} >= 0) or (${table.kind} = 'MINIMUM' and ${table.itemId} is not null and ${table.quantity} > 0 and ${table.fromDate} is null and ${table.toDate} is null and ${table.chargedDays} > 0 and ${table.dailyPrice} >= 0 and ${table.amount} >= 0) or (${table.kind} = 'ADJUSTMENT' and ${table.itemId} is null and ${table.adjustmentId} is not null and ${table.refMonth} is not null and ${table.amount} <> 0)`,
    ),
  ],
);

export const billingPeriodFreight = pgTable(
  "billing_period_freight",
  {
    periodId: uuid("period_id")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "restrict" }),
    deliveryNoteId: uuid("delivery_note_id")
      .notNull()
      .references(() => deliveryNote.id, { onDelete: "restrict" }),
    deliveryCode: text("delivery_code").notNull(),
    batchNo: integer("batch_no"),
    vehiclePlate: text("vehicle_plate"),
    businessDate: date("business_date").notNull(),
    amount: money("amount").notNull(),
    vatRate: numeric("vat_rate", { precision: 5, scale: 2 }),
  },
  (table) => [
    unique("billing_period_freight_unique").on(
      table.periodId,
      table.deliveryNoteId,
    ),
    check("billing_period_freight_amount_check", sql`${table.amount} >= 0`),
  ],
);

export const billingAdjustment = pgTable(
  "billing_adjustment",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "restrict" }),
    /** The open period it is written into (first day of the month). */
    month: date("month").notNull(),
    /** The closed period it corrects. */
    refMonth: date("ref_month").notNull(),
    amount: money("amount").notNull(),
    reason: text("reason").notNull(),
    /** Set by the transaction closing `month`; frozen from then on. */
    closedPeriodId: uuid("closed_period_id").references(
      () => billingPeriod.id,
      { onDelete: "restrict" },
    ),
    createdBy: userRef("created_by").notNull(),
    updatedBy: userRef("updated_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "billing_adjustment_month_check",
      sql`extract(day from ${table.month}) = 1 and extract(day from ${table.refMonth}) = 1 and ${table.refMonth} < ${table.month}`,
    ),
    check(
      "billing_adjustment_amount_check",
      sql`${table.amount} <> 0 and abs(${table.amount}) <= 10000000000`,
    ),
    check(
      "billing_adjustment_reason_check",
      sql`length(btrim(${table.reason})) between 1 and 500`,
    ),
    index("billing_adjustment_contract_idx").on(table.contractId, table.month),
  ],
);

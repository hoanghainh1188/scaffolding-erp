// Receivables (receivables design D2, D4). Debts are never stored: they are
// read from closed billing periods, posted sale deliveries and approved
// compensation and buy-back notes. Only money events are kept, and every
// table here only grows (APPEND_ONLY_TABLES + trigger):
// - receipt: money a customer paid, to settle debts or as a cash deposit;
// - receipt_allocation: how much of a source (a receipt, or a closed period
//   with a negative total) went to which debt;
// - receipt_cancellation: cancelling a receipt voids its allocations;
// - contract_settlement: the deposit refund when a contract is closed.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { billingPeriod } from "./billing";
import { customer } from "./catalog";
import { contract } from "./contracts";
import { deliveryNote } from "./deliveries";
import { compensationNote } from "./returns";
import { buyBackNote } from "./site-operations";

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "restrict" });

const at = (name: string) => timestamp(name, { withTimezone: true });

const money = (name: string) => bigint(name, { mode: "number" });

export const receipt = pgTable(
  "receipt",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    /** PAYMENT settles debts; DEPOSIT is a cash deposit of one contract. */
    kind: text("kind").notNull(),
    contractId: uuid("contract_id").references(() => contract.id, {
      onDelete: "restrict",
    }),
    amount: money("amount").notNull(),
    method: text("method").notNull(),
    receivedDate: date("received_date").notNull(),
    note: text("note"),
    /** One submit of the form makes one receipt. */
    requestId: uuid("request_id").notNull().unique(),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "receipt_kind_check",
      sql`(${table.kind} = 'PAYMENT' and ${table.contractId} is null) or (${table.kind} = 'DEPOSIT' and ${table.contractId} is not null)`,
    ),
    check(
      "receipt_shape_check",
      sql`${table.amount} > 0 and ${table.method} in ('CASH', 'TRANSFER') and (${table.note} is null or length(${table.note}) between 1 and 500)`,
    ),
    index("receipt_customer_idx").on(table.customerId, table.receivedDate),
    index("receipt_contract_idx").on(table.contractId),
  ],
);

export const contractSettlement = pgTable(
  "contract_settlement",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    contractId: uuid("contract_id")
      .notNull()
      .unique()
      .references(() => contract.id, { onDelete: "restrict" }),
    settledDate: date("settled_date").notNull(),
    refundAmount: money("refund_amount").notNull(),
    refundDate: date("refund_date"),
    refundMethod: text("refund_method"),
    settledBy: userRef("settled_by").notNull(),
    settledAt: at("settled_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "contract_settlement_refund_check",
      sql`(${table.refundAmount} = 0 and ${table.refundDate} is null and ${table.refundMethod} is null) or (${table.refundAmount} > 0 and ${table.refundDate} is not null and ${table.refundMethod} in ('CASH', 'TRANSFER'))`,
    ),
  ],
);

export const receiptAllocation = pgTable(
  "receipt_allocation",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Source: a receipt, or a closed period whose total is negative. */
    receiptId: uuid("receipt_id").references(() => receipt.id, {
      onDelete: "restrict",
    }),
    creditPeriodId: uuid("credit_period_id").references(
      () => billingPeriod.id,
      { onDelete: "restrict" },
    ),
    /** Debt: exactly one of the four. */
    billingPeriodId: uuid("billing_period_id").references(
      () => billingPeriod.id,
      { onDelete: "restrict" },
    ),
    deliveryNoteId: uuid("delivery_note_id").references(() => deliveryNote.id, {
      onDelete: "restrict",
    }),
    compensationNoteId: uuid("compensation_note_id").references(
      () => compensationNote.id,
      { onDelete: "restrict" },
    ),
    buyBackNoteId: uuid("buy_back_note_id").references(() => buyBackNote.id, {
      onDelete: "restrict",
    }),
    amount: money("amount").notNull(),
    /** AUTO, MANUAL (chosen by the accountant), PREPAYMENT, DEPOSIT. */
    mode: text("mode").notNull(),
    settlementId: uuid("settlement_id").references(
      () => contractSettlement.id,
      { onDelete: "restrict" },
    ),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "receipt_allocation_source_check",
      sql`num_nonnulls(${table.receiptId}, ${table.creditPeriodId}) = 1`,
    ),
    check(
      "receipt_allocation_debt_check",
      sql`num_nonnulls(${table.billingPeriodId}, ${table.deliveryNoteId}, ${table.compensationNoteId}, ${table.buyBackNoteId}) = 1`,
    ),
    check(
      "receipt_allocation_shape_check",
      sql`${table.amount} > 0 and ${table.mode} in ('AUTO', 'MANUAL', 'PREPAYMENT', 'DEPOSIT') and (${table.mode} = 'DEPOSIT') = (${table.settlementId} is not null) and (${table.creditPeriodId} is null or ${table.mode} = 'PREPAYMENT')`,
    ),
    index("receipt_allocation_receipt_idx").on(table.receiptId),
    index("receipt_allocation_credit_idx").on(table.creditPeriodId),
    index("receipt_allocation_period_idx").on(table.billingPeriodId),
    index("receipt_allocation_delivery_idx").on(table.deliveryNoteId),
    index("receipt_allocation_compensation_idx").on(table.compensationNoteId),
    index("receipt_allocation_buy_back_idx").on(table.buyBackNoteId),
  ],
);

export const receiptCancellation = pgTable(
  "receipt_cancellation",
  {
    receiptId: uuid("receipt_id")
      .primaryKey()
      .references(() => receipt.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    cancelledBy: userRef("cancelled_by").notNull(),
    cancelledAt: at("cancelled_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "receipt_cancellation_reason_check",
      sql`length(${table.reason}) between 1 and 500`,
    ),
  ],
);

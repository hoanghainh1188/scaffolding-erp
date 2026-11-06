// Payables (payables design D3). What the company owes a seller is never
// stored: each posted goods receipt is a debt worth its goods value. Only
// money events are kept, and every table here only grows
// (APPEND_ONLY_TABLES + trigger):
// - supplier_payment: money paid to a seller, for goods or in advance;
// - supplier_payment_allocation: how much of a payment went to which receipt;
// - supplier_payment_cancellation: cancelling a payment voids its allocations.
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
import { supplier } from "./catalog";
import { goodsReceipt } from "./receiving";

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "restrict" });

const at = (name: string) => timestamp(name, { withTimezone: true });

const money = (name: string) => bigint(name, { mode: "number" });

export const supplierPayment = pgTable(
  "supplier_payment",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    /** PAYMENT pays goods; ADVANCE is paid before goods arrive (0.2 số 100). */
    kind: text("kind").notNull(),
    amount: money("amount").notNull(),
    method: text("method").notNull(),
    paidDate: date("paid_date").notNull(),
    note: text("note"),
    /** One submit of the form makes one payment. */
    requestId: uuid("request_id").notNull().unique(),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "supplier_payment_shape_check",
      sql`${table.amount} > 0 and ${table.kind} in ('PAYMENT', 'ADVANCE') and ${table.method} in ('CASH', 'TRANSFER') and (${table.note} is null or length(${table.note}) between 1 and 500)`,
    ),
    index("supplier_payment_supplier_idx").on(table.supplierId, table.paidDate),
  ],
);

export const supplierPaymentAllocation = pgTable(
  "supplier_payment_allocation",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => supplierPayment.id, { onDelete: "restrict" }),
    goodsReceiptId: uuid("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipt.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    /** AUTO, MANUAL (chosen by the accountant), ADVANCE (from an advance). */
    mode: text("mode").notNull(),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "supplier_payment_allocation_shape_check",
      sql`${table.amount} > 0 and ${table.mode} in ('AUTO', 'MANUAL', 'ADVANCE')`,
    ),
    index("supplier_payment_allocation_payment_idx").on(table.paymentId),
    index("supplier_payment_allocation_receipt_idx").on(table.goodsReceiptId),
  ],
);

export const supplierPaymentCancellation = pgTable(
  "supplier_payment_cancellation",
  {
    paymentId: uuid("payment_id")
      .primaryKey()
      .references(() => supplierPayment.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    cancelledBy: userRef("cancelled_by").notNull(),
    cancelledAt: at("cancelled_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "supplier_payment_cancellation_reason_check",
      sql`length(${table.reason}) between 1 and 500`,
    ),
  ],
);

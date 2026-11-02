// The activity log (activity-log design D2): who did what to which
// document, append only. A trigger in the migration blocks UPDATE, DELETE
// and TRUNCATE. document_id has no foreign key: a deleted draft keeps its row.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import type { FieldChange } from "@/domain/activity-changes";

import { user } from "./auth";

export type { FieldChange };

export const activityLog = pgTable(
  "activity_log",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** The role when the action was done; a later role change keeps it. */
    role: text("role").notNull(),
    device: text("device").notNull(),
    browser: text("browser").notNull(),
    action: text("action").notNull(),
    documentType: text("document_type"),
    documentId: text("document_id"),
    documentCode: text("document_code"),
    summary: text("summary").notNull(),
    changes: jsonb("changes").$type<FieldChange[]>().notNull().default([]),
    flags: text("flags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (table) => [
    check(
      "activity_log_role_check",
      sql`${table.role} in ('DIRECTOR', 'ACCOUNTANT', 'SALES', 'WAREHOUSE', 'WORKSHOP')`,
    ),
    check(
      "activity_log_device_check",
      sql`${table.device} in ('DESKTOP', 'MOBILE')`,
    ),
    check(
      "activity_log_browser_check",
      sql`${table.browser} in ('EDGE', 'CHROME', 'COCCOC', 'SAFARI', 'FIREFOX', 'OTHER')`,
    ),
    check(
      "activity_log_action_check",
      sql`${table.action} in ('CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'POST', 'RETURN', 'CANCEL', 'CLOSE', 'DELETE_DRAFT', 'DELETE', 'SIGN_IN')`,
    ),
    check(
      "activity_log_document_type_check",
      sql`${table.documentType} in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REPAIR_ORDER', 'STOCKTAKE', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'ITEM', 'ITEM_GROUP', 'KIT', 'SUPPLIER', 'CUSTOMER', 'SITE', 'LOCATION', 'USER', 'SCRAP_PRICE', 'COMPANY_PROFILE', 'CONTRACT', 'CONTRACT_AMENDMENT')`,
    ),
    check(
      "activity_log_sign_in_document_check",
      sql`(${table.action} = 'SIGN_IN') = (${table.documentType} is null)`,
    ),
    check(
      "activity_log_summary_check",
      sql`char_length(${table.summary}) between 1 and 300`,
    ),
    check(
      "activity_log_changes_check",
      sql`jsonb_typeof(${table.changes}) = 'array'`,
    ),
    check(
      "activity_log_flags_check",
      sql`${table.flags} <@ array['OFF_HOURS', 'SENSITIVE', 'ANOMALY']::text[]`,
    ),
    index("activity_log_created_idx").on(
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("activity_log_user_idx").on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    // D18 matches a code ignoring case (usernames are lower case).
    index("activity_log_document_idx").on(sql`lower(${table.documentCode})`),
    index("activity_log_review_idx")
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.flags} <> '{}'::text[]`),
  ],
);

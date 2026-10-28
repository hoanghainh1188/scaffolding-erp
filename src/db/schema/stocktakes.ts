// Stocktake sessions (stocktake, design D12): one yard or workshop, the
// lines counted blind on the phone, the book quantity taken at "Xong mã
// này". Differences and their value are read, not stored.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
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
import { item, itemGroup, location } from "./catalog";

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "restrict" });

export const stocktake = pgTable(
  "stocktake",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    /** true: every item with stock; false: the groups in stocktake_group. */
    scopeAll: boolean("scope_all").notNull(),
    status: text("status").notNull().default("COUNTING"),
    /** Goes up each time the director returns the session or asks a recount. */
    round: integer("round").notNull().default(1),
    clientStartId: uuid("client_start_id").notNull().unique(),
    lastSubmissionId: uuid("last_submission_id"),
    startedBy: userRef("started_by").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedBy: userRef("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    returnedReason: text("returned_reason"),
    returnedBy: userRef("returned_by"),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    approvedBy: userRef("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** Null when every counted line matched. */
    postingId: uuid("posting_id"),
    cancelReason: text("cancel_reason"),
    cancelledBy: userRef("cancelled_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "stocktake_status_check",
      sql`${table.status} in ('COUNTING', 'SUBMITTED', 'DONE', 'CANCELLED')`,
    ),
    check("stocktake_round_check", sql`${table.round} >= 1`),
    check(
      "stocktake_done_check",
      sql`(${table.status} = 'DONE') = (${table.approvedAt} is not null and ${table.approvedBy} is not null)`,
    ),
    check(
      "stocktake_cancelled_check",
      sql`(${table.status} = 'CANCELLED') = (${table.cancelledAt} is not null and ${table.cancelledBy} is not null and ${table.cancelReason} is not null)`,
    ),
    check(
      "stocktake_posting_check",
      sql`${table.postingId} is null or ${table.status} = 'DONE'`,
    ),
    check(
      "stocktake_reason_check",
      sql`(${table.returnedReason} is null or length(${table.returnedReason}) between 1 and 500) and (${table.cancelReason} is null or length(${table.cancelReason}) between 1 and 500)`,
    ),
    uniqueIndex("stocktake_open_location_unique")
      .on(table.locationId)
      .where(sql`${table.status} in ('COUNTING', 'SUBMITTED')`),
    index("stocktake_status_idx").on(table.status, table.startedAt),
  ],
);

export const stocktakeGroup = pgTable(
  "stocktake_group",
  {
    stocktakeId: uuid("stocktake_id")
      .notNull()
      .references(() => stocktake.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => itemGroup.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.stocktakeId, table.groupId] })],
);

export const stocktakeLine = pgTable(
  "stocktake_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    stocktakeId: uuid("stocktake_id")
      .notNull()
      .references(() => stocktake.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    condition: text("condition").notNull(),
    /** LISTED at the start; ADDED on the phone while counting. */
    origin: text("origin").notNull(),
    /** Server time (design D3) of "Đếm mã này" and "Xong mã này". */
    countStartedAt: timestamp("count_started_at", { withTimezone: true }),
    countedAt: timestamp("counted_at", { withTimezone: true }),
    countedQuantity: numeric("counted_quantity", { precision: 14, scale: 3 }),
    bookQuantity: numeric("book_quantity", { precision: 14, scale: 3 }),
    flags: text("flags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    recount: boolean("recount").notNull().default(false),
    /** ₫ the director types for a surplus of a pair that never had a cost. */
    unitCost: bigint("unit_cost", { mode: "number" }),
  },
  (table) => [
    check(
      "stocktake_line_condition_check",
      sql`${table.condition} in ('NEW', 'GOOD', 'NEEDS_REPAIR', 'SCRAP')`,
    ),
    check(
      "stocktake_line_origin_check",
      sql`${table.origin} in ('LISTED', 'ADDED')`,
    ),
    check(
      "stocktake_line_count_check",
      sql`(${table.countedAt} is null and ${table.countedQuantity} is null and ${table.bookQuantity} is null) or (${table.countedAt} is not null and ${table.countedQuantity} is not null and ${table.bookQuantity} is not null and ${table.countedQuantity} >= 0)`,
    ),
    check(
      "stocktake_line_flags_check",
      sql`${table.flags} <@ array['MOVED', 'OVER_PCT', 'CONDITION_SWAP']::text[]`,
    ),
    check(
      "stocktake_line_unit_cost_check",
      sql`${table.unitCost} is null or ${table.unitCost} >= 0`,
    ),
    unique("stocktake_line_pair_unique").on(
      table.stocktakeId,
      table.itemId,
      table.condition,
    ),
    index("stocktake_line_item_idx").on(table.itemId),
  ],
);

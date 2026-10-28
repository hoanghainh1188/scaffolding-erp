// Repair slips (simple-repair, design D8): needs-repair stock goes to Good
// or Scrap. Only what the user types is stored, plus the scrap price used
// and the damage loss; every other figure is read back from the ledger.
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
  },
  (table) => [
    check(
      "repair_order_status_check",
      sql`${table.status} in ('DRAFT', 'POSTED')`,
    ),
    check(
      "repair_order_posted_check",
      sql`(${table.status} = 'DRAFT' and ${table.postedBy} is null and ${table.postedAt} is null and ${table.postingId} is null) or (${table.status} = 'POSTED' and ${table.postedBy} is not null and ${table.postedAt} is not null and ${table.postingId} is not null)`,
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
  },
  (table) => [
    check(
      "repair_order_line_quantity_check",
      sql`${table.quantityTaken} > 0 and ${table.quantityGood} >= 0 and ${table.quantityScrap} >= 0 and ${table.quantityGood} + ${table.quantityScrap} = ${table.quantityTaken}`,
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

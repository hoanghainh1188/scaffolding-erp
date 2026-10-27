// Master data (master-data, design D10): items, groups, kits, partners,
// sites and locations. Every foreign key into these tables is RESTRICT, so a
// row that something refers to can only be archived, never deleted (D7).
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  numeric,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/** Same rule as src/domain/item-code.ts (item, kit, yard and workshop codes). */
const CODE_PATTERN = "^[A-Z0-9]+(-[A-Z0-9]+)*$";

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);

const audit = () => ({
  status: text("status").notNull().default("ACTIVE"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // NULL only for rows the system creates (the default yard and workshop).
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "restrict",
  }),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "restrict",
  }),
});

const statusCheck = (name: string, column: unknown) =>
  check(name, sql`${column} in ('ACTIVE', 'ARCHIVED')`);

export const customerCodeSeq = pgSequence("customer_code_seq");
export const supplierCodeSeq = pgSequence("supplier_code_seq");
export const siteCodeSeq = pgSequence("site_code_seq");

export const itemGroup = pgTable(
  "item_group",
  {
    id: id(),
    name: text("name").notNull(),
    // Name without accents, lower case: "Giàn giáo" and "giàn giáo" clash.
    nameKey: text("name_key").notNull().unique(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...audit(),
  },
  (table) => [statusCheck("item_group_status_check", table.status)],
);

export const item = pgTable(
  "item",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => itemGroup.id, { onDelete: "restrict" }),
    unit: text("unit").notNull(),
    standardWeightKg: numeric("standard_weight_kg", {
      precision: 10,
      scale: 3,
    }),
    dailyRentalPrice: bigint("daily_rental_price", { mode: "number" }),
    lostPrice: bigint("lost_price", { mode: "number" }),
    damagePrice: bigint("damage_price", { mode: "number" }),
    searchText: text("search_text").notNull(),
    ...audit(),
  },
  (table) => [
    check("item_unit_check", sql`${table.unit} in ('PIECE', 'KG')`),
    check(
      "item_weight_check",
      sql`(${table.unit} = 'PIECE' and ${table.standardWeightKg} is not null and ${table.standardWeightKg} > 0) or (${table.unit} = 'KG' and ${table.standardWeightKg} is null)`,
    ),
    check(
      "item_rental_unit_check",
      sql`${table.unit} = 'PIECE' or ${table.dailyRentalPrice} is null`,
    ),
    check(
      "item_prices_check",
      sql`coalesce(${table.dailyRentalPrice}, 0) >= 0 and coalesce(${table.lostPrice}, 0) >= 0 and coalesce(${table.damagePrice}, 0) >= 0`,
    ),
    check(
      "item_code_check",
      sql`${table.code} ~ ${sql.raw(`'${CODE_PATTERN}'`)} and length(${table.code}) between 2 and 20`,
    ),
    statusCheck("item_status_check", table.status),
    index("item_group_idx").on(table.groupId),
  ],
);

export const kit = pgTable(
  "kit",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    searchText: text("search_text").notNull(),
    ...audit(),
  },
  (table) => [
    check(
      "kit_code_check",
      sql`${table.code} ~ ${sql.raw(`'${CODE_PATTERN}'`)} and length(${table.code}) between 2 and 20`,
    ),
    statusCheck("kit_status_check", table.status),
  ],
);

export const kitComponent = pgTable(
  "kit_component",
  {
    kitId: uuid("kit_id")
      .notNull()
      .references(() => kit.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.kitId, table.itemId] }),
    check("kit_component_quantity_check", sql`${table.quantity} >= 1`),
    index("kit_component_item_idx").on(table.itemId),
  ],
);

const partnerKindCheck = (name: string, column: unknown) =>
  check(name, sql`${column} in ('COMPANY', 'PERSON')`);

export const customer = pgTable(
  "customer",
  {
    id: id(),
    code: text("code").notNull().unique(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    taxCode: text("tax_code"),
    contactName: text("contact_name"),
    phone: text("phone"),
    address: text("address"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    note: text("note"),
    searchText: text("search_text").notNull(),
    ...audit(),
  },
  (table) => [
    partnerKindCheck("customer_kind_check", table.kind),
    check(
      "customer_payment_terms_check",
      sql`${table.paymentTermsDays} between 0 and 365`,
    ),
    statusCheck("customer_status_check", table.status),
  ],
);

export const supplier = pgTable(
  "supplier",
  {
    id: id(),
    code: text("code").notNull().unique(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    taxCode: text("tax_code"),
    // CCCD: personal data, masked everywhere but the edit form (D5).
    idNumber: text("id_number"),
    bankAccount: text("bank_account"),
    bankName: text("bank_name"),
    note: text("note"),
    searchText: text("search_text").notNull(),
    ...audit(),
  },
  (table) => [
    partnerKindCheck("supplier_kind_check", table.kind),
    check(
      "supplier_id_number_check",
      sql`${table.idNumber} is null or ${table.idNumber} ~ '^[0-9]{12}$'`,
    ),
    statusCheck("supplier_status_check", table.status),
  ],
);

export const location = pgTable(
  "location",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    ...audit(),
  },
  (table) => [
    check(
      "location_type_check",
      sql`${table.type} in ('YARD', 'WORKSHOP', 'SITE')`,
    ),
    statusCheck("location_status_check", table.status),
  ],
);

export const site = pgTable(
  "site",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    address: text("address"),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    locationId: uuid("location_id")
      .notNull()
      .unique()
      .references(() => location.id, { onDelete: "restrict" }),
    searchText: text("search_text").notNull(),
    ...audit(),
  },
  (table) => [
    statusCheck("site_status_check", table.status),
    index("site_customer_idx").on(table.customerId),
  ],
);

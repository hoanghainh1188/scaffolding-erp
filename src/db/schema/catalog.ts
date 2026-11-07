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
import { UNIT_SQL } from "./units";

// Item, kit and old codes (catalog-extensions design D1). The full rule
// (Unicode letters and digits only) lives in src/domain/item-code.ts: the
// character classes of Postgres follow the DB collation. Here only the
// collation-free part: length, upper case, no leading/trailing/double joiner.
// Uniqueness key of an item, kit or old code: no Vietnamese accents
// (Đ → D), no spaces, lower case. NỐI 34 and NOI34 share "noi34". Computed by
// the DB so no writer can forget it; codes are upper case, so translate()
// only needs upper-case letters and lower() only meets ASCII (no collation).
// Same rule as itemCodeKey in src/domain/item-code.ts.
const ACCENTED =
  "ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ ";
const PLAIN =
  "AAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD";
const codeKey = (column: string) =>
  text("code_key")
    .notNull()
    .unique()
    .generatedAlwaysAs(
      sql.raw(`lower(translate("${column}", '${ACCENTED}', '${PLAIN}'))`),
    );

const itemCodeCheck = (name: string, column: unknown) =>
  check(
    name,
    sql`char_length(${column}) between 2 and 30 and ${column} = upper(${column}) and ${column} = btrim(${column}) and ${column} !~ '[,*+ -]{2}' and ${column} !~ '^[,*+ -]|[,*+ -]$'`,
  );

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
    // Thiết bị (goods the company trades) or Vật tư (raw materials, workshop
    // supplies); items take it from their group (design D3).
    category: text("category").notNull().default("EQUIPMENT"),
    ...audit(),
  },
  (table) => [
    statusCheck("item_group_status_check", table.status),
    check(
      "item_group_category_check",
      sql`${table.category} in ('EQUIPMENT', 'MATERIAL')`,
    ),
  ],
);

export const item = pgTable(
  "item",
  {
    id: id(),
    code: text("code").notNull().unique(),
    // Shared space with kit.code_key and item_alias.code_key (design D1).
    codeKey: codeKey("code"),
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
    /** ₫ per repaired piece, piece-rate labour (0.2 số 117); null = not set. */
    repairLaborRate: bigint("repair_labor_rate", { mode: "number" }),
    searchText: text("search_text").notNull(),
    ...audit(),
  },
  (table) => [
    check("item_unit_check", sql`${table.unit} in ${UNIT_SQL}`),
    check(
      "item_weight_check",
      sql`(${table.unit} = 'KG' and ${table.standardWeightKg} is null) or (${table.unit} <> 'KG' and ${table.standardWeightKg} is not null and ${table.standardWeightKg} > 0)`,
    ),
    check(
      "item_prices_check",
      sql`coalesce(${table.dailyRentalPrice}, 0) >= 0 and coalesce(${table.lostPrice}, 0) >= 0 and coalesce(${table.damagePrice}, 0) >= 0 and coalesce(${table.repairLaborRate}, 0) >= 0`,
    ),
    itemCodeCheck("item_code_check", table.code),
    statusCheck("item_status_check", table.status),
    index("item_group_idx").on(table.groupId),
  ],
);

/**
 * Old codes (other names) of an item, up to 5, for search and typing
 * (design D1). Never referenced by documents, so they go with the item.
 */
export const itemAlias = pgTable(
  "item_alias",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    codeKey: codeKey("code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    itemCodeCheck("item_alias_code_check", table.code),
    index("item_alias_item_idx").on(table.itemId),
  ],
);

export const kit = pgTable(
  "kit",
  {
    id: id(),
    code: text("code").notNull().unique(),
    codeKey: codeKey("code"),
    name: text("name").notNull(),
    searchText: text("search_text").notNull(),
    ...audit(),
  },
  (table) => [
    itemCodeCheck("kit_code_check", table.code),
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
    // Sales staff in charge (design D5); only for filters and reports, never
    // limits who sees the customer.
    salesUserId: text("sales_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    searchText: text("search_text").notNull(),
    ...audit(),
  },
  (table) => [
    partnerKindCheck("customer_kind_check", table.kind),
    index("customer_sales_user_idx").on(table.salesUserId),
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
    // Days the seller lets us owe (payables design D2, 0.2 #99); 0 = pay on
    // receipt. Copied onto each goods receipt as its due date when posted.
    paymentTermsDays: integer("payment_terms_days").notNull().default(0),
    note: text("note"),
    searchText: text("search_text").notNull(),
    ...audit(),
  },
  (table) => [
    partnerKindCheck("supplier_kind_check", table.kind),
    check(
      "supplier_payment_terms_check",
      sql`${table.paymentTermsDays} between 0 and 365`,
    ),
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
    // Province code from src/domain/province.ts; the region follows from it.
    // No CHECK: the list may change with the administration (design D4).
    province: text("province"),
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
    index("site_province_idx").on(table.province),
  ],
);

// Rental and sale contracts (contracts design D2, D13). A contract row holds
// what never changes after the first save (code, type, customer); everything
// an amendment may change lives in a revision: number 0 is the original,
// 1, 2... the amendments, each a full copy. A revision the director approved
// is frozen by a trigger, child rows included.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
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
import { customer, item, kit, site } from "./catalog";

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "restrict" });

const at = (name: string) => timestamp(name, { withTimezone: true });

export const contract = pgTable(
  "contract",
  {
    id: id(),
    code: text("code").notNull().unique(),
    type: text("type").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    /** Empty only for a sale picked up at the yard. */
    siteId: uuid("site_id").references(() => site.id, {
      onDelete: "restrict",
    }),
    status: text("status").notNull().default("DRAFT"),
    /** Copied from the customer when the contract is created (0.2 #41). */
    salesUserId: userRef("sales_user_id"),
    /** The <KHÁCH> part of the code, reused for the customer's next one. */
    customerToken: text("customer_token").notNull(),
    lastAmendmentNumber: integer("last_amendment_number").notNull().default(0),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("contract_type_check", sql`${table.type} in ('RENTAL', 'SALE')`),
    check(
      "contract_status_check",
      sql`${table.status} in ('DRAFT', 'PENDING', 'APPROVED', 'ACTIVE', 'CLOSED', 'CANCELLED')`,
    ),
    check(
      "contract_site_check",
      sql`${table.type} = 'SALE' or ${table.siteId} is not null`,
    ),
    check(
      "contract_customer_token_check",
      sql`${table.customerToken} ~ '^[A-Z0-9]{1,20}$'`,
    ),
    check(
      "contract_amendment_number_check",
      sql`${table.lastAmendmentNumber} >= 0`,
    ),
    index("contract_status_idx").on(table.status, table.createdAt),
    index("contract_customer_idx").on(table.customerId),
    index("contract_site_idx").on(table.siteId),
    index("contract_sales_user_idx").on(table.salesUserId),
  ],
);

export const contractRevision = pgTable(
  "contract_revision",
  {
    id: id(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "restrict" }),
    /** 0 = the original, 1.. = amendment /01, /02... */
    number: integer("number").notNull(),
    kind: text("kind").notNull(),
    /** The contract code, or the contract code + "/01" for an amendment. */
    code: text("code").notNull().unique(),
    status: text("status").notNull().default("DRAFT"),
    basedOnRevisionId: uuid("based_on_revision_id"),
    /** The original: its start date. An amendment: the day new terms apply. */
    effectiveFrom: date("effective_from").notNull(),
    /** Why the amendment is made (amendments only). */
    reason: text("reason"),
    signedDate: date("signed_date"),
    startDate: date("start_date").notNull(),
    /** Expected end (rental only). */
    endDate: date("end_date"),
    minRentalDays: integer("min_rental_days"),
    billingCycle: text("billing_cycle"),
    paymentTermsDays: integer("payment_terms_days").notNull(),
    vatEnabled: boolean("vat_enabled").notNull().default(false),
    vatRate: numeric("vat_rate", { precision: 5, scale: 2 }),
    companyTruck: boolean("company_truck").notNull().default(false),
    freightPerTrip: bigint("freight_per_trip", { mode: "number" }),
    note: text("note"),
    submittedBy: userRef("submitted_by"),
    submittedAt: at("submitted_at"),
    approvedBy: userRef("approved_by"),
    approvedAt: at("approved_at"),
    /** Required when the customer had overdue debt (0.2 #15). */
    approvalReason: text("approval_reason"),
    overdueAmount: bigint("overdue_amount", { mode: "number" }),
    overdueDays: integer("overdue_days"),
    returnedReason: text("returned_reason"),
    cancelledReason: text("cancelled_reason"),
    createdBy: userRef("created_by").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("contract_revision_number_unique").on(
      table.contractId,
      table.number,
    ),
    uniqueIndex("contract_revision_open_amendment_unique")
      .on(table.contractId)
      .where(
        sql`${table.kind} = 'AMENDMENT' and ${table.status} in ('DRAFT', 'PENDING')`,
      ),
    check(
      "contract_revision_kind_check",
      sql`(${table.kind} = 'ORIGINAL' and ${table.number} = 0 and ${table.effectiveFrom} = ${table.startDate}) or (${table.kind} = 'AMENDMENT' and ${table.number} >= 1)`,
    ),
    check(
      "contract_revision_status_check",
      sql`${table.status} in ('DRAFT', 'PENDING', 'APPROVED', 'CANCELLED')`,
    ),
    check(
      "contract_revision_approved_check",
      sql`${table.status} <> 'APPROVED' or (${table.approvedBy} is not null and ${table.approvedAt} is not null)`,
    ),
    check(
      "contract_revision_dates_check",
      sql`${table.endDate} is null or ${table.endDate} > ${table.startDate}`,
    ),
    check(
      "contract_revision_terms_check",
      sql`${table.paymentTermsDays} between 0 and 365 and (${table.minRentalDays} is null or ${table.minRentalDays} between 1 and 365) and (${table.billingCycle} is null or ${table.billingCycle} = 'MONTH_END')`,
    ),
    check(
      "contract_revision_vat_check",
      sql`(${table.vatEnabled} and ${table.vatRate} is not null and ${table.vatRate} > 0 and ${table.vatRate} <= 20) or (not ${table.vatEnabled} and ${table.vatRate} is null)`,
    ),
    check(
      "contract_revision_money_check",
      sql`(${table.freightPerTrip} is null or ${table.freightPerTrip} >= 0) and (${table.overdueAmount} is null or ${table.overdueAmount} >= 0)`,
    ),
    check(
      "contract_revision_text_check",
      sql`(${table.reason} is null or length(${table.reason}) between 1 and 500) and (${table.approvalReason} is null or length(${table.approvalReason}) between 1 and 500) and (${table.note} is null or length(${table.note}) between 1 and 1000)`,
    ),
    index("contract_revision_effective_idx").on(
      table.contractId,
      table.status,
      table.effectiveFrom,
    ),
  ],
);

const revisionRef = () =>
  uuid("revision_id")
    .notNull()
    .references(() => contractRevision.id, { onDelete: "cascade" });

/** Kits the seller added, kept to show "Bộ × 300" and to print the quote. */
export const contractKit = pgTable(
  "contract_kit",
  {
    revisionId: revisionRef(),
    kitId: uuid("kit_id")
      .notNull()
      .references(() => kit.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.kitId] }),
    check("contract_kit_quantity_check", sql`${table.quantity} >= 1`),
    index("contract_kit_kit_idx").on(table.kitId),
  ],
);

/**
 * Rental: one line per item (one price per item, design D9); quantity =
 * own_quantity + what the kits bring. Sale: one line per item + condition +
 * pricing unit.
 */
export const contractLine = pgTable(
  "contract_line",
  {
    id: id(),
    revisionId: revisionRef(),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    /** Sale only: NEW, GOOD or SCRAP. */
    condition: text("condition"),
    pricingUnit: text("pricing_unit").notNull().default("ITEM"),
    ownQuantity: numeric("own_quantity", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    /** ₫ per day (rental) or per unit / kg (sale); empty while drafting. */
    price: bigint("price", { mode: "number" }),
    /** Catalog daily price when the line was added (rental only). */
    catalogPrice: bigint("catalog_price", { mode: "number" }),
  },
  (table) => [
    unique("contract_line_unique")
      .on(table.revisionId, table.itemId, table.condition, table.pricingUnit)
      .nullsNotDistinct(),
    check(
      "contract_line_condition_check",
      sql`${table.condition} is null or ${table.condition} in ('NEW', 'GOOD', 'SCRAP')`,
    ),
    check(
      "contract_line_pricing_unit_check",
      sql`${table.pricingUnit} in ('ITEM', 'KG') and (${table.condition} is distinct from 'SCRAP' or ${table.pricingUnit} = 'KG')`,
    ),
    check(
      "contract_line_quantity_check",
      sql`${table.quantity} > 0 and ${table.ownQuantity} >= 0 and ${table.ownQuantity} <= ${table.quantity}`,
    ),
    check(
      "contract_line_price_check",
      sql`(${table.price} is null or ${table.price} >= 0) and (${table.catalogPrice} is null or ${table.catalogPrice} >= 0)`,
    ),
    index("contract_line_item_idx").on(table.itemId),
  ],
);

/** Copied from the item's default compensation prices (0.2 #20, #49). */
export const contractCompensation = pgTable(
  "contract_compensation",
  {
    revisionId: revisionRef(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    lostPrice: bigint("lost_price", { mode: "number" }),
    damagePrice: bigint("damage_price", { mode: "number" }),
    catalogLostPrice: bigint("catalog_lost_price", { mode: "number" }),
    catalogDamagePrice: bigint("catalog_damage_price", { mode: "number" }),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.itemId] }),
    check(
      "contract_compensation_price_check",
      sql`coalesce(${table.lostPrice}, 0) >= 0 and coalesce(${table.damagePrice}, 0) >= 0 and coalesce(${table.catalogLostPrice}, 0) >= 0 and coalesce(${table.catalogDamagePrice}, 0) >= 0`,
    ),
  ],
);

/**
 * Agreed deposits only (review of PR #128): money received and offsets
 * belong to receivables.
 */
export const contractDeposit = pgTable(
  "contract_deposit",
  {
    id: id(),
    revisionId: revisionRef(),
    lineNo: integer("line_no").notNull(),
    kind: text("kind").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    method: text("method"),
    bankName: text("bank_name"),
    guaranteeNumber: text("guarantee_number"),
    expiryDate: date("expiry_date"),
  },
  (table) => [
    check(
      "contract_deposit_shape_check",
      sql`${table.amount} > 0 and ((${table.kind} = 'CASH' and ${table.method} is not null and ${table.method} in ('CASH', 'TRANSFER') and ${table.bankName} is null and ${table.guaranteeNumber} is null and ${table.expiryDate} is null) or (${table.kind} = 'GUARANTEE' and ${table.method} is null and ${table.bankName} is not null and ${table.guaranteeNumber} is not null and length(${table.bankName}) between 1 and 100 and length(${table.guaranteeNumber}) between 1 and 50 and ${table.expiryDate} is not null))`,
    ),
    index("contract_deposit_revision_idx").on(table.revisionId),
  ],
);

/** Planned deliveries: a forecast only, never binding (design D6). */
export const contractDeliveryBatch = pgTable(
  "contract_delivery_batch",
  {
    id: id(),
    revisionId: revisionRef(),
    seq: integer("seq").notNull(),
    plannedDate: date("planned_date").notNull(),
    note: text("note"),
  },
  (table) => [
    unique("contract_delivery_batch_seq_unique").on(
      table.revisionId,
      table.seq,
    ),
    check(
      "contract_delivery_batch_note_check",
      sql`${table.note} is null or length(${table.note}) between 1 and 200`,
    ),
  ],
);

export const contractDeliveryBatchLine = pgTable(
  "contract_delivery_batch_line",
  {
    id: id(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => contractDeliveryBatch.id, { onDelete: "cascade" }),
    kitId: uuid("kit_id").references(() => kit.id, { onDelete: "restrict" }),
    itemId: uuid("item_id").references(() => item.id, {
      onDelete: "restrict",
    }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    check(
      "contract_delivery_batch_line_check",
      sql`(${table.kitId} is null) <> (${table.itemId} is null) and ${table.quantity} > 0`,
    ),
    index("contract_delivery_batch_line_batch_idx").on(table.batchId),
  ],
);

export type ContractRow = typeof contract.$inferSelect;
export type ContractRevisionRow = typeof contractRevision.$inferSelect;

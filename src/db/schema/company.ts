// Company settings schema (spec company-settings, K10).
// Singleton table storing legal and branding info for printouts and headers.
import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const companyProfile = pgTable(
  "company_profile",
  {
    id: integer("id").primaryKey().default(1),
    name: text("name").notNull(),
    shortName: text("short_name"),
    taxId: text("tax_id"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    bankAccount: text("bank_account"),
    bankName: text("bank_name"),
    logoUrl: text("logo_url"),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("company_profile_singleton_check", sql`${table.id} = 1`),
    check("company_profile_name_check", sql`length(trim(${table.name})) > 0`),
  ],
);

export type CompanyProfileRow = typeof companyProfile.$inferSelect;
export type InsertCompanyProfileRow = typeof companyProfile.$inferInsert;

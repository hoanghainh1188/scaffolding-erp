// Read-only indexes of the dashboard (dashboard-basic tasks 1.2, design D2)
// and of the reports (management-reports tasks 1.1):
// the three indexes exist, and the migration adds indexes only, so it
// cannot change a row of any table.
import { readFileSync } from "node:fs";
import path from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";

const ctx = createTestContext();
afterAll(ctx.close);

const INDEXES = [
  ["inventory_ledger", "inventory_ledger_movement_date_idx"],
  ["delivery_note", "delivery_note_posted_date_idx"],
  ["billing_period", "billing_period_month_idx"],
  // management-reports tasks 1.1, design D4.
  ["inventory_ledger", "inventory_ledger_business_date_idx"],
] as const;

describe("dashboard indexes", () => {
  it.each(INDEXES)("%s has %s", async (table, name) => {
    const rows = await getAdminDatabase().execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where tablename = ${table} and indexname = ${name}`,
    );
    expect(rows.map((row) => row.indexname)).toEqual([name]);
  });

  it("the posted-date index covers posted notes only", async () => {
    const rows = await getAdminDatabase().execute<{ indexdef: string }>(
      sql`select indexdef from pg_indexes where indexname = 'delivery_note_posted_date_idx'`,
    );
    expect(rows[0]?.indexdef).toContain("WHERE (status = 'POSTED'::text)");
  });

  it.each([
    ["0020_dashboard_basic.sql", 3],
    ["0022_management_reports.sql", 1],
  ])("migration %s only creates indexes", (name, count) => {
    const file = readFileSync(path.join(process.cwd(), "drizzle", name), "utf8");
    const statements = file
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(count);
    for (const statement of statements) {
      expect(statement).toMatch(/^CREATE INDEX "[a-z_]+" ON "[a-z_]+"/);
    }
  });

  it("a month of the ledger can be read through the business date index", async () => {
    const db = getAdminDatabase();
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      return tx.execute<{ "QUERY PLAN": string }>(
        sql`explain select movement, sum(amount) from inventory_ledger where business_date between '2026-10-01' and '2026-10-31' group by movement`,
      );
    });
    expect(rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
      "inventory_ledger_business_date_idx",
    );
  });
});

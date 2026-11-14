// personal-data-protection step 2 (tasks 12.2): the migration drops the old
// plain-text columns, and refuses while any row still holds data there.
// The test database is already migrated, so each case puts the columns back
// inside a transaction, runs the migration file, and rolls back.
import { readFileSync } from "node:fs";
import path from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import { resetCatalogTables } from "@/test/catalog";

const ctx = createTestContext();
afterAll(ctx.close);

const MIGRATION = readFileSync(
  path.join(process.cwd(), "drizzle/0030_drop_legacy_pii.sql"),
  "utf8",
);
const STATEMENTS = MIGRATION.split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

class Rollback extends Error {}

/** Columns of supplier with these names, as the owner sees them. */
async function legacyColumns(
  tx: Pick<ReturnType<typeof getAdminDatabase>, "execute">,
): Promise<string[]> {
  const rows = await tx.execute<{ name: string }>(sql`
    select column_name as name from information_schema.columns
    where table_name = 'supplier' and column_name in ('id_number', 'bank_account')
    order by column_name`);
  return rows.map((row) => row.name);
}

/**
 * Restores the step 1 shape (old columns, old CHECK) with one supplier
 * holding `values`, runs the migration, and always rolls back.
 */
async function migrateWith(values: {
  idNumber: string | null;
  bankAccount: string | null;
}): Promise<{ error: string | null; columns: string[] }> {
  let outcome: { error: string | null; columns: string[] } = {
    error: null,
    columns: [],
  };
  try {
    await getAdminDatabase().transaction(async (tx) => {
      await tx.execute(sql`
        alter table supplier
          add column id_number text,
          add column bank_account text,
          add constraint supplier_id_number_check
            check (id_number is null or id_number ~ '^[0-9]{12}$')`);
      await tx.execute(sql`
        insert into supplier (code, kind, name, search_text, id_number, bank_account)
        values ('NCC-9001', 'PERSON', 'Anh Tâm', 'anh tam',
          ${values.idNumber}, ${values.bankAccount})`);
      await tx.execute(sql`savepoint before_migration`);
      try {
        for (const statement of STATEMENTS)
          await tx.execute(sql.raw(statement));
      } catch (error) {
        await tx.execute(sql`rollback to savepoint before_migration`);
        outcome = {
          error: error instanceof Error ? collectMessage(error) : String(error),
          columns: await legacyColumns(tx),
        };
        throw new Rollback();
      }
      const constraints = await tx.execute<{ name: string }>(sql`
        select conname as name from pg_constraint
        where conname = 'supplier_id_number_check'`);
      expect(constraints).toHaveLength(0);
      outcome = { error: null, columns: await legacyColumns(tx) };
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return outcome;
}

/** The driver wraps the database error; its text sits in the cause chain. */
function collectMessage(error: Error): string {
  const parts: string[] = [];
  for (let current: unknown = error; current instanceof Error;) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" | ");
}

describe("migration 0030_drop_legacy_pii", () => {
  it("has left supplier without the old columns", async () => {
    expect(await legacyColumns(getAdminDatabase())).toEqual([]);
  });

  it("drops both columns and the old CHECK once they are empty", async () => {
    await resetCatalogTables();
    expect(await migrateWith({ idNumber: null, bankAccount: null })).toEqual({
      error: null,
      columns: [],
    });
  });

  it.each([
    ["a CCCD", { idNumber: "000203012345", bankAccount: null }],
    ["an account", { idNumber: null, bankAccount: "0451000312345678" }],
  ])(
    "stops, keeping both columns, while a row still holds %s",
    async (_name, values) => {
      await resetCatalogTables();
      const result = await migrateWith(values);
      expect(result.columns).toEqual(["bank_account", "id_number"]);
      expect(result.error).toContain(
        "1 supplier rows still hold id_number or bank_account",
      );
      // The error names a count, never the number itself.
      for (const secret of [values.idNumber, values.bankAccount]) {
        if (secret !== null) expect(result.error).not.toContain(secret);
      }
    },
  );
});

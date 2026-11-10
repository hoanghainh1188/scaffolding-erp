// `npm run pii:backfill` (personal-data-protection D5): step 1 of the two-step
// migration. The only file that still reads supplier.id_number and
// supplier.bank_account, with raw SQL because the schema no longer has them.
// One transaction per row; a finished row leaves the filter. Step 2 deletes
// this file.
import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { bankLast4FromLegacy } from "@/domain/partner-fields";

import { encryptIdNumber, type PiiKeyRing } from "./cipher";

export interface BackfillResult {
  migrated: number;
  /** Accounts too short to give 4 digits: emptied, nothing kept. */
  accountsDropped: number;
}

const STILL_LEGACY = sql`id_number is not null or bank_account is not null`;

type LegacyRow = {
  id: string;
  id_number: string | null;
  bank_account: string | null;
  anonymized_at: unknown;
  [key: string]: unknown;
};

/** Rows that still hold a value in an old column. */
export async function countLegacyRows(db: Database): Promise<number> {
  const rows = await db.execute<{ value: number }>(
    sql`select count(*)::int as value from supplier where ${STILL_LEGACY}`,
  );
  return rows[0]?.value ?? 0;
}

async function backfillOne(
  db: Database,
  ring: PiiKeyRing,
): Promise<"done" | "dropped" | "migrated"> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute<LegacyRow>(sql`
      select id::text, id_number, bank_account, anonymized_at
      from supplier where ${STILL_LEGACY}
      order by id limit 1 for update skip locked`);
    const row = rows[0];
    if (!row) return "done";
    if (row.anonymized_at !== null) {
      await tx.execute(sql`
        update supplier set id_number = null, bank_account = null
        where id = ${row.id}::uuid`);
      return "migrated";
    }
    const last4 =
      row.bank_account === null ? null : bankLast4FromLegacy(row.bank_account);
    const enc =
      row.id_number === null
        ? null
        : encryptIdNumber(row.id, row.id_number, ring);
    // What was saved after the deploy is newer than the old column: it wins.
    await tx.execute(sql`
      update supplier set
        id_number_enc = coalesce(id_number_enc, ${enc}),
        id_number_last4 = coalesce(id_number_last4, ${row.id_number?.slice(-4) ?? null}),
        bank_account_last4 = coalesce(bank_account_last4, ${last4}),
        id_number = null,
        bank_account = null
      where id = ${row.id}::uuid`);
    return row.bank_account !== null && last4 === null ? "dropped" : "migrated";
  });
}

export async function backfillLegacyPii(
  db: Database,
  ring: PiiKeyRing,
): Promise<BackfillResult> {
  let migrated = 0;
  let accountsDropped = 0;
  for (;;) {
    const outcome = await backfillOne(db, ring);
    if (outcome === "done") return { migrated, accountsDropped };
    migrated += 1;
    if (outcome === "dropped") accountsDropped += 1;
  }
}

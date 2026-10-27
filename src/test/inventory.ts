// Integration-test helpers for the inventory tables (inventory-ledger D1).
import { sql } from "drizzle-orm";

import type { Database, DatabaseHandle } from "@/db/client";

/**
 * Runs a TRUNCATE that may reach inventory_ledger (directly or through
 * CASCADE). The ledger trigger lets it through only on a *_test database
 * and only with this flag set for the transaction.
 */
export async function truncateWithLedger(
  db: Database,
  statement: ReturnType<typeof sql>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local inventory.allow_truncate = 'on'`);
    await tx.execute(statement);
  });
}

/** Empties the ledger, costs, adjustments and document numbers. */
export async function resetInventoryTables({
  db,
}: Pick<DatabaseHandle, "db">): Promise<void> {
  await truncateWithLedger(
    db,
    sql`truncate table "inventory_ledger", "inventory_cost", "stock_adjustment_line", "stock_adjustment", "document_counter"`,
  );
}

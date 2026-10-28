// Integration-test helpers for the master-data tables.
import { sql } from "drizzle-orm";

import type { DatabaseHandle } from "@/db/client";

import { truncateWithLedger } from "./inventory";

/**
 * Empties every catalog table, restarts the code sequences and puts back
 * the default yard and workshop the migration seeds. Call in beforeEach.
 */
export async function resetCatalogTables({
  db,
}: Pick<DatabaseHandle, "db">): Promise<void> {
  // Repair slips, goods receipts and purchase orders refer to suppliers,
  // items and places, so they go too. CASCADE reaches the inventory ledger and the
  // scrap price history, which only a test may empty.
  await truncateWithLedger(
    db,
    sql`truncate table "repair_order_line", "repair_order", "goods_receipt_cost", "goods_receipt_line", "goods_receipt", "scrap_price", "purchase_order_event", "purchase_order_cost", "purchase_order_line", "purchase_order", "kit_component", "kit", "item", "item_group", "site", "location", "customer", "supplier" cascade`,
  );
  await db.execute(
    sql`alter sequence customer_code_seq restart; alter sequence supplier_code_seq restart; alter sequence site_code_seq restart`,
  );
  await db.execute(
    sql`insert into "location" ("code", "name", "type") values ('BAI-01', 'Bãi chính', 'YARD'), ('XUONG-01', 'Xưởng', 'WORKSHOP')`,
  );
}

// Before any E2E test: put the e2e.* accounts in a known state and remove
// the throwaway accounts earlier runs created. Uses the same database as the
// dev server (DATABASE_URL).
import { and, eq, like, notInArray, sql } from "drizzle-orm";

import { createDatabase, type Database } from "@/db/client";
import {
  customer,
  inventoryLedger,
  item,
  itemGroup,
  kit,
  location,
  site,
  stockAdjustmentLine,
  user,
} from "@/db/schema";
import { createAuth } from "@/lib/auth/auth";
import { getEnv } from "@/lib/env";
import { createItem } from "@/lib/catalog/items";
import { seedCatalog } from "@/lib/catalog/seed";
import { seedInventory } from "@/lib/inventory/sample";
import { E2E_ACCOUNTS, E2E_TEMP_PREFIX } from "@/lib/users/e2e-accounts";
import { seedAccounts } from "@/lib/users/seed";

/**
 * Rows catalog.spec.ts creates (codes E2E-..., sites "Công trình thử ..."),
 * and the term it edits: back to the seed, so screenshots stay stable.
 */
async function removeTestCatalogRows(db: Database): Promise<void> {
  await db.delete(kit).where(like(kit.code, "E2E-%"));
  // The ledger is append-only: items and sites it names stay (inventory-ledger
  // design D14), the rest goes.
  const usedItems = sql`(select item_id from ${inventoryLedger} union select item_id from ${stockAdjustmentLine})`;
  await db
    .delete(item)
    .where(and(like(item.code, "E2E-%"), notInArray(item.id, usedItems)));
  const usedPlaces = sql`(select location_id from ${inventoryLedger} union select location_id from ${stockAdjustmentLine} union select to_location_id from ${stockAdjustmentLine} where to_location_id is not null)`;
  const sites = await db
    .delete(site)
    .where(
      and(
        like(site.name, "Công trình thử %"),
        notInArray(site.locationId, usedPlaces),
      ),
    )
    .returning({ locationId: site.locationId });
  for (const { locationId } of sites) {
    await db.delete(location).where(eq(location.id, locationId));
  }
  await db
    .update(customer)
    .set({ paymentTermsDays: 30 })
    .where(eq(customer.code, "NT-0001"));
}

/** Fixed items inventory.spec.ts posts to; created once, never deleted. */
export const E2E_STOCK_ITEMS = ["E2E-KHO-01", "E2E-KHO-02"] as const;

async function ensureStockItems(db: Database, actor: { id: string }) {
  const [group] = await db
    .select({ id: itemGroup.id })
    .from(itemGroup)
    .where(eq(itemGroup.nameKey, "gian giao"));
  for (const [index, code] of E2E_STOCK_ITEMS.entries()) {
    const [found] = await db
      .select({ id: item.id })
      .from(item)
      .where(eq(item.code, code));
    if (found) continue;
    const created = await createItem(db, actor, {
      code,
      name: `Vật tư kho thử ${index + 1}`,
      groupId: group?.id,
      unit: "PIECE",
      standardWeightKg: "10",
    });
    if (!created.ok) throw new Error(`${code}: ${created.error}`);
  }
}

export default async function globalSetup(): Promise<void> {
  const env = getEnv();
  if (!env.E2E_PASSWORD) {
    throw new Error("E2E_PASSWORD is not set (see .env.example).");
  }
  const handle = createDatabase(env.DATABASE_URL);
  try {
    const auth = createAuth({
      db: handle.db,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
    });
    // Test-only rows: sessions and accounts go with them (ON DELETE CASCADE).
    await handle.db
      .delete(user)
      .where(like(user.username, `${E2E_TEMP_PREFIX}%`));
    await seedAccounts({ db: handle.db, auth }, E2E_ACCOUNTS, {
      password: env.E2E_PASSWORD,
      reset: true,
    });
    // The D9 / D16 sample data, so catalog tests and screenshots have rows.
    const [director] = await handle.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.username, "e2e.giamdoc"));
    await removeTestCatalogRows(handle.db);
    if (director) {
      await seedCatalog(handle.db, director);
      await ensureStockItems(handle.db, director);
      // D10 / D11 sample stock (design D11), on an empty ledger only.
      await seedInventory(handle.db, director);
    }
  } finally {
    await handle.close();
  }
}

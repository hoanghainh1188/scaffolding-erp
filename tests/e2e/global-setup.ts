// Before any E2E test: put the e2e.* accounts in a known state and remove
// the throwaway accounts earlier runs created. Uses the same database as the
// dev server (DATABASE_URL).
import { eq, like } from "drizzle-orm";

import { createDatabase, type Database } from "@/db/client";
import { customer, item, kit, location, site, user } from "@/db/schema";
import { createAuth } from "@/lib/auth/auth";
import { getEnv } from "@/lib/env";
import { seedCatalog } from "@/lib/catalog/seed";
import { E2E_ACCOUNTS, E2E_TEMP_PREFIX } from "@/lib/users/e2e-accounts";
import { seedAccounts } from "@/lib/users/seed";

/**
 * Rows catalog.spec.ts creates (codes E2E-..., sites "Công trình thử ..."),
 * and the term it edits: back to the seed, so screenshots stay stable.
 */
async function removeTestCatalogRows(db: Database): Promise<void> {
  await db.delete(kit).where(like(kit.code, "E2E-%"));
  await db.delete(item).where(like(item.code, "E2E-%"));
  const sites = await db
    .delete(site)
    .where(like(site.name, "Công trình thử %"))
    .returning({ locationId: site.locationId });
  for (const { locationId } of sites) {
    await db.delete(location).where(eq(location.id, locationId));
  }
  await db
    .update(customer)
    .set({ paymentTermsDays: 30 })
    .where(eq(customer.code, "NT-0001"));
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
    if (director) await seedCatalog(handle.db, director);
  } finally {
    await handle.close();
  }
}

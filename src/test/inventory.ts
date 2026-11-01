// Integration-test helpers for the inventory tables (inventory-ledger D1).
import { sql } from "drizzle-orm";

import { getAdminDatabase } from "./admin";

/**
 * Runs a TRUNCATE that may reach inventory_ledger (directly or through
 * CASCADE) as the table owner: the app role has no TRUNCATE. The ledger
 * trigger lets it through only on a *_test database and only with this
 * flag set for the transaction.
 */
export async function truncateWithLedger(
  statement: ReturnType<typeof sql>,
): Promise<void> {
  await getAdminDatabase().transaction(async (tx) => {
    await tx.execute(sql`set local inventory.allow_truncate = 'on'`);
    await tx.execute(statement);
  });
}

/** Empties the ledger, costs, adjustments and document numbers. */
export async function resetInventoryTables(): Promise<void> {
  await truncateWithLedger(
    sql`truncate table "inventory_ledger", "inventory_cost", "stock_adjustment_line", "stock_adjustment", "document_counter"`,
  );
}

export interface InventoryFixture {
  director: import("./auth").TestUser;
  accountant: import("./auth").TestUser;
  /** Item id by code (seedCatalog items). */
  item: (code: string) => string;
  /** Location id by code (BAI-01, XUONG-01) or sample site key. */
  place: (key: string) => string;
}

/**
 * Fresh auth, catalog and inventory tables with the sample catalog, the
 * sample sites and two users. Call in beforeEach.
 */
export async function setupInventoryFixture(
  ctx: import("./auth").TestContext,
): Promise<InventoryFixture> {
  const { createTestUser, resetAuthTables } = await import("./auth");
  const { resetCatalogTables } = await import("./catalog");
  const { seedCatalog } = await import("@/lib/catalog/seed");
  const { SAMPLE_SITES } = await import("@/lib/inventory/sample");
  const { createSite } = await import("@/lib/catalog/places");
  const schema = await import("@/db/schema");

  await resetAuthTables();
  await resetCatalogTables();
  await resetInventoryTables();
  const director = await createTestUser(ctx, {
    role: "DIRECTOR",
    username: "minhanh",
  });
  const accountant = await createTestUser(ctx, {
    role: "ACCOUNTANT",
    username: "thuha",
  });
  await seedCatalog(ctx.db, director);
  const [owner] = await ctx.db
    .select({ id: schema.customer.id })
    .from(schema.customer)
    .orderBy(schema.customer.code)
    .limit(1);
  const places = new Map<string, string>();
  for (const [key, name] of Object.entries(SAMPLE_SITES)) {
    const [existing] = await ctx.db
      .select({ locationId: schema.site.locationId })
      .from(schema.site)
      .where(sql`${schema.site.name} = ${name}`);
    if (existing) {
      places.set(key, existing.locationId);
      continue;
    }
    const created = await createSite(ctx.db, director, {
      name,
      customerId: owner?.id ?? "",
    });
    if (!created.ok) throw new Error(created.error);
    places.set(key, created.data.locationId);
  }
  for (const row of await ctx.db
    .select({ id: schema.location.id, code: schema.location.code })
    .from(schema.location)) {
    places.set(row.code, row.id);
  }
  const items = new Map(
    (
      await ctx.db
        .select({ id: schema.item.id, code: schema.item.code })
        .from(schema.item)
    ).map((row) => [row.code, row.id]),
  );
  const lookup = (map: Map<string, string>, what: string) => (key: string) => {
    const id = map.get(key);
    if (!id) throw new Error(`fixture has no ${what} ${key}`);
    return id;
  };
  return {
    director,
    accountant,
    item: lookup(items, "item"),
    place: lookup(places, "place"),
  };
}

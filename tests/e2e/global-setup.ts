// Before any E2E test: put the e2e.* accounts in a known state and remove
// the throwaway accounts earlier runs created. Uses the same database as the
// dev server (DATABASE_URL).
import { and, eq, like, notInArray, sql } from "drizzle-orm";

import { createDatabase, type Database } from "@/db/client";
import {
  customer,
  goodsReceipt,
  inventoryCost,
  inventoryLedger,
  item,
  itemGroup,
  kit,
  location,
  purchaseOrder,
  purchaseOrderLine,
  repairOrder,
  site,
  stockAdjustmentLine,
  stocktake,
  user,
} from "@/db/schema";
import { createAuth } from "@/lib/auth/auth";
import { getEnv } from "@/lib/env";
import { createItem } from "@/lib/catalog/items";
import { seedCatalog } from "@/lib/catalog/seed";
import { toBusinessDate } from "@/domain/business-date";
import type { MovementDraft } from "@/domain/movement";
import { postMovements } from "@/lib/inventory/post";
import { seedInventory } from "@/lib/inventory/sample";
import { seedPurchasing } from "@/lib/purchasing/sample";
import { seedReceiving } from "@/lib/receiving/sample";
import { currentScrapPrice, setScrapPrice } from "@/lib/receiving/scrap-price";
import { seedRepairs } from "@/lib/repairs/sample";
import { seedStocktakes } from "@/lib/stocktakes/sample";
import { cancelStocktake } from "@/lib/stocktakes/sessions";
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
  const usedItems = sql`(select item_id from ${inventoryLedger} union select item_id from ${stockAdjustmentLine} union select item_id from ${purchaseOrderLine})`;
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

/**
 * Note of every order purchasing.spec.ts and receiving.spec.ts create.
 * Earlier runs' orders go, so D2 counts and codes stay small; an order with
 * a goods receipt stays, because its ledger lines cannot be deleted
 * (goods-receipt design D14). No supplier of its own: D16 would count it.
 */
export const E2E_ORDER_NOTE = "E2E thử";

async function removeTestOrders(db: Database) {
  await db
    .delete(purchaseOrder)
    .where(
      and(
        eq(purchaseOrder.note, E2E_ORDER_NOTE),
        sql`not exists (select 1 from ${goodsReceipt} where ${goodsReceipt.orderId} = ${purchaseOrder.id})`,
      ),
    );
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

/**
 * repairs.spec.ts takes Chờ sửa of E2E-KHO-01 at the workshop (no other
 * spec reads it) into Tốt at the yard, and needs a Tốt average to ask about
 * a high cost. Tops both up when short; ledger lines stay, like any E2E row.
 */
async function ensureRepairStock(db: Database, actor: { id: string }) {
  const [kho] = await db
    .select({ id: item.id })
    .from(item)
    .where(eq(item.code, E2E_STOCK_ITEMS[0]));
  const places = await db
    .select({ id: location.id, code: location.code })
    .from(location);
  const workshop = places.find((place) => place.code === "XUONG-01")?.id;
  const yard = places.find((place) => place.code === "BAI-01")?.id;
  if (!kho || !workshop || !yard) return;
  const [atWorkshop] = await db
    .select({
      total: sql<string>`coalesce(sum(${inventoryLedger.quantity}), 0)`,
    })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, kho.id),
        eq(inventoryLedger.condition, "NEEDS_REPAIR"),
        eq(inventoryLedger.locationId, workshop),
      ),
    );
  const [good] = await db
    .select({ avg: inventoryCost.avgCost })
    .from(inventoryCost)
    .where(
      and(
        eq(inventoryCost.itemId, kho.id),
        eq(inventoryCost.condition, "GOOD"),
      ),
    );
  const lines: MovementDraft[] = [];
  if (Number(atWorkshop?.total ?? 0) < 10) {
    lines.push({
      itemId: kho.id,
      condition: "NEEDS_REPAIR" as const,
      locationId: workshop,
      movement: "ADJUST_IN" as const,
      quantityMilli: 20_000,
      unitCost: 50_000,
      description: "E2E: hàng chờ sửa cho repairs.spec",
    });
  }
  if (good?.avg == null) {
    lines.push({
      itemId: kho.id,
      condition: "GOOD" as const,
      locationId: yard,
      movement: "ADJUST_IN" as const,
      quantityMilli: 1_000,
      unitCost: 100_000,
      description: "E2E: giá vốn Tốt cho repairs.spec",
    });
  }
  if (lines.length === 0) return;
  await db.transaction((tx) =>
    postMovements(tx, actor, {
      documentType: "E2E",
      documentId: null,
      documentCode: "E2E-SUA",
      businessDate: toBusinessDate(new Date()),
      lines,
    }),
  );
}

/** Drafts repairs.spec.ts left; posted slips stay with their ledger lines. */
async function removeTestRepairDrafts(db: Database) {
  await db
    .delete(repairOrder)
    .where(
      and(
        eq(repairOrder.note, E2E_ORDER_NOTE),
        eq(repairOrder.status, "DRAFT"),
      ),
    );
}

/** Where stocktake.spec.ts counts; the seed session stays at BAI-01. */
export const E2E_STOCKTAKE_PLACE = "XUONG-01";

/**
 * Cancels the open sessions earlier runs left at the workshop (design D16).
 * One place holds one open session, so a session somebody else is counting
 * there stops the run instead of being thrown away.
 */
export async function cancelTestStocktakes(
  db: Database,
  actor: { id: string },
) {
  const open = await db
    .select({
      code: stocktake.code,
      username: user.username,
      name: user.name,
    })
    .from(stocktake)
    .innerJoin(location, eq(location.id, stocktake.locationId))
    .innerJoin(user, eq(user.id, stocktake.startedBy))
    .where(
      and(
        eq(location.code, E2E_STOCKTAKE_PLACE),
        sql`${stocktake.status} in ('COUNTING', 'SUBMITTED')`,
      ),
    );
  for (const row of open) {
    if (!row.username?.startsWith("e2e.")) {
      throw new Error(
        `${E2E_STOCKTAKE_PLACE} đang có phiên ${row.code} của ${row.name}, hủy hoặc duyệt trước khi chạy E2E`,
      );
    }
    const done = await cancelStocktake(
      db,
      { id: actor.id, role: "DIRECTOR" },
      row.code,
      { reason: "E2E dọn phiên còn sót" },
    );
    if (!done.ok) throw new Error(`${row.code}: ${done.error}`);
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
    await removeTestOrders(handle.db);
    await removeTestRepairDrafts(handle.db);
    await removeTestCatalogRows(handle.db);
    if (director) {
      await seedCatalog(handle.db, director);
      await ensureStockItems(handle.db, director);
      // D10 / D11 sample stock (design D11), on an empty ledger only.
      await seedInventory(handle.db, director);
      // D2 / D3b sample orders (purchase-orders design D13), once.
      await seedPurchasing(handle.db, director);
      // A scrap price for M3 lots with scrap, and the D3b receiving sample.
      if (!(await currentScrapPrice(handle.db))) {
        await setScrapPrice(handle.db, director, { pricePerKg: 7_500 });
      }
      const [warehouse] = await handle.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.username, "e2e.thukho"));
      if (warehouse) {
        await seedReceiving(handle.db, { director, warehouse });
      }
      // The D12 sample draft PSC-<year>-022 (simple-repair design D13), once.
      await seedRepairs(handle.db, director);
      await ensureRepairStock(handle.db, director);
      // The D13 sample session at BAI-01 (stocktake design D16), once; the
      // workshop is left free for stocktake.spec.ts.
      await cancelTestStocktakes(handle.db, director);
      if (warehouse) await seedStocktakes(handle.db, warehouse);
    }
  } finally {
    await handle.close();
  }
}

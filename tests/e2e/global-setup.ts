// Before any E2E test: put the e2e.* accounts in a known state and remove
// the throwaway accounts earlier runs created. Uses the same database as the
// dev server (DATABASE_URL).
import { and, eq, inArray, like, notInArray, sql } from "drizzle-orm";

import { createDatabase, type Database } from "@/db/client";
import {
  activityLog,
  buyBackNote,
  contract,
  customer,
  deliveryNote,
  deliveryNoteLine,
  goodsReceipt,
  inventoryCost,
  inventoryLedger,
  item,
  itemGroup,
  kit,
  location,
  purchaseOrder,
  purchaseOrderLine,
  rentalHoliday,
  repairOrder,
  session,
  site,
  siteTransfer,
  stockAdjustmentLine,
  stocktake,
  user,
} from "@/db/schema";
import { actorByUsername, type ActivityActor } from "@/lib/activity/actor";
import { seedActivity } from "@/lib/activity/sample";
import {
  approveContract,
  cancelContract,
  returnContract,
  submitContract,
} from "@/lib/contracts/approval";
import { createContract } from "@/lib/contracts/service";
import { seedDeliveries } from "@/lib/deliveries/sample";
import { postDelivery } from "@/lib/deliveries/post";
import { changeDeliveryStatus, createDelivery } from "@/lib/deliveries/service";
import { onSiteByItem } from "@/lib/deliveries/records";
import { seedReturns } from "@/lib/returns/sample";
import { rejectBuyBack } from "@/lib/buy-backs/service";
import { seedSiteOperations } from "@/lib/site-transfers/sample";
import { changeSiteTransferStatus } from "@/lib/site-transfers/service";
import { seedContracts } from "@/lib/contracts/sample";
import { createAuth } from "@/lib/auth/auth";
import { getEnv } from "@/lib/env";
import { createGroup } from "@/lib/catalog/item-groups";
import { createItem, setRepairLaborRate } from "@/lib/catalog/items";
import { seedCatalog } from "@/lib/catalog/seed";
import { toBusinessDate } from "@/domain/business-date";
import type { MovementDraft } from "@/domain/movement";
import { postMovements } from "@/lib/inventory/post";
import { seedInventory } from "@/lib/inventory/sample";
import { seedPurchasing } from "@/lib/purchasing/sample";
import { seedReceiving } from "@/lib/receiving/sample";
import { currentScrapPrice, setScrapPrice } from "@/lib/receiving/scrap-price";
import { seedRepairs } from "@/lib/repairs/sample";
import { seedWorkOrders } from "@/lib/repairs/work-sample";
import { cancelWorkOrder, deleteWorkOrder } from "@/lib/repairs/work-orders";
import { createHoliday } from "@/lib/holidays/service";
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
  // catalog-extensions: the person in charge catalog.spec.ts puts on NT-0002.
  await db
    .update(customer)
    .set({ salesUserId: null })
    .where(eq(customer.code, "NT-0002"));
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

async function ensureStockItems(db: Database, actor: ActivityActor) {
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
async function ensureRepairStock(db: Database, actor: ActivityActor) {
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

/** The supply item work-order E2E reports (repair-work-orders task 9.2). */
export const E2E_SUPPLY_ITEM = "E2E-VT-01";

/**
 * repairs.spec.ts walks a work order from BAI-01 through XUONG-01: it needs
 * a labour rate on E2E-KHO-01, Chờ sửa of it at the yard and a supply item
 * with stock at the workshop. Orders e2e.* left open are dropped (a draft
 * deleted, others cancelled, which sends received stock back). Ledger
 * lines stay, like any E2E row.
 */
async function ensureWorkOrderStock(db: Database, actor: ActivityActor) {
  const places = await db
    .select({ id: location.id, code: location.code })
    .from(location);
  const workshop = places.find((place) => place.code === "XUONG-01")?.id;
  const yard = places.find((place) => place.code === "BAI-01")?.id;
  const [kho] = await db
    .select({ id: item.id, rate: item.repairLaborRate })
    .from(item)
    .where(eq(item.code, E2E_STOCK_ITEMS[0]));
  if (!kho || !workshop || !yard) return;
  const open = await db
    .select({
      code: repairOrder.code,
      status: repairOrder.status,
      updatedAt: repairOrder.updatedAt,
    })
    .from(repairOrder)
    .innerJoin(user, eq(user.id, repairOrder.createdBy))
    .where(
      and(
        eq(repairOrder.kind, "WORK_ORDER"),
        notInArray(repairOrder.status, ["POSTED", "CANCELLED"]),
        like(user.username, "e2e.%"),
        // The D12 / M8 samples (seedWorkOrders) stay for the baselines.
        sql`${repairOrder.repairedBy} is distinct from 'tổ anh Lực'`,
      ),
    );
  for (const order of open) {
    const done =
      order.status === "DRAFT"
        ? await deleteWorkOrder(db, actor, order.code)
        : await cancelWorkOrder(db, actor, order.code, {
            updatedAt: order.updatedAt.toISOString(),
            reason: "E2E dọn lệnh lần trước",
          });
    if (!done.ok) throw new Error(`${order.code}: ${done.error}`);
  }
  if (kho.rate === null) {
    const rate = await setRepairLaborRate(db, actor, kho.id, 10_000);
    if (!rate.ok) throw new Error(rate.error);
  }
  const [group] = await db
    .select({ id: itemGroup.id })
    .from(itemGroup)
    .where(eq(itemGroup.category, "MATERIAL"))
    .limit(1);
  let groupId = group?.id;
  if (!groupId) {
    const created = await createGroup(db, actor, {
      name: "Vật tư phụ",
      category: "MATERIAL",
    });
    if (!created.ok) throw new Error(created.error);
    groupId = created.data.id;
  }
  let [supply] = await db
    .select({ id: item.id })
    .from(item)
    .where(eq(item.code, E2E_SUPPLY_ITEM));
  if (!supply) {
    const created = await createItem(db, actor, {
      code: E2E_SUPPLY_ITEM,
      name: "Vật tư thử E2E",
      groupId,
      unit: "KG",
    });
    if (!created.ok) throw new Error(created.error);
    supply = { id: created.data.id };
  }
  const stockOf = async (
    itemId: string,
    condition: "NEEDS_REPAIR" | "NEW",
    locationId: string,
  ) => {
    const [row] = await db
      .select({
        total: sql<string>`coalesce(sum(${inventoryLedger.quantity}), 0)`,
      })
      .from(inventoryLedger)
      .where(
        and(
          eq(inventoryLedger.itemId, itemId),
          eq(inventoryLedger.condition, condition),
          eq(inventoryLedger.locationId, locationId),
        ),
      );
    return Number(row?.total ?? 0);
  };
  const lines: MovementDraft[] = [];
  if ((await stockOf(kho.id, "NEEDS_REPAIR", yard)) < 5) {
    lines.push({
      itemId: kho.id,
      condition: "NEEDS_REPAIR",
      locationId: yard,
      movement: "ADJUST_IN",
      quantityMilli: 10_000,
      unitCost: 50_000,
      description: "E2E: hàng chờ sửa cho lệnh sửa",
    });
  }
  if ((await stockOf(supply.id, "NEW", workshop)) < 10) {
    lines.push({
      itemId: supply.id,
      condition: "NEW",
      locationId: workshop,
      movement: "ADJUST_IN",
      quantityMilli: 20_000,
      unitCost: 40_000,
      description: "E2E: vật tư phụ ở xưởng",
    });
  }
  if (lines.length === 0) return;
  await db.transaction((tx) =>
    postMovements(tx, actor, {
      documentType: "E2E",
      documentId: null,
      documentCode: "E2E-LSC",
      businessDate: toBusinessDate(new Date()),
      lines,
    }),
  );
}

/**
 * stocktake.spec.ts counts a Chờ sửa surplus of E2E-KHO-02, and approval
 * needs a Chờ sửa average. receiving.spec.ts makes one, but may run in
 * another CI shard, so give it one opening piece at the yard when missing.
 * Runs after the D13 sample session, which therefore never lists it.
 */
async function ensureStocktakeCost(db: Database, actor: ActivityActor) {
  const [kho] = await db
    .select({ id: item.id })
    .from(item)
    .where(eq(item.code, E2E_STOCK_ITEMS[1]));
  const [yard] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  if (!kho || !yard) return;
  const [cost] = await db
    .select({ avg: inventoryCost.avgCost })
    .from(inventoryCost)
    .where(
      and(
        eq(inventoryCost.itemId, kho.id),
        eq(inventoryCost.condition, "NEEDS_REPAIR"),
      ),
    );
  if (cost?.avg != null) return;
  await db.transaction((tx) =>
    postMovements(tx, actor, {
      documentType: "E2E",
      documentId: null,
      documentCode: "E2E-KK",
      businessDate: toBusinessDate(new Date()),
      lines: [
        {
          itemId: kho.id,
          condition: "NEEDS_REPAIR",
          locationId: yard.id,
          movement: "OPENING",
          quantityMilli: 1_000,
          amount: 50_000,
          description: "E2E: giá vốn Chờ sửa cho stocktake.spec",
        },
      ],
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
export async function cancelTestStocktakes(db: Database, actor: ActivityActor) {
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
    const done = await cancelStocktake(db, actor, row.code, {
      reason: "E2E dọn phiên còn sót",
    });
    if (!done.ok) throw new Error(`${row.code}: ${done.error}`);
  }
}

/**
 * Throwaway accounts of auth.spec.ts (activity-log design D13): those with
 * no activity log row are deleted (sessions and accounts go with them, ON
 * DELETE CASCADE); the log keeps a foreign key to whoever acted, so the
 * rest are locked and signed out instead, and stay in the dev database.
 */
async function removeTempAccounts(db: Database): Promise<void> {
  const temp = like(user.username, `${E2E_TEMP_PREFIX}%`);
  const logged = sql`exists (select 1 from ${activityLog} where ${activityLog.userId} = ${user.id})`;
  await db.delete(user).where(and(temp, sql`not ${logged}`));
  const kept = db.select({ id: user.id }).from(user).where(temp);
  await db.delete(session).where(inArray(session.userId, kept));
  await db
    .update(user)
    .set({ status: "LOCKED", updatedAt: new Date() })
    .where(and(temp, eq(user.status, "ACTIVE")));
}

/** The customer part of every number contracts.spec.ts issues. */
export const E2E_CONTRACT_TOKEN = "E2ETHU";

/**
 * Contracts of earlier runs (number "…-E2ETHU…") are cancelled, never
 * deleted: numbers stay used (contracts design D1). Pending ones are
 * returned first, the only way out of PENDING.
 */
async function cancelTestContracts(
  db: Database,
  director: ActivityActor,
): Promise<void> {
  const actor = { ...director, contractScope: "ALL" as const };
  const rows = await db
    .select({ id: contract.id, status: contract.status })
    .from(contract)
    .where(
      and(
        eq(contract.customerToken, E2E_CONTRACT_TOKEN),
        inArray(contract.status, ["DRAFT", "PENDING", "APPROVED"]),
      ),
    );
  for (const row of rows) {
    if (row.status === "PENDING") {
      await returnContract(db, actor, row.id, "E2E thử");
    }
    await cancelContract(db, actor, row.id, "E2E thử");
  }
}

/** The customer part of the rental deliveries.spec.ts ships on. */
export const E2E_DELIVERY_TOKEN = "E2EXUAT";

/**
 * deliveries.spec.ts ships E2E-KHO-01 on one approved rental, made once and
 * kept (its ledger lines stay). Notes earlier runs left waiting or being
 * picked are cancelled, so the contract always has room for a new batch.
 */
async function ensureDeliveryContract(
  db: Database,
  director: ActivityActor,
  sales: ActivityActor,
): Promise<void> {
  const actor = { ...director, contractScope: "ALL" as const };
  const seller = { ...sales, contractScope: "ALL" as const };
  const [found] = await db
    .select({ id: contract.id })
    .from(contract)
    .where(eq(contract.customerToken, E2E_DELIVERY_TOKEN));
  if (found) {
    const open = await db
      .select({ id: deliveryNote.id })
      .from(deliveryNote)
      .where(
        and(
          eq(deliveryNote.contractId, found.id),
          inArray(deliveryNote.status, ["PLANNED", "PICKING"]),
        ),
      );
    for (const note of open) {
      await changeDeliveryStatus(db, actor, note.id, "CANCEL", "E2E thử");
    }
    return;
  }
  const [buyer] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(eq(customer.name, "Cty TNHH Xây dựng Minh Phát"));
  const [work] = await db
    .select({ id: site.id })
    .from(site)
    .where(eq(site.name, "Trường THCS Dương Nội"));
  const items = await db
    .select({ id: item.id, code: item.code })
    .from(item)
    .where(inArray(item.code, [...E2E_STOCK_ITEMS]));
  if (!buyer || !work || items.length !== E2E_STOCK_ITEMS.length) return;
  const saved = await createContract(db, seller, {
    type: "RENTAL",
    customerId: buyer.id,
    siteId: work.id,
    customerToken: E2E_DELIVERY_TOKEN,
    signedDate: "2026-10-30",
    startDate: "2026-11-01",
    endDate: "2030-12-31",
    lines: items.map((row) => ({
      itemId: row.id,
      quantity: "100000",
      price: 100,
    })),
    compensations: items.map((row) => ({
      itemId: row.id,
      lostPrice: 100_000,
      damagePrice: 20_000,
    })),
    note: E2E_ORDER_NOTE,
  });
  if (!saved.ok) throw new Error(`E2E delivery contract: ${saved.error}`);
  const sent = await submitContract(db, seller, saved.data.id);
  if (!sent.ok) throw new Error(`E2E delivery contract: ${sent.error}`);
  const approved = await approveContract(db, actor, saved.data.id, null);
  if (!approved.ok) throw new Error(`E2E delivery contract: ${approved.error}`);
}

/** At least 50 Tốt E2E-KHO-01 at BAI-01 to ship; at the current average. */
async function ensureDeliveryStock(db: Database, actor: ActivityActor) {
  const [kho] = await db
    .select({ id: item.id })
    .from(item)
    .where(eq(item.code, E2E_STOCK_ITEMS[0]));
  const [yard] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  if (!kho || !yard) return;
  const [atYard] = await db
    .select({
      total: sql<string>`coalesce(sum(${inventoryLedger.quantity}), 0)`,
    })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, kho.id),
        eq(inventoryLedger.condition, "GOOD"),
        eq(inventoryLedger.locationId, yard.id),
      ),
    );
  if (Number(atYard?.total ?? 0) >= 50) return;
  await db.transaction((tx) =>
    postMovements(tx, actor, {
      documentType: "E2E",
      documentId: null,
      documentCode: "E2E-XUAT",
      businessDate: toBusinessDate(new Date()),
      lines: [
        {
          itemId: kho.id,
          condition: "GOOD",
          locationId: yard.id,
          movement: "ADJUST_IN",
          quantityMilli: 100_000,
          unitCost: 100_000,
          description: "E2E: hàng Tốt cho deliveries.spec",
        },
      ],
    }),
  );
}

/**
 * returns.spec.ts takes E2E-KHO-01 back from the E2E rental: keep at least
 * 10 at its site, shipping 20 more through a posted batch when short. The
 * ledger lines stay; the spec checks differences only.
 */
async function ensureReturnStock(
  db: Database,
  sales: ActivityActor,
  warehouse: ActivityActor,
): Promise<void> {
  const seller = { ...sales, contractScope: "ALL" as const };
  const picker = { ...warehouse, contractScope: "ALL" as const };
  const [deal] = await db
    .select({ id: contract.id })
    .from(contract)
    .where(eq(contract.customerToken, E2E_DELIVERY_TOKEN));
  const [kho] = await db
    .select({ id: item.id })
    .from(item)
    .where(eq(item.code, E2E_STOCK_ITEMS[0]));
  if (!deal || !kho) return;
  if (((await onSiteByItem(db, deal.id)).get(kho.id) ?? 0) >= 20_000) return;
  const note = await createDelivery(db, seller, {
    contractId: deal.id,
    lines: [{ itemId: kho.id, quantity: "30" }],
    overContractConfirmed: true,
    note: E2E_ORDER_NOTE,
  });
  if (!note.ok) throw new Error(`E2E return stock: ${note.error}`);
  const started = await changeDeliveryStatus(db, picker, note.data.id, "START");
  if (!started.ok) throw new Error(`E2E return stock: ${started.error}`);
  const [line] = await db
    .select({ id: deliveryNoteLine.id })
    .from(deliveryNoteLine)
    .where(eq(deliveryNoteLine.noteId, note.data.id));
  const posted = await postDelivery(db, picker, note.data.id, {
    clientDraftId: crypto.randomUUID(),
    startedVersion: started.data.updatedAt,
    vehiclePlate: "51X-000.01",
    picks: [{ lineId: line?.id, condition: "GOOD", quantity: "30" }],
  });
  if (!posted.ok) throw new Error(`E2E return stock: ${posted.error}`);
}

/** The customer part of the rental site-operations.spec.ts moves goods to. */
export const E2E_TRANSFER_TOKEN = "E2ECHUYEN";

/**
 * site-operations.spec.ts moves E2E-KHO-01 from the E2E rental to a second
 * E2E rental of the same customer, made once and kept. Transfers left draft
 * or sent and buy-backs left pending by e2e.* accounts are cancelled or
 * rejected (exchanges go with their batches, see ensureDeliveryContract).
 */
async function ensureTransferContract(
  db: Database,
  director: ActivityActor,
  sales: ActivityActor,
): Promise<void> {
  const actor = { ...director, contractScope: "ALL" as const };
  const seller = { ...sales, contractScope: "ALL" as const };
  // Only documents of the two E2E rentals: the samples stay.
  const e2eContracts = db
    .select({ id: contract.id })
    .from(contract)
    .where(
      inArray(contract.customerToken, [E2E_DELIVERY_TOKEN, E2E_TRANSFER_TOKEN]),
    );
  const open = await db
    .select({ id: siteTransfer.id })
    .from(siteTransfer)
    .where(
      and(
        inArray(siteTransfer.status, ["DRAFT", "SENT"]),
        inArray(siteTransfer.fromContractId, e2eContracts),
      ),
    );
  for (const row of open) {
    await changeSiteTransferStatus(db, actor, row.id, "CANCEL", {
      reason: "E2E thử",
    });
  }
  const pending = await db
    .select({ id: buyBackNote.id })
    .from(buyBackNote)
    .where(
      and(
        eq(buyBackNote.status, "PENDING"),
        inArray(buyBackNote.contractId, e2eContracts),
      ),
    );
  for (const row of pending) {
    await rejectBuyBack(db, actor, row.id, { reason: "E2E thử" });
  }
  const [found] = await db
    .select({ id: contract.id })
    .from(contract)
    .where(eq(contract.customerToken, E2E_TRANSFER_TOKEN));
  if (found) return;
  const [buyer] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(eq(customer.name, "Cty TNHH Xây dựng Minh Phát"));
  const [work] = await db
    .select({ id: site.id })
    .from(site)
    .where(eq(site.name, "Chung cư An Phú – Block B"));
  const items = await db
    .select({ id: item.id })
    .from(item)
    .where(inArray(item.code, [...E2E_STOCK_ITEMS]));
  if (!buyer || !work || items.length !== E2E_STOCK_ITEMS.length) return;
  const saved = await createContract(db, seller, {
    type: "RENTAL",
    customerId: buyer.id,
    siteId: work.id,
    customerToken: E2E_TRANSFER_TOKEN,
    signedDate: "2026-11-02",
    startDate: "2026-11-05",
    endDate: "2030-12-31",
    lines: items.map((row) => ({
      itemId: row.id,
      quantity: "100000",
      price: 100,
    })),
    compensations: items.map((row) => ({
      itemId: row.id,
      lostPrice: 100_000,
      damagePrice: 20_000,
    })),
    note: E2E_ORDER_NOTE,
  });
  if (!saved.ok) throw new Error(`E2E transfer contract: ${saved.error}`);
  const sent = await submitContract(db, seller, saved.data.id);
  if (!sent.ok) throw new Error(`E2E transfer contract: ${sent.error}`);
  const approved = await approveContract(db, actor, saved.data.id, null);
  if (!approved.ok) throw new Error(`E2E transfer contract: ${approved.error}`);
}

/**
 * site-operations.spec.ts moves, sells and swaps E2E-KHO-02 of the E2E
 * rental (E2E-KHO-01 is measured there by deliveries.spec and returns.spec
 * at the same time): keep at least 20 at its site, shipping 30 more from
 * BAI-01 when short, and stock BAI-01 first when it lacks them.
 */
async function ensureSiteOperationStock(
  db: Database,
  director: ActivityActor,
  sales: ActivityActor,
  warehouse: ActivityActor,
): Promise<void> {
  const seller = { ...sales, contractScope: "ALL" as const };
  const picker = { ...warehouse, contractScope: "ALL" as const };
  const [deal] = await db
    .select({ id: contract.id })
    .from(contract)
    .where(eq(contract.customerToken, E2E_DELIVERY_TOKEN));
  const [kho] = await db
    .select({ id: item.id })
    .from(item)
    .where(eq(item.code, E2E_STOCK_ITEMS[1]));
  const [yard] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  if (!deal || !kho || !yard) return;
  if (((await onSiteByItem(db, deal.id)).get(kho.id) ?? 0) >= 20_000) return;
  const [atYard] = await db
    .select({
      total: sql<string>`coalesce(sum(${inventoryLedger.quantity}), 0)`,
    })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, kho.id),
        eq(inventoryLedger.condition, "GOOD"),
        eq(inventoryLedger.locationId, yard.id),
      ),
    );
  if (Number(atYard?.total ?? 0) < 40) {
    await db.transaction((tx) =>
      postMovements(tx, director, {
        documentType: "E2E",
        documentId: null,
        documentCode: "E2E-CHUYEN",
        businessDate: toBusinessDate(new Date()),
        lines: [
          {
            itemId: kho.id,
            condition: "GOOD",
            locationId: yard.id,
            movement: "ADJUST_IN",
            quantityMilli: 100_000,
            unitCost: 100_000,
            description: "E2E: hàng Tốt cho site-operations.spec",
          },
        ],
      }),
    );
  }
  const note = await createDelivery(db, seller, {
    contractId: deal.id,
    lines: [{ itemId: kho.id, quantity: "30" }],
    overContractConfirmed: true,
    note: E2E_ORDER_NOTE,
  });
  if (!note.ok) throw new Error(`E2E site stock: ${note.error}`);
  const started = await changeDeliveryStatus(db, picker, note.data.id, "START");
  if (!started.ok) throw new Error(`E2E site stock: ${started.error}`);
  const [line] = await db
    .select({ id: deliveryNoteLine.id })
    .from(deliveryNoteLine)
    .where(eq(deliveryNoteLine.noteId, note.data.id));
  const posted = await postDelivery(db, picker, note.data.id, {
    clientDraftId: crypto.randomUUID(),
    startedVersion: started.data.updatedAt,
    vehiclePlate: "51X-000.01",
    picks: [{ lineId: line?.id, condition: "GOOD", quantity: "30" }],
  });
  if (!posted.ok) throw new Error(`E2E site stock: ${posted.error}`);
}

/** billing.spec.ts adds, edits and deletes holidays of this year only. */
export const E2E_HOLIDAY_YEAR = 2098;
/** The fixed holiday of the D7 and settings baselines (design D14). */
export const E2E_SAMPLE_HOLIDAY = {
  name: "Tết mẫu E2E",
  startDate: "2099-02-05",
  endDate: "2099-02-13",
};

/**
 * Removes holidays a failed billing.spec.ts run left in 2098, and keeps the
 * 2099 sample of the baselines. Far years never touch a closed period.
 */
async function ensureHolidays(db: Database, actor: ActivityActor) {
  await db
    .delete(rentalHoliday)
    .where(
      and(
        sql`${rentalHoliday.startDate} >= ${`${E2E_HOLIDAY_YEAR}-01-01`}`,
        sql`${rentalHoliday.startDate} <= ${`${E2E_HOLIDAY_YEAR}-12-31`}`,
      ),
    );
  const [sample] = await db
    .select({ id: rentalHoliday.id })
    .from(rentalHoliday)
    .where(eq(rentalHoliday.name, E2E_SAMPLE_HOLIDAY.name));
  if (!sample) {
    const saved = await createHoliday(db, actor, E2E_SAMPLE_HOLIDAY);
    if (!saved.ok) throw new Error(saved.error);
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
    await removeTempAccounts(handle.db);
    await seedAccounts({ db: handle.db, auth }, E2E_ACCOUNTS, {
      password: env.E2E_PASSWORD,
      reset: true,
    });
    // contracts.spec.ts never changes these, but a failed run may have.
    await handle.db
      .update(user)
      .set({ contractScope: "ALL" })
      .where(like(user.username, "e2e.%"));
    // The D9 / D16 sample data, so catalog tests and screenshots have rows.
    const director = await actorByUsername(handle.db, "e2e.giamdoc");
    await removeTestOrders(handle.db);
    await removeTestRepairDrafts(handle.db);
    await removeTestCatalogRows(handle.db);
    if (director) {
      await seedCatalog(handle.db, director);
      await ensureStockItems(handle.db, director);
      // Holidays of billing.spec.ts and the D7 baselines (rental-billing 7.2).
      await ensureHolidays(handle.db, director);
      // D10 / D11 sample stock (design D11), on an empty ledger only.
      await seedInventory(handle.db, director);
      // D2 / D3b sample orders (purchase-orders design D13), once.
      await seedPurchasing(handle.db, director);
      // A scrap price for M3 lots with scrap, and the D3b receiving sample.
      if (!(await currentScrapPrice(handle.db))) {
        await setScrapPrice(handle.db, director, { pricePerKg: 7_500 });
      }
      const warehouse = await actorByUsername(handle.db, "e2e.thukho");
      if (warehouse) {
        await seedReceiving(handle.db, { director, warehouse });
      }
      // The D12 sample draft PSC-<year>-022 (simple-repair design D13), once.
      await seedRepairs(handle.db, director);
      await ensureRepairStock(handle.db, director);
      // Work orders (repair-work-orders 9.2): stock, rate, a supply item,
      // and the D12 / M8 sample order once (counted like drawing D12).
      await ensureWorkOrderStock(handle.db, director);
      {
        const accountant = await actorByUsername(handle.db, "e2e.ketoan");
        const warehouse = await actorByUsername(handle.db, "e2e.thukho");
        const workshop = await actorByUsername(handle.db, "e2e.xuong");
        if (accountant && warehouse && workshop) {
          await seedWorkOrders(handle.db, {
            director,
            accountant,
            warehouse,
            workshop,
          });
        }
      }
      // The D13 sample session at BAI-01 (stocktake design D16), once; the
      // workshop is left free for stocktake.spec.ts.
      await cancelTestStocktakes(handle.db, director);
      if (warehouse) await seedStocktakes(handle.db, warehouse);
      await ensureStocktakeCost(handle.db, director);
      // The D18 sample on 27–28/10/2026 (activity-log design D13), once.
      const accountant = await actorByUsername(handle.db, "e2e.ketoan");
      const sales = await actorByUsername(handle.db, "e2e.kinhdoanh");
      // D4 / D5 / D5b sample contracts (contracts tasks 7.6), once.
      await cancelTestContracts(handle.db, director);
      if (sales) await seedContracts(handle.db, { director, sales });
      // D6 / M5 samples: Đợt 1 posted, Đợt 2 waiting (deliveries 7.1), once.
      if (sales && warehouse) {
        await seedDeliveries(handle.db, { sales, warehouse });
      }
      // The rental deliveries.spec.ts ships on, and its stock (deliveries 7.2).
      await ensureDeliveryStock(handle.db, director);
      if (sales) await ensureDeliveryContract(handle.db, director, sales);
      // D8 / M4 samples (returns 7.1) and the stock returns.spec.ts takes
      // back from the E2E rental (returns 7.2).
      if (warehouse) await seedReturns(handle.db, { warehouse });
      if (sales && warehouse) {
        await ensureReturnStock(handle.db, sales, warehouse);
      }
      // D6b / D6c / D6d / M9 samples (site-operations 7.1), once, and the
      // second E2E rental site-operations.spec.ts moves goods to (7.2).
      if (sales) {
        await seedSiteOperations(handle.db, { director, sales });
        await ensureTransferContract(handle.db, director, sales);
        if (warehouse) {
          await ensureSiteOperationStock(handle.db, director, sales, warehouse);
        }
      }
      if (accountant && sales && warehouse) {
        await seedActivity(handle.db, {
          director,
          accountant,
          sales,
          warehouse,
        });
      }
    }
  } finally {
    await handle.close();
  }
}

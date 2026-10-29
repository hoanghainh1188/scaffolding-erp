import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { resetCatalogTables } from "@/test/catalog";
import { resetInventoryTables, truncateWithLedger } from "@/test/inventory";

import { user } from "./auth";
import { item, itemGroup, location } from "./catalog";
import { inventoryLedger } from "./inventory";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

const APPEND_ONLY = "Sổ kho chỉ ghi thêm, sai thì lập phiếu điều chỉnh";

let itemId = "";
let yardId = "";
const userId = "inventory-schema-user";

beforeEach(async () => {
  // "user" first: its CASCADE also empties the catalog tables.
  await truncateWithLedger(db, sql`truncate table "user" cascade`);
  await resetInventoryTables(handle);
  await resetCatalogTables(handle);
  await db.insert(user).values({
    id: userId,
    name: "Thu Hà",
    email: "thuha@users.invalid",
    username: "thuha",
    role: "ACCOUNTANT",
  });
  const [group] = await db
    .insert(itemGroup)
    .values({ name: "Giàn giáo", nameKey: "gian giao" })
    .returning({ id: itemGroup.id });
  const [row] = await db
    .insert(item)
    .values({
      code: "GG-K17",
      name: "Khung giàn giáo 1,7m",
      groupId: group?.id ?? "",
      unit: "PIECE",
      standardWeightKg: "13.500",
      searchText: "khung gian giao 1,7m gg-k17",
    })
    .returning({ id: item.id });
  itemId = row?.id ?? "";
  const [yard] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  yardId = yard?.id ?? "";
});

const line = (overrides: Partial<typeof inventoryLedger.$inferInsert> = {}) =>
  ({
    postingId: "00000000-0000-4000-8000-000000000001",
    businessDate: "2026-10-08",
    itemId,
    condition: "GOOD",
    locationId: yardId,
    movement: "PURCHASE_IN",
    quantity: "160.000",
    unitCost: 196155,
    amount: 31384800,
    avgCostAfter: 196155,
    poolQuantityAfter: "160.000",
    documentType: "GOODS_RECEIPT",
    documentCode: "PN-2026-087",
    description: "Nhập từ PO-2026-052",
    createdBy: userId,
    ...overrides,
  }) satisfies typeof inventoryLedger.$inferInsert;

/** The Postgres error behind a Drizzle query error. */
async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error: unknown) {
    const cause = (error as { cause?: { code?: string; message?: string } })
      .cause;
    return { code: cause?.code, message: cause?.message };
  }
  throw new Error("expected the statement to fail");
}

const countLines = async () =>
  (await db.select({ id: inventoryLedger.id }).from(inventoryLedger)).length;

describe("inventory_ledger is append-only", () => {
  it("refuses UPDATE", async () => {
    await db.insert(inventoryLedger).values(line());
    const error = await failure(
      db.update(inventoryLedger).set({ quantity: "200.000" }),
    );
    expect(error.message).toBe(APPEND_ONLY);
    const [row] = await db
      .select({ quantity: inventoryLedger.quantity })
      .from(inventoryLedger);
    expect(row?.quantity).toBe("160.000");
  });

  it("refuses DELETE", async () => {
    await db.insert(inventoryLedger).values(line());
    const error = await failure(db.delete(inventoryLedger));
    expect(error.message).toBe(APPEND_ONLY);
    expect(await countLines()).toBe(1);
  });

  it("refuses TRUNCATE without the test flag", async () => {
    await db.insert(inventoryLedger).values(line());
    const error = await failure(
      db.execute(sql`truncate table "inventory_ledger"`),
    );
    expect(error.message).toBe(APPEND_ONLY);
    expect(await countLines()).toBe(1);
  });

  it("lets TRUNCATE through only on a *_test database with the flag", async () => {
    const allowed = async (dbName: string, flag: string | null) => {
      const rows = await db.execute<{ allowed: boolean }>(
        sql`select inventory_truncate_allowed(${dbName}, ${flag}) as allowed`,
      );
      return rows[0]?.allowed;
    };
    expect(await allowed("scaffolding_erp", "on")).toBe(false);
    expect(await allowed("scaffolding_erp_test", null)).toBe(false);
    expect(await allowed("scaffolding_erp_test", "")).toBe(false);
    expect(await allowed("scaffolding_erptest", "on")).toBe(false);
    expect(await allowed("scaffolding_erp_test", "on")).toBe(true);
  });
});

describe("inventory_ledger checks", () => {
  it("refuses a zero quantity", async () => {
    const error = await failure(
      db.insert(inventoryLedger).values(line({ quantity: "0" })),
    );
    expect(error.code).toBe("23514");
  });

  it("ties the sign to the movement", async () => {
    expect(
      (
        await failure(
          db.insert(inventoryLedger).values(line({ quantity: "-5.000" })),
        )
      ).code,
    ).toBe("23514");
    expect(
      (
        await failure(
          db
            .insert(inventoryLedger)
            .values(line({ movement: "DELIVERY_OUT", quantity: "300.000" })),
        )
      ).code,
    ).toBe("23514");
  });

  it("takes a REVALUE line with no quantity and no location", async () => {
    await db.insert(inventoryLedger).values(line());
    await db.insert(inventoryLedger).values(
      line({
        movement: "REVALUE",
        quantity: "0",
        locationId: null,
        amount: -1500000,
        unitCost: 186780,
        avgCostAfter: 186780,
        documentType: "REVALUE",
        documentCode: "ĐCG-2026-001",
      }),
    );
    expect(await countLines()).toBe(2);
  });

  it("keeps REVALUE to quantity 0 and no location, others to a location", async () => {
    const revalue = {
      movement: "REVALUE",
      amount: 610000,
      documentType: "REVALUE",
      documentCode: "ĐCG-2026-001",
    };
    for (const values of [
      line({ ...revalue, quantity: "5.000", locationId: null }),
      line({ ...revalue, quantity: "0", locationId: yardId }),
      line({ movement: "ADJUST_IN", quantity: "5.000", locationId: null }),
    ]) {
      expect(
        (await failure(db.insert(inventoryLedger).values(values))).code,
      ).toBe("23514");
    }
    expect(await countLines()).toBe(0);
  });

  it("refuses to update a REVALUE line", async () => {
    await db.insert(inventoryLedger).values(
      line({
        movement: "REVALUE",
        quantity: "0",
        locationId: null,
        amount: 610000,
        documentType: "REVALUE",
        documentCode: "ĐCG-2026-001",
      }),
    );
    const error = await failure(db.update(inventoryLedger).set({ amount: 1 }));
    expect(error.message).toContain(APPEND_ONLY);
  });

  it("keeps items and locations with ledger lines (RESTRICT)", async () => {
    await db.insert(inventoryLedger).values(line());
    expect(
      (await failure(db.delete(item).where(eq(item.id, itemId)))).code,
    ).toBe("23503");
    expect(
      (await failure(db.delete(location).where(eq(location.id, yardId)))).code,
    ).toBe("23503");
  });
});

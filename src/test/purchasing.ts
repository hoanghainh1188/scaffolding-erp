// Integration-test helpers for purchase orders (purchase-orders tasks 3.x).
import { eq } from "drizzle-orm";

import { item, supplier } from "@/db/schema";
import type { QuantityUnit } from "@/domain/quantity";
import type { OrderBody } from "@/lib/purchasing/orders";

import type { TestContext } from "./auth";

export interface PurchasingFixture {
  director: import("./auth").TestUser;
  sales: import("./auth").TestUser;
  accountant: import("./auth").TestUser;
  item: (code: string) => string;
  /** Supplier id by code: NCC-0001 Hòa Phát, NCC-0002 Chú Ba ve chai. */
  supplier: (code: string) => string;
}

/** Fresh auth, catalog, ledger and orders, with the sample catalog. */
export async function setupPurchasingFixture(
  ctx: TestContext,
): Promise<PurchasingFixture> {
  const { createTestUser, resetAuthTables } = await import("./auth");
  const { resetCatalogTables } = await import("./catalog");
  const { resetInventoryTables } = await import("./inventory");
  const { seedCatalog } = await import("@/lib/catalog/seed");
  await resetAuthTables();
  await resetCatalogTables();
  await resetInventoryTables();
  const director = await createTestUser(ctx, {
    role: "DIRECTOR",
    username: "minhanh",
    name: "Minh Anh",
  });
  const sales = await createTestUser(ctx, {
    role: "SALES",
    username: "quocbao",
    name: "Quốc Bảo",
  });
  const accountant = await createTestUser(ctx, {
    role: "ACCOUNTANT",
    username: "thuha",
    name: "Thu Hà",
  });
  await seedCatalog(ctx.db, director);
  const items = new Map(
    (await ctx.db.select({ id: item.id, code: item.code }).from(item)).map(
      (row) => [row.code, row.id],
    ),
  );
  const suppliers = new Map(
    (
      await ctx.db
        .select({ id: supplier.id, code: supplier.code })
        .from(supplier)
    ).map((row) => [row.code, row.id]),
  );
  const need = (map: Map<string, string>, code: string) => {
    const id = map.get(code);
    if (!id) throw new Error(`no fixture row ${code}`);
    return id;
  };
  return {
    director,
    sales,
    accountant,
    item: (code) => need(items, code),
    supplier: (code) => need(suppliers, code),
  };
}

/** The order of drawing D3 (design D3): 4 lines, 3 costs, by value. */
export function d3Order(fx: PurchasingFixture): OrderBody {
  return {
    supplierId: fx.supplier("NCC-0002"),
    kind: "USED",
    expectedDate: "2026-10-26",
    expectedTime: "09:30",
    vehicle: "Xe tải 29C-123.45",
    allocationMethod: "VALUE",
    lines: [
      {
        itemId: fx.item("GG-K17"),
        unit: "PIECE",
        quantity: "200",
        unitPrice: 185_000,
      },
      {
        itemId: fx.item("GG-CH"),
        unit: "PIECE",
        quantity: "400",
        unitPrice: 32_000,
      },
      {
        itemId: fx.item("GG-M16"),
        unit: "PIECE",
        quantity: "150",
        unitPrice: 145_000,
      },
      {
        itemId: fx.item("PL-SAT"),
        unit: "KG",
        quantity: "1250.5",
        unitPrice: 7_500,
      },
    ],
    costs: [
      { label: "Cước xe tải", amount: 3_500_000 },
      { label: "Bốc xếp", amount: 1_200_000 },
      { label: "Cầu đường", amount: 180_000 },
    ],
  };
}

export async function supplierStatus(ctx: TestContext, id: string) {
  const [row] = await ctx.db
    .select({ status: supplier.status })
    .from(supplier)
    .where(eq(supplier.id, id));
  return row?.status;
}

/**
 * An item in one of the new units (catalog-extensions D2): the sample
 * catalog's row when seedCatalog made it, else added in the group of
 * GG-K17. Returns its id.
 */
export async function insertUnitItem(
  ctx: TestContext,
  row: {
    code: string;
    name: string;
    unit: QuantityUnit;
    standardWeightKg: string | null;
  },
): Promise<string> {
  const [existing] = await ctx.db
    .select({ id: item.id, unit: item.unit })
    .from(item)
    .where(eq(item.code, row.code));
  if (existing) {
    if (existing.unit !== row.unit) throw new Error(`${row.code}: unit`);
    return existing.id;
  }
  const [k17] = await ctx.db
    .select({ groupId: item.groupId })
    .from(item)
    .where(eq(item.code, "GG-K17"));
  if (!k17) throw new Error("Run seedCatalog first.");
  const [created] = await ctx.db
    .insert(item)
    .values({
      ...row,
      groupId: k17.groupId,
      searchText: `${row.code} ${row.name}`.toLowerCase(),
    })
    .returning({ id: item.id });
  if (!created) throw new Error(`no item ${row.code}`);
  return created.id;
}

/** ONG-49 (thép ống, 3,56 kg/m) and TY-REN (ty ren, 25 kg/bó). */
export async function insertMeterAndBundleItems(ctx: TestContext) {
  return {
    ong: await insertUnitItem(ctx, {
      code: "ONG-49",
      name: "Ống thép phi 49",
      unit: "METER",
      standardWeightKg: "3.560",
    }),
    ty: await insertUnitItem(ctx, {
      code: "TY-REN",
      name: "Ty ren",
      unit: "BUNDLE",
      standardWeightKg: "25.000",
    }),
  };
}

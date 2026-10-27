// Integration-test helpers for purchase orders (purchase-orders tasks 3.x).
import { eq } from "drizzle-orm";

import { item, supplier } from "@/db/schema";
import type { OrderBody } from "@/lib/purchasing/orders";

import type { TestContext } from "./auth";

export interface PurchasingFixture {
  director: { id: string; username: string; password: string };
  sales: { id: string; username: string; password: string };
  accountant: { id: string; username: string; password: string };
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
  await resetAuthTables(ctx);
  await resetCatalogTables(ctx);
  await resetInventoryTables(ctx);
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

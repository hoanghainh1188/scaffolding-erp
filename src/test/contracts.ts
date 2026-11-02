// Integration-test helpers for contracts (contracts tasks 4.x, 5.x): the
// sample catalog, a company short name "An Phát", the users of D4–D5b and
// the rental of drawing D5 (BO-17 × 300 + 400 PK-KU at Trường THCS Dương
// Nội, 01/11/2026 – 21/03/2027).
import { eq } from "drizzle-orm";

import { companyProfile, customer, item, kit, site, user } from "@/db/schema";
import type { ContractScope } from "@/domain/permissions";
import type { ContractActor } from "@/lib/contracts/common";
import type { ContractBody } from "@/lib/contracts/service";

import type { TestContext, TestUser } from "./auth";

export interface ContractFixture {
  director: ContractActor;
  sales: ContractActor;
  accountant: ContractActor;
  warehouse: ContractActor;
  item: (code: string) => string;
  kit: (code: string) => string;
  customer: (code: string) => string;
  site: (name: string) => string;
  /** A SALES account of the given scope (stored on the user row too). */
  seller: (username: string, scope: ContractScope) => Promise<ContractActor>;
}

const withScope = (
  person: TestUser,
  contractScope: ContractScope = "ALL",
): ContractActor => ({
  id: person.id,
  role: person.role,
  device: person.device,
  browser: person.browser,
  contractScope,
});

/** Fresh auth, catalog, ledger and contracts, with the sample catalog. */
export async function setupContractFixture(
  ctx: TestContext,
): Promise<ContractFixture> {
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
  const warehouse = await createTestUser(ctx, {
    role: "WAREHOUSE",
    username: "vantung",
    name: "Văn Tùng",
  });
  await seedCatalog(ctx.db, director);
  await ctx.db
    .insert(companyProfile)
    .values({ id: 1, name: "Cty TNHH An Phát", shortName: "An Phát" })
    .onConflictDoUpdate({
      target: companyProfile.id,
      set: { shortName: "An Phát" },
    });
  const map = async (rows: { key: string; id: string }[]) =>
    new Map(rows.map((row) => [row.key, row.id]));
  const items = await map(
    await ctx.db.select({ key: item.code, id: item.id }).from(item),
  );
  const kits = await map(
    await ctx.db.select({ key: kit.code, id: kit.id }).from(kit),
  );
  const customers = await map(
    await ctx.db.select({ key: customer.code, id: customer.id }).from(customer),
  );
  const sites = await map(
    await ctx.db.select({ key: site.name, id: site.id }).from(site),
  );
  const need = (rows: Map<string, string>, key: string) => {
    const id = rows.get(key);
    if (!id) throw new Error(`no fixture row ${key}`);
    return id;
  };
  return {
    director: withScope(director),
    sales: withScope(sales),
    accountant: withScope(accountant),
    warehouse: withScope(warehouse),
    item: (code) => need(items, code),
    kit: (code) => need(kits, code),
    customer: (code) => need(customers, code),
    site: (name) => need(sites, name),
    seller: async (username, scope) => {
      const person = await createTestUser(ctx, { role: "SALES", username });
      await ctx.db
        .update(user)
        .set({ contractScope: scope })
        .where(eq(user.id, person.id));
      return withScope(person, scope);
    },
  };
}

/** The rental of D5: 300 BO-17 kits, 400 PK-KU, prices from the catalog. */
export function d5Rental(fx: ContractFixture): ContractBody {
  return {
    type: "RENTAL",
    customerId: fx.customer("NT-0001"),
    siteId: fx.site("Trường THCS Dương Nội"),
    customerToken: "Minh Phát",
    signedDate: "2026-10-28",
    startDate: "2026-11-01",
    endDate: "2027-03-21",
    kits: [{ kitId: fx.kit("BO-17"), quantity: 300 }],
    lines: [{ itemId: fx.item("PK-KU"), quantity: "400" }],
    deposits: [
      { kind: "CASH", amount: 50_000_000, method: "TRANSFER" },
      {
        kind: "GUARANTEE",
        amount: 100_000_000,
        bankName: "Vietcombank",
        guaranteeNumber: "BL-2026-1188",
        expiryDate: "2027-03-31",
      },
    ],
    batches: [
      {
        plannedDate: "2026-11-01",
        lines: [{ kitId: fx.kit("BO-17"), quantity: "150" }],
      },
      {
        plannedDate: "2026-11-15",
        lines: [
          { kitId: fx.kit("BO-17"), quantity: "150" },
          { itemId: fx.item("PK-KU"), quantity: "400" },
        ],
      },
    ],
  };
}

/** A sale by kg to the private customer, no site. */
export function kgSale(fx: ContractFixture): ContractBody {
  return {
    type: "SALE",
    customerId: fx.customer("NT-0002"),
    siteId: null,
    customerToken: "PDLONG",
    startDate: "2026-10-28",
    lines: [
      {
        itemId: fx.item("GG-K17"),
        condition: "GOOD",
        pricingUnit: "KG",
        quantity: "1250,5",
        price: 14_000,
      },
    ],
  };
}

// Sample contracts for dev and E2E (contracts tasks 7.6): the rental of
// drawing D5 waiting for the director, an approved rental with a draft
// amendment like D5b, and a sale by kg. Created through the services; runs
// only while there is no contract yet, so running it again adds nothing.
import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  companyProfile,
  contract,
  customer,
  item,
  kit,
  site,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Actor } from "@/lib/catalog/common";

import { createAmendment, updateAmendment } from "./amendments";
import { approveContract, submitContract } from "./approval";
import type { ContractActor } from "./common";
import { createContract, type ContractBody } from "./service";

/** A sample short name, only when Cài đặt has none (dev data, not code). */
const SAMPLE_COMPANY_SHORT = "An Phát";

async function lookup(db: Database) {
  const map = async <T extends { key: string; id: string }>(rows: T[]) =>
    new Map(rows.map((row) => [row.key, row.id]));
  const [items, kits, customers, sites] = await Promise.all([
    db.select({ key: item.code, id: item.id }).from(item).then(map),
    db.select({ key: kit.code, id: kit.id }).from(kit).then(map),
    db.select({ key: customer.name, id: customer.id }).from(customer).then(map),
    db.select({ key: site.name, id: site.id }).from(site).then(map),
  ]);
  const need = (rows: Map<string, string>, key: string) => {
    const id = rows.get(key);
    if (!id) throw new Error(`sample contract needs ${key}`);
    return id;
  };
  return {
    item: (code: string) => need(items, code),
    kit: (code: string) => need(kits, code),
    customer: (name: string) => need(customers, name),
    site: (name: string) => need(sites, name),
  };
}

const MINH_PHAT = "Cty TNHH Xây dựng Minh Phát";

function ok<T>(
  result: { ok: true; data: T } | { ok: false; error: string },
): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function seedContracts(
  db: Database,
  people: { director: Actor; sales: Actor },
): Promise<number> {
  const [any] = await db.select({ id: contract.id }).from(contract).limit(1);
  if (any) return 0;
  await db
    .update(companyProfile)
    .set({ shortName: SAMPLE_COMPANY_SHORT })
    .where(and(eq(companyProfile.id, 1), isNull(companyProfile.shortName)));
  const director: ContractActor = { ...people.director, contractScope: "ALL" };
  const sales: ContractActor = { ...people.sales, contractScope: "ALL" };
  const fx = await lookup(db);

  // D5: Trường THCS Dương Nội, 300 kits + 400 PK-KU, waiting for approval.
  const d5: ContractBody = {
    type: "RENTAL",
    customerId: fx.customer(MINH_PHAT),
    siteId: fx.site("Trường THCS Dương Nội"),
    customerToken: "MINHPHAT",
    signedDate: "2026-10-28",
    startDate: "2026-11-01",
    endDate: "2027-03-21",
    companyTruck: true,
    freightPerTrip: 1_800_000,
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
  const pending = ok(await createContract(db, sales, d5));
  ok(await submitContract(db, sales, pending.id));

  // D5b: an approved rental at An Phú – Block B with a draft amendment.
  const approved = ok(
    await createContract(db, sales, {
      type: "RENTAL",
      customerId: fx.customer(MINH_PHAT),
      siteId: fx.site("Chung cư An Phú – Block B"),
      customerToken: "MINHPHAT",
      signedDate: "2026-06-12",
      startDate: "2026-06-15",
      endDate: "2026-12-15",
      kits: [{ kitId: fx.kit("BO-17"), quantity: 200 }],
      lines: [{ itemId: fx.item("PK-KU"), quantity: "40" }],
      deposits: [{ kind: "CASH", amount: 50_000_000, method: "TRANSFER" }],
    }),
  );
  ok(await submitContract(db, sales, approved.id));
  ok(await approveContract(db, director, approved.id, null));
  const draft = ok(
    await createAmendment(db, sales, approved.id, {
      today: "2026-11-02" as BusinessDate,
    }),
  );
  ok(
    await updateAmendment(db, sales, approved.id, draft.number, {
      effectiveFrom: "2026-12-15",
      reason: "Khách thuê thêm cây chống và gia hạn tới 30/04/2027",
      startDate: "2026-06-15",
      signedDate: "2026-06-12",
      endDate: "2027-04-30",
      kits: [{ kitId: fx.kit("BO-17"), quantity: 200 }],
      lines: [
        { itemId: fx.item("PK-KU"), quantity: "40" },
        { itemId: fx.item("GG-CH"), quantity: "0", price: 400 },
        { itemId: fx.item("OT-06"), quantity: "200", price: 700 },
      ],
      deposits: [{ kind: "CASH", amount: 70_000_000, method: "TRANSFER" }],
      updatedAt: draft.updatedAt,
    }),
  );

  // A sale by kg to the private customer, picked up at the yard.
  ok(
    await createContract(db, sales, {
      type: "SALE",
      customerId: fx.customer("Anh Trần Văn Hùng (cai thầu)"),
      siteId: null,
      customerToken: "TVHUNG",
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
    }),
  );
  return 3;
}

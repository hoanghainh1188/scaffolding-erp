// Full customer ranking of the year on D15 (management-reports design D8;
// 0.2 #93, #95, #110, #115): the D1 top 5 functions without the limit, so
// the first five rows are D1's. Revenue = rent + sale before VAT; kg =
// delivered this year, returns not taken back.
import { and, between, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import { contract, customer, deliveryNote } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { topCustomers } from "@/domain/dashboard";
import type { RevenueBook } from "@/lib/dashboard/revenue";
import { kgByCustomer, revenueByCustomer } from "@/lib/dashboard/top";

type Reader = Pick<Database, "select">;

export interface RankingRow {
  rank: number;
  customerId: string;
  name: string;
  revenue: number;
  rent: number;
  sale: number;
  kgMilli: number;
  /** Contracts with revenue or a posted delivery in the year. */
  contracts: number;
}

export interface CustomerRanking {
  byRevenue: RankingRow[];
  byKg: RankingRow[];
}

async function namesOf(db: Reader, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: customer.id, name: customer.name })
    .from(customer)
    .where(inArray(customer.id, [...new Set(ids)]));
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function deliveredContracts(
  db: Reader,
  from: BusinessDate,
  to: BusinessDate,
) {
  return db
    .select({
      customerId: contract.customerId,
      contractId: deliveryNote.contractId,
    })
    .from(deliveryNote)
    .innerJoin(contract, eq(contract.id, deliveryNote.contractId))
    .where(
      and(
        eq(deliveryNote.status, "POSTED"),
        between(deliveryNote.businessDate, from, to),
      ),
    )
    .groupBy(contract.customerId, deliveryNote.contractId);
}

/** Every customer of the year, ranked both ways (book cut at `to`). */
export async function customerRanking(
  db: Reader,
  book: RevenueBook,
  from: BusinessDate,
  to: BusinessDate,
): Promise<CustomerRanking> {
  const revenue = revenueByCustomer(book, from);
  const [kg, delivered] = await Promise.all([
    kgByCustomer(db, from, to),
    deliveredContracts(db, from, to),
  ]);
  const rent = new Map<string, number>();
  const sale = new Map<string, number>();
  const contracts = new Map<string, Set<string>>();
  const touch = (customerId: string, contractId: string) =>
    contracts.set(
      customerId,
      (contracts.get(customerId) ?? new Set()).add(contractId),
    );
  for (const entry of book.entries) {
    if (entry.date < from) continue;
    rent.set(entry.customerId, (rent.get(entry.customerId) ?? 0) + entry.rent);
    sale.set(entry.customerId, (sale.get(entry.customerId) ?? 0) + entry.sale);
    if (entry.rent !== 0 || entry.sale !== 0) {
      touch(entry.customerId, entry.contractId);
    }
  }
  for (const row of delivered) touch(row.customerId, row.contractId);
  const names = await namesOf(db, [...revenue.keys(), ...kg.keys()]);
  const rank = (values: ReadonlyMap<string, number>): RankingRow[] =>
    topCustomers(
      [...values].map(([customerId, value]) => ({
        customerId,
        name: names.get(customerId) ?? "",
        value,
      })),
      Number.POSITIVE_INFINITY,
    ).map((row, index) => ({
      rank: index + 1,
      customerId: row.customerId,
      name: row.name,
      revenue: revenue.get(row.customerId) ?? 0,
      rent: rent.get(row.customerId) ?? 0,
      sale: sale.get(row.customerId) ?? 0,
      kgMilli: kg.get(row.customerId) ?? 0,
      contracts: contracts.get(row.customerId)?.size ?? 0,
    }));
  return { byRevenue: rank(revenue), byKg: rank(kg) };
}

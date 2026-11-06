// Top 5 customers of the year (dashboard-basic design D3, 0.2 #93, #95):
// by revenue (rent + sale before VAT, from the revenue book) or by kg
// delivered this year (rental and sale delivery notes posted from 01/01,
// weighed kg when the pick was weighed, else quantity × standard weight;
// returns are not subtracted).
import { and, eq, gte, inArray, lte } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contract,
  customer,
  deliveryNote,
  deliveryNoteLine,
  deliveryNotePick,
  item,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { topCustomers, type RankedCustomer } from "@/domain/dashboard";
import { lineWeightKgMilli } from "@/domain/landed-cost";
import { quantityFromDb } from "@/domain/quantity";
import { unitFromDb } from "@/lib/inventory/unit";

import type { RevenueBook } from "./revenue";

type Reader = Pick<Database, "select">;

async function namesOf(
  db: Reader,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: customer.id, name: customer.name })
    .from(customer)
    .where(inArray(customer.id, [...new Set(ids)]));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Revenue by customer from `from` (01/01) in the book. */
export async function topByRevenue(
  db: Reader,
  book: RevenueBook,
  from: BusinessDate,
): Promise<RankedCustomer[]> {
  const totals = new Map<string, number>();
  for (const entry of book.entries) {
    if (entry.date < from) continue;
    totals.set(
      entry.customerId,
      (totals.get(entry.customerId) ?? 0) + entry.rent + entry.sale,
    );
  }
  const names = await namesOf(db, [...totals.keys()]);
  return topCustomers(
    [...totals].map(([customerId, value]) => ({
      customerId,
      name: names.get(customerId) ?? "",
      value,
    })),
  );
}

/** Kg delivered by customer from `from` to `to` (0.2 #95), in kg × 1000. */
export async function topByKg(
  db: Reader,
  from: BusinessDate,
  to: BusinessDate,
): Promise<RankedCustomer[]> {
  const picks = await db
    .select({
      customerId: contract.customerId,
      unit: item.unit,
      weight: item.standardWeightKg,
      quantity: deliveryNotePick.quantity,
      weighedKg: deliveryNotePick.weighedKg,
    })
    .from(deliveryNotePick)
    .innerJoin(
      deliveryNoteLine,
      eq(deliveryNoteLine.id, deliveryNotePick.lineId),
    )
    .innerJoin(deliveryNote, eq(deliveryNote.id, deliveryNoteLine.noteId))
    .innerJoin(contract, eq(contract.id, deliveryNote.contractId))
    .innerJoin(item, eq(item.id, deliveryNoteLine.itemId))
    .where(
      and(
        eq(deliveryNote.status, "POSTED"),
        gte(deliveryNote.businessDate, from),
        lte(deliveryNote.businessDate, to),
      ),
    );
  const totals = new Map<string, number>();
  for (const pick of picks) {
    const unit = unitFromDb(pick.unit);
    const kg = pick.weighedKg
      ? quantityFromDb(pick.weighedKg, "KG").milli
      : lineWeightKgMilli(
          unit,
          quantityFromDb(pick.quantity, unit).milli,
          pick.weight,
        );
    totals.set(pick.customerId, (totals.get(pick.customerId) ?? 0) + kg);
  }
  const names = await namesOf(db, [...totals.keys()]);
  return topCustomers(
    [...totals].map(([customerId, value]) => ({
      customerId,
      name: names.get(customerId) ?? "",
      value,
    })),
  );
}

// D6d (site-operations design D6, D10): what may go out (items on the
// contract with Mới + Tốt at each yard) and come back (items on site), with
// the daily prices, the yards and the freight default of the contract.
import { and, asc, eq, inArray, max, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { deliveryNote, inventoryLedger, location } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { QuantityUnit } from "@/domain/quantity";
import { contractTermsAt } from "@/lib/contracts/terms";
import {
  itemFacts,
  milliOf,
  onSiteByItem,
  type ItemFacts,
} from "@/lib/deliveries/records";
import { contractPlace } from "@/lib/site-transfers/records";

type Reader = Pick<Database, "select">;

export interface ExchangeGiveItem {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  dailyPrice: number;
  /** Mới + Tốt by yard id, thousandths. */
  yardStock: Record<string, number>;
}

export interface ExchangeTakeItem {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  onSiteMilli: number;
  dailyPrice: number;
}

export interface ExchangeForm {
  contract: { id: string; code: string; siteName: string };
  give: ExchangeGiveItem[];
  take: ExchangeTakeItem[];
  yards: { id: string; code: string; name: string }[];
  companyTruck: boolean;
  freightPerTrip: number | null;
  nextBatchNo: number;
}

export async function exchangeForm(
  db: Reader,
  contractId: string,
  today: BusinessDate,
): Promise<ExchangeForm | null> {
  const place = await contractPlace(db, contractId);
  if (!place || place.type !== "RENTAL" || place.status !== "ACTIVE") {
    return null;
  }
  const terms = await contractTermsAt(db, place.id, today);
  if (!terms) return null;
  const daily = new Map(
    terms.lines.map((line) => [line.itemId, line.price ?? 0]),
  );
  const onSite = await onSiteByItem(db, place.id);
  const giveIds = [...daily.keys()];
  const takeIds = [...onSite]
    .filter(([, milli]) => milli > 0)
    .map(([id]) => id);
  const facts = await itemFacts(db, [...giveIds, ...takeIds]);
  const yards = await db
    .select({ id: location.id, code: location.code, name: location.name })
    .from(location)
    .where(and(eq(location.type, "YARD"), eq(location.status, "ACTIVE")))
    .orderBy(asc(location.code));
  const stock =
    giveIds.length && yards.length
      ? await db
          .select({
            itemId: inventoryLedger.itemId,
            locationId: inventoryLedger.locationId,
            quantity: sql<string>`sum(${inventoryLedger.quantity})`,
          })
          .from(inventoryLedger)
          .where(
            and(
              inArray(inventoryLedger.itemId, giveIds),
              inArray(
                inventoryLedger.locationId,
                yards.map((yard) => yard.id),
              ),
              inArray(inventoryLedger.condition, ["NEW", "GOOD"]),
            ),
          )
          .groupBy(inventoryLedger.itemId, inventoryLedger.locationId)
      : [];
  const [last] = await db
    .select({ batchNo: max(deliveryNote.batchNo) })
    .from(deliveryNote)
    .where(eq(deliveryNote.contractId, place.id));
  const named = (itemId: string) => facts.get(itemId) as ItemFacts;
  return {
    contract: { id: place.id, code: place.code, siteName: place.siteName },
    give: giveIds
      .map((itemId) => ({
        itemId,
        code: named(itemId).code,
        name: named(itemId).name,
        unit: named(itemId).unit,
        dailyPrice: daily.get(itemId) ?? 0,
        yardStock: Object.fromEntries(
          stock
            .filter((row) => row.itemId === itemId && row.locationId)
            .map((row) => [row.locationId as string, milliOf(row.quantity)]),
        ),
      }))
      .sort((a, b) => a.code.localeCompare(b.code, "vi")),
    take: takeIds
      .map((itemId) => ({
        itemId,
        code: named(itemId).code,
        name: named(itemId).name,
        unit: named(itemId).unit,
        onSiteMilli: onSite.get(itemId) ?? 0,
        dailyPrice: daily.get(itemId) ?? 0,
      }))
      .sort((a, b) => a.code.localeCompare(b.code, "vi")),
    yards,
    companyTruck: terms.companyTruck,
    freightPerTrip: terms.freightPerTrip,
    nextBatchNo: (last?.batchNo ?? 0) + 1,
  };
}

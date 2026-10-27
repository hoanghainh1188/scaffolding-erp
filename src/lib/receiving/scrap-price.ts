// Reference scrap price (goods-receipt spec scrap-price, design D9): an
// append-only history; the current price is the latest row.
import { desc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { scrapPrice, user } from "@/db/schema";
import { DomainValueError } from "@/domain/errors";
import { toMoney, type Money } from "@/domain/money";
import { checkScrapNote, checkScrapPrice } from "@/domain/scrap-price";
import { ok, type Actor, type ServiceResult } from "@/lib/catalog/common";

export interface ScrapPriceRow {
  id: number;
  pricePerKg: Money;
  note: string | null;
  createdByName: string;
  createdAt: Date;
}

type Reader = Pick<Database, "select">;

const columns = {
  id: scrapPrice.id,
  pricePerKg: scrapPrice.pricePerKg,
  note: scrapPrice.note,
  createdByName: user.name,
  createdAt: scrapPrice.createdAt,
};

function toRow(row: {
  id: number;
  pricePerKg: number;
  note: string | null;
  createdByName: string;
  createdAt: Date;
}): ScrapPriceRow {
  return { ...row, pricePerKg: toMoney(row.pricePerKg) };
}

/** The latest price, or null before the director sets one. */
export async function currentScrapPrice(
  tx: Reader,
): Promise<ScrapPriceRow | null> {
  const [row] = await tx
    .select(columns)
    .from(scrapPrice)
    .innerJoin(user, eq(user.id, scrapPrice.createdBy))
    .orderBy(desc(scrapPrice.id))
    .limit(1);
  return row ? toRow(row) : null;
}

export async function scrapPriceHistory(
  db: Reader,
  limit = 20,
): Promise<ScrapPriceRow[]> {
  const rows = await db
    .select(columns)
    .from(scrapPrice)
    .innerJoin(user, eq(user.id, scrapPrice.createdBy))
    .orderBy(desc(scrapPrice.id))
    .limit(limit);
  return rows.map(toRow);
}

export interface ScrapPriceBody {
  pricePerKg?: number;
  note?: string | null;
}

/** "Lưu giá": adds a row; the price holds from now on. */
export async function setScrapPrice(
  db: Database,
  actor: Actor,
  body: ScrapPriceBody,
): Promise<ServiceResult<ScrapPriceRow>> {
  let price: Money;
  let note: string | null;
  try {
    price = checkScrapPrice(body.pricePerKg ?? Number.NaN);
    note = checkScrapNote(body.note);
  } catch (error: unknown) {
    if (!(error instanceof DomainValueError)) throw error;
    const field = error.message.startsWith("Ghi chú") ? "note" : "pricePerKg";
    return { ok: false, status: 422, error: error.message, field };
  }
  await db
    .insert(scrapPrice)
    .values({ pricePerKg: price, note, createdBy: actor.id });
  const current = await currentScrapPrice(db);
  if (!current) throw new Error("scrap price insert returned nothing");
  return ok(current);
}

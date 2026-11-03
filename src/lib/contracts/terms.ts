// "Giá đang áp dụng tại ngày X" (contract-amendments spec, design D2): the
// approved revision with the latest effective date on or before X (the
// higher number on the same date), and what it holds. rental-billing reads
// prices only through here.
import { inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import { item } from "@/db/schema";
import { revisionAt } from "@/domain/contract-revision";

import { readContent, type StoredBatch } from "./content";
import { readRevisions } from "./records";

type Reader = Pick<Database, "select">;

export interface TermsLine {
  itemId: string;
  itemCode: string;
  condition: string | null;
  pricingUnit: string;
  /** Stored numeric text: in the item's unit, or kg for a sale by kg. */
  quantity: string;
  /** ₫ per day (rental) or per unit / kg (sale). */
  price: number | null;
}

export interface ContractTerms {
  revisionId: string;
  /** The revision that applies: the contract code or code + "/01". */
  revisionCode: string;
  revisionNumber: number;
  effectiveFrom: string;
  minRentalDays: number | null;
  paymentTermsDays: number;
  vatEnabled: boolean;
  vatRate: string | null;
  companyTruck: boolean;
  freightPerTrip: number | null;
  lines: TermsLine[];
  compensations: {
    itemId: string;
    itemCode: string;
    lostPrice: number | null;
    damagePrice: number | null;
  }[];
  /** The delivery plan: a hint for deliveries only (contracts design D6). */
  batches: StoredBatch[];
}

/** The terms on `date` (YYYY-MM-DD), or null before the contract is approved. */
export async function contractTermsAt(
  tx: Reader,
  contractId: string,
  date: string,
): Promise<ContractTerms | null> {
  const revision = revisionAt(await readRevisions(tx, contractId), date);
  if (!revision) return null;
  const content = await readContent(tx, revision.id);
  const ids = [
    ...new Set([
      ...content.lines.map((line) => line.itemId),
      ...content.compensations.map((entry) => entry.itemId),
    ]),
  ];
  const rows = ids.length
    ? await tx
        .select({ id: item.id, code: item.code })
        .from(item)
        .where(inArray(item.id, ids))
    : [];
  const codes = new Map(rows.map((row) => [row.id, row.code]));
  return {
    revisionId: revision.id,
    revisionCode: revision.code,
    revisionNumber: revision.number,
    effectiveFrom: revision.effectiveFrom,
    minRentalDays: revision.minRentalDays,
    paymentTermsDays: revision.paymentTermsDays,
    vatEnabled: revision.vatEnabled,
    vatRate: revision.vatRate,
    companyTruck: revision.companyTruck,
    freightPerTrip: revision.freightPerTrip,
    lines: content.lines.map((line) => ({
      itemId: line.itemId,
      itemCode: codes.get(line.itemId) ?? "",
      condition: line.condition,
      pricingUnit: line.pricingUnit,
      quantity: line.quantity,
      price: line.price,
    })),
    compensations: content.compensations.map((entry) => ({
      itemId: entry.itemId,
      itemCode: codes.get(entry.itemId) ?? "",
      lostPrice: entry.lostPrice,
      damagePrice: entry.damagePrice,
    })),
    batches: content.batches,
  };
}

// What receivables reads of a contract's deliveries (deliveries design D6):
// posted notes with their delivery date, freight and sale lines. Money is
// computed here from stored quantities and prices, never kept as a total.
import { and, asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { deliveryNote } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { PricingUnit } from "@/domain/contract-lines";
import { deliveredSaleAmount } from "@/domain/delivery-note";
import { toMoney, type Money } from "@/domain/money";

import { itemFacts, readNoteContent } from "./records";

type Reader = Pick<Database, "select">;

export interface DeliveredAmounts {
  id: string;
  code: string;
  batchNo: number;
  vehiclePlate: string | null;
  businessDate: BusinessDate;
  /** One-way freight when the company called the truck. */
  freight: Money | null;
  /** Sale lines: money of what left the yard. Empty for a rental. */
  saleLines: { itemCode: string; amount: Money }[];
  saleTotal: Money;
}

/** Posted notes of a contract, oldest first. */
export async function deliveredAmounts(
  db: Reader,
  contractId: string,
): Promise<DeliveredAmounts[]> {
  const notes = await db
    .select({
      id: deliveryNote.id,
      code: deliveryNote.code,
      batchNo: deliveryNote.batchNo,
      vehiclePlate: deliveryNote.vehiclePlate,
      businessDate: deliveryNote.businessDate,
      companyTruck: deliveryNote.companyTruck,
      freightAmount: deliveryNote.freightAmount,
    })
    .from(deliveryNote)
    .where(
      and(
        eq(deliveryNote.contractId, contractId),
        eq(deliveryNote.status, "POSTED"),
      ),
    )
    .orderBy(asc(deliveryNote.businessDate), asc(deliveryNote.batchNo));
  const result: DeliveredAmounts[] = [];
  for (const note of notes) {
    const content = await readNoteContent(db, note.id);
    const facts = await itemFacts(
      db,
      content.lines.map((line) => line.itemId),
    );
    const saleLines = content.lines
      .filter((line) => line.pricingUnit !== null && line.unitPrice !== null)
      .map((line) => {
        const info = facts.get(line.itemId);
        const amount = content.picks
          .filter((pick) => pick.lineId === line.id)
          .reduce(
            (sum, pick) =>
              sum +
              deliveredSaleAmount({
                pricingUnit: line.pricingUnit as PricingUnit,
                unit: info?.unit ?? "PIECE",
                quantityMilli: pick.quantityMilli,
                weighedMilli: pick.weighedMilli,
                unitPrice: toMoney(line.unitPrice ?? 0),
              }),
            0,
          );
        return { itemCode: info?.code ?? "", amount: toMoney(amount) };
      });
    result.push({
      id: note.id,
      code: note.code,
      batchNo: note.batchNo,
      vehiclePlate: note.vehiclePlate,
      businessDate: (note.businessDate ?? "") as BusinessDate,
      freight:
        note.companyTruck && note.freightAmount !== null
          ? toMoney(note.freightAmount)
          : null,
      saleLines,
      saleTotal: toMoney(saleLines.reduce((sum, line) => sum + line.amount, 0)),
    });
  }
  return result;
}

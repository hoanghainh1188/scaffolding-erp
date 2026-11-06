// Which ledger lines belong to a contract at its site (returns-and-
// compensation design D8, site-operations design D8, rental-billing design
// D1): those of its delivery notes and return notes at the site, of its site
// transfers by the sign of the line (out to the source, in to the target, so
// two contracts at one site stay apart) and of its approved buy-backs. The
// conditions live here once; siteMovements sums them, siteLedgerLines lists
// them with their dates for the rent.
import { and, eq, gt, inArray, lt, or, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  buyBackNote,
  deliveryNote,
  inventoryLedger,
  returnNote,
  siteTransfer,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";

type Reader = Pick<Database, "select">;

export const DELIVERY_DOCUMENT_TYPE = "DELIVERY_NOTE";
/** Ledger document type of return notes (returns-and-compensation). */
export const RETURN_DOCUMENT_TYPE = "RETURN_NOTE";
/** Ledger document types of site-operations (design D2, D5). */
export const SITE_TRANSFER_DOCUMENT_TYPE = "SITE_TRANSFER";
export const BUY_BACK_DOCUMENT_TYPE = "BUY_BACK";

/** Join and filter of the four sources, for one contract. */
export const SITE_SOURCES = {
  delivery: {
    join: and(
      eq(deliveryNote.id, inventoryLedger.documentId),
      eq(inventoryLedger.documentType, DELIVERY_DOCUMENT_TYPE),
      eq(inventoryLedger.locationId, deliveryNote.siteLocationId),
    ) as SQL,
    where: (contractId: string) => eq(deliveryNote.contractId, contractId),
  },
  return: {
    join: and(
      eq(returnNote.id, inventoryLedger.documentId),
      eq(inventoryLedger.documentType, RETURN_DOCUMENT_TYPE),
      eq(inventoryLedger.locationId, returnNote.siteLocationId),
    ) as SQL,
    where: (contractId: string) => eq(returnNote.contractId, contractId),
  },
  transfer: {
    join: and(
      eq(siteTransfer.id, inventoryLedger.documentId),
      eq(inventoryLedger.documentType, SITE_TRANSFER_DOCUMENT_TYPE),
    ) as SQL,
    where: (contractId: string) =>
      or(
        and(
          eq(siteTransfer.fromContractId, contractId),
          lt(inventoryLedger.quantity, "0"),
        ),
        and(
          eq(siteTransfer.toContractId, contractId),
          gt(inventoryLedger.quantity, "0"),
        ),
      ) as SQL,
  },
  buyBack: {
    join: and(
      eq(buyBackNote.id, inventoryLedger.documentId),
      eq(inventoryLedger.documentType, BUY_BACK_DOCUMENT_TYPE),
    ) as SQL,
    where: (contractId: string) => eq(buyBackNote.contractId, contractId),
  },
} as const;

/** One ledger line of the contract at its site, with its document. */
export interface SiteLedgerLine {
  ledgerId: number;
  itemId: string;
  condition: Condition;
  movement: string;
  /** Signed, thousandths of the unit. */
  milli: number;
  businessDate: BusinessDate;
  documentType: string;
  documentId: string;
  documentCode: string;
  /** Delivery notes only. */
  batchNo: number | null;
  /** Site transfers only (0.2 #70). */
  sameCustomer: boolean | null;
  fromContractId: string | null;
  toContractId: string | null;
}

const milliOf = (quantity: string): number =>
  Math.round(Number(quantity) * 1000);

const base = {
  ledgerId: inventoryLedger.id,
  itemId: inventoryLedger.itemId,
  condition: inventoryLedger.condition,
  movement: inventoryLedger.movement,
  quantity: inventoryLedger.quantity,
  businessDate: inventoryLedger.businessDate,
  documentType: inventoryLedger.documentType,
};

/** Every line of the contract at its site, oldest first. */
export async function siteLedgerLines(
  tx: Reader,
  contractId: string,
): Promise<SiteLedgerLine[]> {
  return (await siteLedgerLinesOf(tx, [contractId])).get(contractId) ?? [];
}

/**
 * The lines of many contracts in four queries (dashboard-basic design D2),
 * by contract, each oldest first. A transfer line goes to the source
 * contract when it leaves and to the target when it arrives, as for one.
 */
export async function siteLedgerLinesOf(
  tx: Reader,
  contractIds: readonly string[],
): Promise<Map<string, SiteLedgerLine[]>> {
  const ids = [...new Set(contractIds)];
  const result = new Map<string, SiteLedgerLine[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return result;
  const [delivered, returned, transferred, bought] = await Promise.all([
    tx
      .select({
        ...base,
        owner: deliveryNote.contractId,
        documentId: deliveryNote.id,
        documentCode: deliveryNote.code,
        batchNo: deliveryNote.batchNo,
      })
      .from(inventoryLedger)
      .innerJoin(deliveryNote, SITE_SOURCES.delivery.join)
      .where(inArray(deliveryNote.contractId, ids)),
    tx
      .select({
        ...base,
        owner: returnNote.contractId,
        documentId: returnNote.id,
        documentCode: returnNote.code,
      })
      .from(inventoryLedger)
      .innerJoin(returnNote, SITE_SOURCES.return.join)
      .where(inArray(returnNote.contractId, ids)),
    tx
      .select({
        ...base,
        documentId: siteTransfer.id,
        documentCode: siteTransfer.code,
        sameCustomer: siteTransfer.sameCustomer,
        fromContractId: siteTransfer.fromContractId,
        toContractId: siteTransfer.toContractId,
      })
      .from(inventoryLedger)
      .innerJoin(siteTransfer, SITE_SOURCES.transfer.join)
      .where(
        or(
          and(
            inArray(siteTransfer.fromContractId, ids),
            lt(inventoryLedger.quantity, "0"),
          ),
          and(
            inArray(siteTransfer.toContractId, ids),
            gt(inventoryLedger.quantity, "0"),
          ),
        ),
      ),
    tx
      .select({
        ...base,
        owner: buyBackNote.contractId,
        documentId: buyBackNote.id,
        documentCode: buyBackNote.code,
      })
      .from(inventoryLedger)
      .innerJoin(buyBackNote, SITE_SOURCES.buyBack.join)
      .where(inArray(buyBackNote.contractId, ids)),
  ]);
  const none = { sameCustomer: null, fromContractId: null, toContractId: null };
  const rows = [
    ...delivered.map((row) => ({ ...row, ...none })),
    ...returned.map((row) => ({ ...row, ...none, batchNo: null })),
    ...transferred.map((row) => ({
      ...row,
      batchNo: null,
      owner: Number(row.quantity) < 0 ? row.fromContractId : row.toContractId,
    })),
    ...bought.map((row) => ({ ...row, ...none, batchNo: null })),
  ];
  for (const row of rows) {
    result.get(row.owner)?.push({
      ledgerId: row.ledgerId,
      itemId: row.itemId,
      condition: row.condition as Condition,
      movement: row.movement,
      milli: milliOf(row.quantity),
      businessDate: row.businessDate as BusinessDate,
      documentType: row.documentType ?? "",
      documentId: row.documentId,
      documentCode: row.documentCode,
      batchNo: row.batchNo,
      sameCustomer: row.sameCustomer,
      fromContractId: row.fromContractId,
      toContractId: row.toContractId,
    });
  }
  for (const lines of result.values()) {
    lines.sort(
      (a, b) =>
        a.businessDate.localeCompare(b.businessDate) || a.ledgerId - b.ledgerId,
    );
  }
  return result;
}

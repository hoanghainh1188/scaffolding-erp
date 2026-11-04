// Which ledger lines belong to a contract at its site (returns-and-
// compensation design D8, site-operations design D8, rental-billing design
// D1): those of its delivery notes and return notes at the site, of its site
// transfers by the sign of the line (out to the source, in to the target, so
// two contracts at one site stay apart) and of its approved buy-backs. The
// conditions live here once; siteMovements sums them, siteLedgerLines lists
// them with their dates for the rent.
import { and, eq, gt, lt, or, type SQL } from "drizzle-orm";

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
  const [delivered, returned, transferred, bought] = await Promise.all([
    tx
      .select({
        ...base,
        documentId: deliveryNote.id,
        documentCode: deliveryNote.code,
        batchNo: deliveryNote.batchNo,
      })
      .from(inventoryLedger)
      .innerJoin(deliveryNote, SITE_SOURCES.delivery.join)
      .where(SITE_SOURCES.delivery.where(contractId)),
    tx
      .select({
        ...base,
        documentId: returnNote.id,
        documentCode: returnNote.code,
      })
      .from(inventoryLedger)
      .innerJoin(returnNote, SITE_SOURCES.return.join)
      .where(SITE_SOURCES.return.where(contractId)),
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
      .where(SITE_SOURCES.transfer.where(contractId)),
    tx
      .select({
        ...base,
        documentId: buyBackNote.id,
        documentCode: buyBackNote.code,
      })
      .from(inventoryLedger)
      .innerJoin(buyBackNote, SITE_SOURCES.buyBack.join)
      .where(SITE_SOURCES.buyBack.where(contractId)),
  ]);
  const rows = [
    ...delivered.map((row) => ({
      ...row,
      sameCustomer: null,
      fromContractId: null,
      toContractId: null,
    })),
    ...returned.map((row) => ({
      ...row,
      batchNo: null,
      sameCustomer: null,
      fromContractId: null,
      toContractId: null,
    })),
    ...transferred.map((row) => ({ ...row, batchNo: null })),
    ...bought.map((row) => ({
      ...row,
      batchNo: null,
      sameCustomer: null,
      fromContractId: null,
      toContractId: null,
    })),
  ];
  return rows
    .map((row) => ({
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
    }))
    .sort(
      (a, b) =>
        a.businessDate.localeCompare(b.businessDate) || a.ledgerId - b.ledgerId,
    );
}

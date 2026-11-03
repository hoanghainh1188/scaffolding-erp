// Reading site transfers and what their rules need (site-operations design
// D3, D4): the two contracts with their customer and site, the transfer row
// FOR UPDATE, its lines, and the stock, terms and "còn phải giao" a check
// reads. Locking order is the contracts (ascending id), then the transfer.
import { asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contract,
  customer,
  site,
  siteTransfer,
  siteTransferLine,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { remainingToDeliver } from "@/domain/delivery-note";
import type { SiteStock } from "@/domain/condition-split";
import type { TransferContract } from "@/domain/site-transfer";
import { notFound, ServiceFailure } from "@/lib/catalog/common";
import type { Tx } from "@/lib/contracts/common";
import { contractTermsAt } from "@/lib/contracts/terms";
import {
  isUuid,
  milliOf,
  onSiteByItem,
  onSiteByItemCondition,
  SITE_TRANSFER_DOCUMENT_TYPE,
  termsLines,
} from "@/lib/deliveries/records";

type Reader = Pick<Database, "select">;

export { SITE_TRANSFER_DOCUMENT_TYPE };

export type TransferRow = typeof siteTransfer.$inferSelect;

export interface TransferPlace extends TransferContract {
  /** The SITE location of the contract; null when it has none. */
  siteLocationId: string | null;
}

/** A contract with its customer and site, as the transfer rules want it. */
export async function contractPlace(
  tx: Reader,
  id: string,
): Promise<TransferPlace | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select({
      id: contract.id,
      code: contract.code,
      type: contract.type,
      status: contract.status,
      customerId: contract.customerId,
      customerName: customer.name,
      siteName: site.name,
      siteLocationId: site.locationId,
    })
    .from(contract)
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(eq(contract.id, id));
  if (!row) return null;
  return {
    ...row,
    type: row.type as "RENTAL" | "SALE",
    siteName: row.siteName ?? "",
    siteLocationId: row.siteLocationId ?? null,
  };
}

/** The transfer by id or code, without locking. */
export async function findTransfer(
  tx: Reader,
  idOrCode: string,
): Promise<TransferRow | null> {
  const [row] = await tx
    .select()
    .from(siteTransfer)
    .where(
      isUuid(idOrCode)
        ? eq(siteTransfer.id, idOrCode)
        : eq(siteTransfer.code, idOrCode),
    );
  return row ?? null;
}

/** The transfer FOR UPDATE (after its contracts), or 404. */
export async function lockTransfer(tx: Tx, id: string): Promise<TransferRow> {
  const [row] = await tx
    .select()
    .from(siteTransfer)
    .where(eq(siteTransfer.id, id))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return row;
}

export interface StoredTransferLine {
  lineNo: number;
  itemId: string;
  plannedMilli: number;
  movedMilli: number | null;
}

export async function readTransferLines(
  tx: Reader,
  transferId: string,
): Promise<StoredTransferLine[]> {
  const rows = await tx
    .select()
    .from(siteTransferLine)
    .where(eq(siteTransferLine.transferId, transferId))
    .orderBy(asc(siteTransferLine.lineNo));
  return rows.map((row) => ({
    lineNo: row.lineNo,
    itemId: row.itemId,
    plannedMilli: milliOf(row.plannedQuantity),
    movedMilli: row.movedQuantity === null ? null : milliOf(row.movedQuantity),
  }));
}

export interface TransferContext {
  onSite: Map<string, SiteStock>;
  onTarget: Set<string>;
  remaining: Map<string, number>;
  /** Daily price of each item on the receiving contract today. */
  targetPrices: Map<string, number | null>;
}

/** Stock of the source, items and "còn phải giao" of the target, today. */
export async function transferContext(
  tx: Reader,
  fromId: string,
  toId: string,
  today: BusinessDate,
): Promise<TransferContext> {
  const [onSite, terms, done] = await Promise.all([
    onSiteByItemCondition(tx, fromId),
    contractTermsAt(tx, toId, today),
    onSiteByItem(tx, toId),
  ]);
  const lines = terms ? await termsLines(tx, terms) : [];
  const remaining = remainingToDeliver({
    type: "RENTAL",
    terms: lines,
    done,
    open: new Map(),
  });
  return {
    onSite,
    onTarget: new Set(lines.map((line) => line.itemId)),
    remaining: new Map(
      remaining.map((row) => [row.line.itemId, row.remainingMilli]),
    ),
    targetPrices: new Map(
      (terms?.lines ?? []).map((line) => [line.itemId, line.price]),
    ),
  };
}

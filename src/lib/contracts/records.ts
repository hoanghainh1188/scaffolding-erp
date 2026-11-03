// Reading and locking contracts and their revisions (contracts design D2,
// D14). Every write locks the contract row FOR UPDATE first, then the
// revision it changes: one order everywhere, so commands queue up.
import { and, asc, eq, inArray } from "drizzle-orm";

import { contract, contractRevision, customer, site } from "@/db/schema";
import type {
  ContractStatus,
  ContractType,
  RevisionStatus,
} from "@/domain/contract";
import { quantityFromDb } from "@/domain/quantity";
import { dailyTotal, expectedValue } from "@/domain/rental";
import { saleLineAmount } from "@/domain/contract-lines";
import { toMoney } from "@/domain/money";
import type { BusinessDate } from "@/domain/business-date";
import { notFound, ServiceFailure } from "@/lib/catalog/common";

import type { Tx } from "./common";
import type { StoredContent, Terms } from "./content";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LockedContract {
  id: string;
  code: string;
  type: ContractType;
  customerId: string;
  siteId: string | null;
  status: ContractStatus;
  salesUserId: string | null;
  lastAmendmentNumber: number;
  updatedAt: Date;
}

/** The contract row FOR UPDATE, or 404 (a malformed id included). */
export async function lockContract(
  tx: Tx,
  id: string,
): Promise<LockedContract> {
  if (!UUID.test(id)) throw new ServiceFailure(notFound());
  const [row] = await tx
    .select({
      id: contract.id,
      code: contract.code,
      type: contract.type,
      customerId: contract.customerId,
      siteId: contract.siteId,
      status: contract.status,
      salesUserId: contract.salesUserId,
      lastAmendmentNumber: contract.lastAmendmentNumber,
      updatedAt: contract.updatedAt,
    })
    .from(contract)
    .where(eq(contract.id, id))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return {
    ...row,
    type: row.type as ContractType,
    status: row.status as ContractStatus,
  };
}

/**
 * Several contracts FOR UPDATE in ascending id order (site-operations design
 * D4): two commands that lock the same pair queue up instead of deadlocking.
 * Returned in the order asked for.
 */
export async function lockContractsInOrder(
  tx: Tx,
  ids: readonly string[],
): Promise<LockedContract[]> {
  const unique = [...new Set(ids)].sort();
  const locked = new Map<string, LockedContract>();
  for (const id of unique) locked.set(id, await lockContract(tx, id));
  return ids.map((id) => locked.get(id) as LockedContract);
}

export type RevisionRow = typeof contractRevision.$inferSelect;

/** Every revision of a contract, original first. */
export function readRevisions(
  tx: Pick<Tx, "select">,
  contractId: string,
): Promise<RevisionRow[]> {
  return tx
    .select()
    .from(contractRevision)
    .where(eq(contractRevision.contractId, contractId))
    .orderBy(asc(contractRevision.number));
}

/** One revision FOR UPDATE (after its contract), or 404. */
export async function lockRevision(
  tx: Tx,
  contractId: string,
  number: number,
): Promise<RevisionRow> {
  if (!Number.isInteger(number) || number < 0) {
    throw new ServiceFailure(notFound());
  }
  const [row] = await tx
    .select()
    .from(contractRevision)
    .where(
      and(
        eq(contractRevision.contractId, contractId),
        eq(contractRevision.number, number),
      ),
    )
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return row;
}

/** The open (draft or pending) amendment of a contract, if any. */
export function openAmendment(
  revisions: readonly RevisionRow[],
): RevisionRow | undefined {
  return revisions.find(
    (row) =>
      row.kind === "AMENDMENT" &&
      (row.status === "DRAFT" || row.status === "PENDING"),
  );
}

/** The latest approved revision: what an amendment starts from. */
export function latestApproved(
  revisions: readonly RevisionRow[],
): RevisionRow | undefined {
  return revisions
    .filter((row) => row.status === "APPROVED")
    .sort((a, b) => b.number - a.number)[0];
}

export function termsOf(row: RevisionRow): Terms {
  return {
    signedDate: row.signedDate,
    startDate: row.startDate,
    endDate: row.endDate,
    minRentalDays: row.minRentalDays,
    billingCycle: row.billingCycle,
    paymentTermsDays: row.paymentTermsDays,
    vatEnabled: row.vatEnabled,
    vatRate: row.vatRate,
    companyTruck: row.companyTruck,
    freightPerTrip: row.freightPerTrip,
    note: row.note,
  };
}

/** The revision columns of checked terms. */
export function termColumns(terms: Terms) {
  return {
    signedDate: terms.signedDate,
    startDate: terms.startDate,
    endDate: terms.endDate,
    minRentalDays: terms.minRentalDays,
    billingCycle: terms.billingCycle,
    paymentTermsDays: terms.paymentTermsDays,
    vatEnabled: terms.vatEnabled,
    vatRate: terms.vatRate,
    companyTruck: terms.companyTruck,
    freightPerTrip: terms.freightPerTrip,
    note: terms.note,
  };
}

/** Thousandths of a stored quantity, whatever its unit. */
export const milliOf = (quantity: string) =>
  quantityFromDb(quantity, "KG").milli;

/** Day's rent of a rental (lines without price count as 0 ₫). */
export function dayRentOf(content: StoredContent): number {
  return dailyTotal(
    content.lines.map((line) => ({
      dailyPrice: line.price ?? 0,
      quantityMilli: milliOf(line.quantity),
    })),
  );
}

/**
 * Expected value (rental) or total (sale), null while a price or the end
 * date is still missing.
 */
export function valueOf(
  type: ContractType,
  terms: Terms,
  content: StoredContent,
): number | null {
  if (content.lines.some((line) => line.price === null)) return null;
  if (type === "SALE") {
    return content.lines.reduce(
      (sum, line) =>
        sum + saleLineAmount(milliOf(line.quantity), toMoney(line.price ?? 0)),
      0,
    );
  }
  if (!terms.endDate) return null;
  return expectedValue({
    dailyTotal: dayRentOf(content),
    startDate: terms.startDate as BusinessDate,
    endDate: terms.endDate as BusinessDate,
    minDays: terms.minRentalDays ?? 0,
  }).amount;
}

export interface Names {
  customer: string;
  site: string | null;
}

/** Customer and site names, for summaries. */
export async function namesOf(
  tx: Pick<Tx, "select">,
  customerId: string,
  siteId: string | null,
): Promise<Names> {
  const [buyer] = await tx
    .select({ name: customer.name })
    .from(customer)
    .where(eq(customer.id, customerId));
  const places = siteId
    ? await tx
        .select({ name: site.name })
        .from(site)
        .where(inArray(site.id, [siteId]))
    : [];
  return { customer: buyer?.name ?? "", site: places[0]?.name ?? null };
}

export type { RevisionStatus };

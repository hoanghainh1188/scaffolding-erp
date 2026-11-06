// The rent sources of many contracts at once (dashboard-basic design D2):
// the same BillingSource as loadBillingSource, read with one query per kind
// (ledger lines, revisions, prices, freight, adjustments, closed months,
// items) for the whole batch instead of five per contract.
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  billingAdjustment,
  billingPeriod,
  contractLine,
  contractRevision,
  deliveryNote,
  user,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import {
  basisPointsOf,
  monthOf,
  type BillingTerms,
  type FreightInput,
} from "@/domain/rental-billing";
import { siteLedgerLinesOf } from "@/lib/deliveries/site-ledger";

import type { AdjustmentRow, BillingSource, ClosedMonth } from "./compute";
import { itemFactsOf, piecesOfBatch } from "./ledger";

type Reader = Pick<Database, "select">;

const groupBy = <T>(rows: readonly T[], key: (row: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  }
  return groups;
};

async function termsOf(
  tx: Reader,
  ids: readonly string[],
): Promise<Map<string, BillingTerms[]>> {
  const revisions = await tx
    .select()
    .from(contractRevision)
    .where(
      and(
        inArray(contractRevision.contractId, [...ids]),
        eq(contractRevision.status, "APPROVED"),
      ),
    )
    .orderBy(asc(contractRevision.number));
  const prices = revisions.length
    ? await tx
        .select({
          revisionId: contractLine.revisionId,
          itemId: contractLine.itemId,
          price: contractLine.price,
        })
        .from(contractLine)
        .where(
          inArray(
            contractLine.revisionId,
            revisions.map((revision) => revision.id),
          ),
        )
    : [];
  const pricesBy = groupBy(prices, (row) => row.revisionId);
  const terms = revisions.map((revision) => ({
    contractId: revision.contractId,
    terms: {
      id: revision.id,
      number: revision.number,
      status: revision.status,
      effectiveFrom: revision.effectiveFrom,
      code: revision.code,
      minRentalDays: revision.minRentalDays,
      paymentTermsDays: revision.paymentTermsDays,
      vatBasisPoints: basisPointsOf(revision.vatRate, revision.vatEnabled),
      prices: new Map(
        (pricesBy.get(revision.id) ?? []).map((row) => [row.itemId, row.price]),
      ),
    } satisfies BillingTerms,
  }));
  return new Map(
    [...groupBy(terms, (row) => row.contractId)].map(([id, rows]) => [
      id,
      rows.map((row) => row.terms),
    ]),
  );
}

async function freightOf(
  tx: Reader,
  ids: readonly string[],
): Promise<Map<string, FreightInput[]>> {
  const notes = await tx
    .select({
      contractId: deliveryNote.contractId,
      id: deliveryNote.id,
      code: deliveryNote.code,
      batchNo: deliveryNote.batchNo,
      vehiclePlate: deliveryNote.vehiclePlate,
      businessDate: deliveryNote.businessDate,
      freightAmount: deliveryNote.freightAmount,
    })
    .from(deliveryNote)
    .where(
      and(
        inArray(deliveryNote.contractId, [...ids]),
        eq(deliveryNote.status, "POSTED"),
        eq(deliveryNote.companyTruck, true),
        isNotNull(deliveryNote.freightAmount),
      ),
    )
    .orderBy(asc(deliveryNote.businessDate), asc(deliveryNote.batchNo));
  const entries = notes.map((note) => ({
    contractId: note.contractId,
    freight: {
      deliveryNoteId: note.id,
      code: note.code,
      batchNo: note.batchNo,
      vehiclePlate: note.vehiclePlate,
      date: (note.businessDate ?? "") as BusinessDate,
      amount: note.freightAmount ?? 0,
    } satisfies FreightInput,
  }));
  return new Map(
    [...groupBy(entries, (row) => row.contractId)].map(([id, rows]) => [
      id,
      rows.map((row) => row.freight),
    ]),
  );
}

async function adjustmentsOf(
  tx: Reader,
  ids: readonly string[],
): Promise<Map<string, AdjustmentRow[]>> {
  const rows = await tx
    .select({
      contractId: billingAdjustment.contractId,
      id: billingAdjustment.id,
      month: billingAdjustment.month,
      refMonth: billingAdjustment.refMonth,
      amount: billingAdjustment.amount,
      reason: billingAdjustment.reason,
      createdByName: user.name,
      createdAt: billingAdjustment.createdAt,
      updatedAt: billingAdjustment.updatedAt,
    })
    .from(billingAdjustment)
    .innerJoin(user, eq(user.id, billingAdjustment.createdBy))
    .where(inArray(billingAdjustment.contractId, [...ids]))
    .orderBy(asc(billingAdjustment.createdAt));
  return new Map(
    [...groupBy(rows, (row) => row.contractId)].map(([id, group]) => [
      id,
      group.map((row) => ({
        id: row.id,
        month: monthOf(row.month),
        refMonth: monthOf(row.refMonth),
        amount: row.amount,
        reason: row.reason,
        createdByName: row.createdByName,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    ]),
  );
}

async function closedOf(
  tx: Reader,
  ids: readonly string[],
): Promise<Map<string, Map<string, ClosedMonth>>> {
  const rows = await tx
    .select({
      contractId: billingPeriod.contractId,
      id: billingPeriod.id,
      month: billingPeriod.month,
      closedAt: billingPeriod.closedAt,
      closedByName: user.name,
    })
    .from(billingPeriod)
    .innerJoin(user, eq(user.id, billingPeriod.closedBy))
    .where(inArray(billingPeriod.contractId, [...ids]));
  return new Map(
    [...groupBy(rows, (row) => row.contractId)].map(([id, group]) => [
      id,
      new Map(
        group.map((row) => [
          monthOf(row.month),
          {
            id: row.id,
            month: monthOf(row.month),
            closedAt: row.closedAt,
            closedByName: row.closedByName,
          },
        ]),
      ),
    ]),
  );
}

/** BillingSource of every contract in `contractIds`, by contract id. */
export async function loadBillingSources(
  tx: Reader,
  contractIds: readonly string[],
): Promise<Map<string, BillingSource>> {
  const ids = [...new Set(contractIds)];
  if (ids.length === 0) return new Map();
  const [lines, terms, freight, adjustments, closed] = await Promise.all([
    siteLedgerLinesOf(tx, ids),
    termsOf(tx, ids),
    freightOf(tx, ids),
    adjustmentsOf(tx, ids),
    closedOf(tx, ids),
  ]);
  const pieces = await piecesOfBatch(tx, lines);
  const items = await itemFactsOf(
    tx,
    [...pieces.values()].flat().map((piece) => piece.itemId),
  );
  return new Map(
    ids.map((id) => {
      const own = {
        lines: lines.get(id) ?? [],
        freight: freight.get(id) ?? [],
        adjustments: adjustments.get(id) ?? [],
      };
      const ownPieces = pieces.get(id) ?? [];
      const starts = [
        ...own.lines.map((line) => line.businessDate as string),
        ...own.freight.map((entry) => entry.date as string),
        ...own.adjustments.map((entry) => `${entry.month}-01`),
      ].sort();
      const ownItems = new Set(ownPieces.map((piece) => piece.itemId));
      return [
        id,
        {
          contractId: id,
          pieces: ownPieces,
          terms: terms.get(id) ?? [],
          items: new Map([...items].filter(([itemId]) => ownItems.has(itemId))),
          freight: own.freight,
          adjustments: own.adjustments,
          closed: closed.get(id) ?? new Map(),
          firstMonth: starts[0] ? monthOf(starts[0]) : null,
        } satisfies BillingSource,
      ];
    }),
  );
}

// The inputs of a contract's rent (rental-billing design D1, D3): its
// ledger lines at the site turned into lot events, the origins of goods
// transferred in from a contract of the same customer (read from the
// source contract up to the transfer), its approved revisions as billing
// terms, item names and the freight of its delivery notes.
import { inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import { contractLine, item } from "@/db/schema";
import {
  basisPointsOf,
  type BillingTerms,
  type FreightInput,
  type ItemFacts,
} from "@/domain/rental-billing";
import {
  buildPieces,
  transferOrigins,
  type EndKind,
  type Piece,
  type RentalEvent,
} from "@/domain/rental-lots";
import { readRevisions } from "@/lib/contracts/records";
import { deliveredAmounts } from "@/lib/deliveries/amounts";
import {
  siteLedgerLines,
  type SiteLedgerLine,
} from "@/lib/deliveries/site-ledger";

type Reader = Pick<Database, "select">;

const IN_MOVEMENTS = new Set(["DELIVERY_IN", "TRANSFER_IN"]);
const OUT_KINDS: Readonly<Record<string, EndKind>> = {
  RETURN_OUT: "RETURN",
  LOSS_OUT: "LOSS",
  TRANSFER_OUT: "TRANSFER",
  SALE_OUT: "BUY_BACK",
};

interface GroupedLine extends SiteLedgerLine {
  /** The last ledger line of the group. */
  lastLedgerId: number;
}

/** One event per (document, item, movement): conditions are added up. */
function groupLines(lines: readonly SiteLedgerLine[]): GroupedLine[] {
  const groups = new Map<string, GroupedLine>();
  for (const line of lines) {
    const key = `${line.documentType}|${line.documentId}|${line.itemId}|${line.movement}`;
    const seen = groups.get(key);
    groups.set(
      key,
      seen
        ? {
            ...seen,
            milli: seen.milli + line.milli,
            ledgerId: Math.min(seen.ledgerId, line.ledgerId),
            lastLedgerId: Math.max(seen.lastLedgerId, line.ledgerId),
          }
        : { ...line, lastLedgerId: line.ledgerId },
    );
  }
  return [...groups.values()];
}

/**
 * Pieces of a contract, with the ledger lines up to `cutoff` (ledger id)
 * only. The memo is per call tree: a chain A → B → A stops because every
 * step reads an earlier cutoff.
 */
async function piecesUpTo(
  tx: Reader,
  contractId: string,
  cutoff: number,
  memo: Map<string, Promise<Piece[]>>,
): Promise<Piece[]> {
  const key = `${contractId}|${cutoff}`;
  const known = memo.get(key);
  if (known) return known;
  const work = (async () => {
    const lines = (await siteLedgerLines(tx, contractId)).filter(
      (line) => line.ledgerId <= cutoff,
    );
    return buildPieces(await eventsOf(tx, lines, memo));
  })();
  memo.set(key, work);
  return work;
}

async function eventsOf(
  tx: Reader,
  lines: readonly SiteLedgerLine[],
  memo: Map<string, Promise<Piece[]>>,
): Promise<RentalEvent[]> {
  const events: RentalEvent[] = [];
  for (const line of groupLines(lines)) {
    if (line.milli === 0) continue;
    const doc = {
      type: line.documentType,
      id: line.documentId,
      code: line.documentCode,
      batchNo: line.batchNo,
    };
    const common = {
      itemId: line.itemId,
      milli: Math.abs(line.milli),
      date: line.businessDate,
      order: line.ledgerId,
      doc,
    };
    if (IN_MOVEMENTS.has(line.movement)) {
      const sameCustomer =
        line.movement === "TRANSFER_IN" && line.sameCustomer === true;
      const origins =
        sameCustomer && line.fromContractId
          ? transferOrigins(
              await piecesUpTo(
                tx,
                line.fromContractId,
                sourceCutoff(line),
                memo,
              ),
              line.documentId,
              line.itemId,
            )
          : undefined;
      events.push({ ...common, direction: "IN", sameCustomer, origins });
      continue;
    }
    const endKind = OUT_KINDS[line.movement];
    if (!endKind) continue;
    events.push({
      ...common,
      direction: "OUT",
      endKind,
      sameCustomer: line.sameCustomer === true,
    });
  }
  return events;
}

/**
 * postSiteTransfer writes each transfer out just before its paired
 * transfer in, condition by condition: the source up to the last "in" line
 * of the item holds every "out" line of it.
 */
const sourceCutoff = (line: GroupedLine) => line.lastLedgerId;

/** Pieces of a contract from its whole ledger history. */
export async function contractPieces(
  tx: Reader,
  contractId: string,
): Promise<{ pieces: Piece[]; lines: SiteLedgerLine[] }> {
  const lines = await siteLedgerLines(tx, contractId);
  const memo = new Map<string, Promise<Piece[]>>();
  const pieces = buildPieces(await eventsOf(tx, lines, memo));
  return { pieces, lines };
}

/** Approved revisions as billing terms, with daily prices by item. */
export async function billingTerms(
  tx: Reader,
  contractId: string,
): Promise<BillingTerms[]> {
  const revisions = (await readRevisions(tx, contractId)).filter(
    (revision) => revision.status === "APPROVED",
  );
  if (revisions.length === 0) return [];
  const prices = await tx
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
    );
  return revisions.map((revision) => ({
    number: revision.number,
    status: revision.status,
    effectiveFrom: revision.effectiveFrom,
    code: revision.code,
    minRentalDays: revision.minRentalDays,
    paymentTermsDays: revision.paymentTermsDays,
    vatBasisPoints: basisPointsOf(revision.vatRate, revision.vatEnabled),
    prices: new Map(
      prices
        .filter((row) => row.revisionId === revision.id)
        .map((row) => [row.itemId, row.price]),
    ),
  }));
}

/** Code and name of the items on the statement. */
export async function itemFactsOf(
  tx: Reader,
  ids: readonly string[],
): Promise<Map<string, ItemFacts>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await tx
    .select({ id: item.id, code: item.code, name: item.name })
    .from(item)
    .where(inArray(item.id, unique));
  return new Map(
    rows.map((row) => [row.id, { code: row.code, name: row.name }]),
  );
}

/** Freight of the posted delivery notes when the company sent the truck. */
export async function contractFreight(
  tx: Reader,
  contractId: string,
): Promise<FreightInput[]> {
  return (await deliveredAmounts(tx, contractId))
    .filter((note) => note.freight !== null)
    .map((note) => ({
      deliveryNoteId: note.id,
      code: note.code,
      batchNo: note.batchNo,
      vehiclePlate: note.vehiclePlate,
      date: note.businessDate,
      amount: note.freight ?? 0,
    }));
}

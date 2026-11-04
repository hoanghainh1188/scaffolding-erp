// Reading and locking on-site exchanges (site-operations design D6): the
// link of a delivery note, the waiting links of a contract, and joining a
// return note to one. Callers lock the contract first.
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  deliveryExchange,
  deliveryExchangeLine,
  deliveryNote,
  returnNote,
} from "@/db/schema";
import {
  assertJoinable,
  EXCHANGE_MESSAGES,
  type ExchangeStatus,
} from "@/domain/exchange";
import { DomainValueError } from "@/domain/errors";
import type { Tx } from "@/lib/contracts/common";
import { isUuid, milliOf } from "@/lib/deliveries/records";

export type ExchangeRow = typeof deliveryExchange.$inferSelect;

/** The exchange of a delivery note FOR UPDATE, if it has one. */
export async function lockExchangeOfDelivery(
  tx: Tx,
  deliveryNoteId: string,
): Promise<ExchangeRow | null> {
  const [row] = await tx
    .select()
    .from(deliveryExchange)
    .where(eq(deliveryExchange.deliveryNoteId, deliveryNoteId))
    .for("update");
  return row ?? null;
}

/**
 * Cancelling the batch of a waiting exchange drops the exchange in the same
 * transaction (spec site-exchanges); called by changeDeliveryStatus.
 */
export async function cancelExchangeOfDelivery(
  tx: Tx,
  deliveryNoteId: string,
  reason: string,
  now: Date,
): Promise<void> {
  const row = await lockExchangeOfDelivery(tx, deliveryNoteId);
  if (row?.status !== "WAITING") return;
  await tx
    .update(deliveryExchange)
    .set({ status: "CANCELLED", cancelledReason: reason, updatedAt: now })
    .where(eq(deliveryExchange.id, row.id));
}

/**
 * M4 joins a return note to a waiting exchange (design D6), after the
 * return locked the contract: the exchange FOR UPDATE, same contract, still
 * waiting. Returns the row to mark done once the note exists.
 */
export async function lockJoinableExchange(
  tx: Tx,
  exchangeId: string,
  contractId: string,
): Promise<ExchangeRow> {
  if (!isUuid(exchangeId)) {
    throw new DomainValueError(EXCHANGE_MESSAGES.otherContract);
  }
  const [row] = await tx
    .select()
    .from(deliveryExchange)
    .where(eq(deliveryExchange.id, exchangeId))
    .for("update");
  if (!row) throw new DomainValueError(EXCHANGE_MESSAGES.otherContract);
  const [taken] = row.returnNoteId
    ? await tx
        .select({ code: returnNote.code })
        .from(returnNote)
        .where(eq(returnNote.id, row.returnNoteId))
    : [];
  assertJoinable(
    { contractId: row.contractId, status: row.status as ExchangeStatus },
    contractId,
    taken?.code ?? null,
  );
  return row;
}

export async function finishExchange(
  tx: Tx,
  exchangeId: string,
  returnNoteId: string,
  now: Date,
): Promise<void> {
  await tx
    .update(deliveryExchange)
    .set({ status: "DONE", returnNoteId, updatedAt: now })
    .where(eq(deliveryExchange.id, exchangeId));
}

export interface WaitingExchange {
  id: string;
  deliveryNoteId: string;
  deliveryCode: string;
  deliveryStatus: string;
  /** Expected back, in thousandths of the item's unit. */
  expected: { itemId: string; milli: number }[];
}

/** Waiting exchanges of a contract, oldest first (M4, D6). */
export async function waitingExchanges(
  db: Pick<Database, "select">,
  contractId: string,
): Promise<WaitingExchange[]> {
  const rows = await db
    .select({
      id: deliveryExchange.id,
      deliveryNoteId: deliveryNote.id,
      deliveryCode: deliveryNote.code,
      deliveryStatus: deliveryNote.status,
    })
    .from(deliveryExchange)
    .innerJoin(
      deliveryNote,
      eq(deliveryNote.id, deliveryExchange.deliveryNoteId),
    )
    .where(
      and(
        eq(deliveryExchange.contractId, contractId),
        eq(deliveryExchange.status, "WAITING"),
      ),
    )
    .orderBy(asc(deliveryExchange.createdAt));
  if (rows.length === 0) return [];
  const lines = await db
    .select({
      exchangeId: deliveryExchangeLine.exchangeId,
      itemId: deliveryExchangeLine.itemId,
      quantity: deliveryExchangeLine.expectedQuantity,
    })
    .from(deliveryExchangeLine)
    .where(
      inArray(
        deliveryExchangeLine.exchangeId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(deliveryExchangeLine.lineNo));
  return rows.map((row) => ({
    ...row,
    expected: lines
      .filter((line) => line.exchangeId === row.id)
      .map((line) => ({ itemId: line.itemId, milli: milliOf(line.quantity) })),
  }));
}

export interface ExchangeLink {
  id: string;
  status: ExchangeStatus;
  deliveryNoteId: string;
  deliveryCode: string;
  returnNoteId: string | null;
  returnCode: string | null;
  /** "100 CHEO1,7" expected back, for "Chờ thu hồi …" on D6. */
  expected: { itemId: string; milli: number }[];
}

/** Every exchange of a contract, for the labels of the D6 timeline. */
export async function contractExchanges(
  db: Pick<Database, "select">,
  contractId: string,
): Promise<ExchangeLink[]> {
  const rows = await db
    .select({
      id: deliveryExchange.id,
      status: deliveryExchange.status,
      deliveryNoteId: deliveryExchange.deliveryNoteId,
      deliveryCode: deliveryNote.code,
      returnNoteId: deliveryExchange.returnNoteId,
      returnCode: returnNote.code,
    })
    .from(deliveryExchange)
    .innerJoin(
      deliveryNote,
      eq(deliveryNote.id, deliveryExchange.deliveryNoteId),
    )
    .leftJoin(returnNote, eq(returnNote.id, deliveryExchange.returnNoteId))
    .where(eq(deliveryExchange.contractId, contractId));
  if (rows.length === 0) return [];
  const lines = await db
    .select({
      exchangeId: deliveryExchangeLine.exchangeId,
      itemId: deliveryExchangeLine.itemId,
      quantity: deliveryExchangeLine.expectedQuantity,
    })
    .from(deliveryExchangeLine)
    .where(
      inArray(
        deliveryExchangeLine.exchangeId,
        rows.map((row) => row.id),
      ),
    );
  return rows.map((row) => ({
    ...row,
    status: row.status as ExchangeStatus,
    returnCode: row.returnCode ?? null,
    expected: lines
      .filter((line) => line.exchangeId === row.id)
      .map((line) => ({ itemId: line.itemId, milli: milliOf(line.quantity) })),
  }));
}

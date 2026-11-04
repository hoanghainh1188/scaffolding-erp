// Lots of rented goods (rental-billing design D1, D3; 0.2 #70, #76, #77).
// Every "in" line of an item (delivery, transfer in) is a lot; every "out"
// line (return, loss, buy-back, transfer out) draws on the earliest lot
// first, whatever the condition. The result is a list of pieces: a quantity
// with its delivery date, its first delivery date for the minimum (kept
// across a same-customer transfer) and, once gone, how and when it left.
import type { BusinessDate } from "./business-date";

export type EndKind = "RETURN" | "LOSS" | "BUY_BACK" | "TRANSFER";

export interface DocRef {
  /** Ledger document type: DELIVERY_NOTE, RETURN_NOTE, SITE_TRANSFER, BUY_BACK. */
  type: string;
  id: string;
  code: string;
  /** Delivery batch ("Đợt 3"), when the document has one. */
  batchNo?: number | null;
}

/** Where a transferred quantity first came from (0.2 #70). */
export interface Origin {
  milli: number;
  originDate: BusinessDate;
}

export interface RentalEvent {
  itemId: string;
  direction: "IN" | "OUT";
  /** Positive, thousandths of the unit. */
  milli: number;
  date: BusinessDate;
  /** Ledger line id: the order of lines on one day. */
  order: number;
  doc: DocRef;
  /** OUT only. */
  endKind?: EndKind;
  /** TRANSFER only: both contracts belong to one customer. */
  sameCustomer?: boolean;
  /** Same-customer TRANSFER IN: the first delivery dates it carries. */
  origins?: readonly Origin[];
}

export interface PieceEnd {
  date: BusinessDate;
  kind: EndKind;
  doc: DocRef;
  /** False for a loss, a same-customer transfer, a same-day return. */
  minimumApplies: boolean;
}

export interface Piece {
  itemId: string;
  milli: number;
  /** Delivered to this contract: rent starts the day after. */
  startDate: BusinessDate;
  /** First delivery of the chain, for the minimum days. */
  originDate: BusinessDate;
  inDoc: DocRef;
  end: PieceEnd | null;
}

export const LOT_MESSAGES = {
  overdrawn: (code: string) =>
    `Sổ kho ghi hàng rời công trình nhiều hơn số đã giao (${code}). Bạn báo bộ phận kỹ thuật kiểm tra.`,
} as const;

interface Lot {
  itemId: string;
  startDate: BusinessDate;
  originDate: BusinessDate;
  inDoc: DocRef;
  order: number;
  remaining: number;
}

const byEvent = (a: RentalEvent, b: RentalEvent) =>
  a.date.localeCompare(b.date) || a.order - b.order;

/** FIFO key (0.2 #77): delivery date, then document code, then origin. */
const byLot = (a: Lot, b: Lot) =>
  a.startDate.localeCompare(b.startDate) ||
  a.inDoc.code.localeCompare(b.inDoc.code) ||
  a.order - b.order ||
  a.originDate.localeCompare(b.originDate);

function lotsOf(event: RentalEvent): Lot[] {
  const origins =
    event.sameCustomer && event.origins?.length
      ? event.origins
      : [{ milli: event.milli, originDate: event.date }];
  return origins
    .filter((origin) => origin.milli > 0)
    .map((origin) => ({
      itemId: event.itemId,
      startDate: event.date,
      originDate: origin.originDate,
      inDoc: event.doc,
      order: event.order,
      remaining: origin.milli,
    }));
}

function minimumApplies(event: RentalEvent, lot: Lot): boolean {
  if (event.endKind === "LOSS") return false;
  if (event.endKind === "TRANSFER" && event.sameCustomer) return false;
  return event.date !== lot.originDate;
}

/** Pieces of one contract from its "in" and "out" ledger lines. */
export function buildPieces(events: readonly RentalEvent[]): Piece[] {
  const open: Lot[] = [];
  const pieces: Piece[] = [];
  for (const event of [...events].sort(byEvent)) {
    if (event.direction === "IN") {
      open.push(...lotsOf(event));
      continue;
    }
    let need = event.milli;
    const lots = open
      .filter((lot) => lot.itemId === event.itemId && lot.remaining > 0)
      .sort(byLot);
    for (const lot of lots) {
      if (need === 0) break;
      const take = Math.min(need, lot.remaining);
      lot.remaining -= take;
      need -= take;
      pieces.push({
        itemId: lot.itemId,
        milli: take,
        startDate: lot.startDate,
        originDate: lot.originDate,
        inDoc: lot.inDoc,
        end: {
          date: event.date,
          kind: event.endKind ?? "RETURN",
          doc: event.doc,
          minimumApplies: minimumApplies(event, lot),
        },
      });
    }
    if (need > 0) throw new Error(LOT_MESSAGES.overdrawn(event.doc.code));
  }
  for (const lot of open.filter((entry) => entry.remaining > 0)) {
    pieces.push({
      itemId: lot.itemId,
      milli: lot.remaining,
      startDate: lot.startDate,
      originDate: lot.originDate,
      inDoc: lot.inDoc,
      end: null,
    });
  }
  return pieces;
}

/**
 * What a transfer out took from the source contract, as origins for the
 * target (0.2 #70): the first delivery date of every piece it ended.
 */
export function transferOrigins(
  pieces: readonly Piece[],
  transferId: string,
  itemId: string,
): Origin[] {
  return pieces
    .filter(
      (piece) =>
        piece.itemId === itemId &&
        piece.end?.kind === "TRANSFER" &&
        piece.end.doc.id === transferId,
    )
    .map((piece) => ({ milli: piece.milli, originDate: piece.originDate }));
}

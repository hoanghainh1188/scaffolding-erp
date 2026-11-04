// Rent of one rental contract for one month (rental-billing design D1, D2,
// D5, D7, D8; 0.2 #4, #16, #18, #22, #73–#80). Pure: the caller reads the
// pieces (rental-lots.ts), the approved revisions, the holidays, the
// freight and the adjustments; this builds the statement D7, the printout,
// the Excel file and the closing all show.
import { roundHalfUp } from "./average-cost";
import {
  addDays,
  daysBetween,
  isBusinessDate,
  monthRange,
  type BusinessDate,
} from "./business-date";
import { revisionAt } from "./contract-revision";
import { DomainValueError } from "./errors";
import { toMoney, type Money } from "./money";
import { DEFAULT_MIN_RENTAL_DAYS, rentAmount } from "./rental";
import { holidayDaysIn, type HolidayRange } from "./rental-holiday";
import type { DocRef, EndKind, Piece } from "./rental-lots";

export interface BillingPeriod {
  /** "2027-02" */
  month: string;
  from: BusinessDate;
  to: BusinessDate;
}

export const BILLING_MESSAGES = {
  badMonth: "Kỳ phải có dạng tháng/năm, ví dụ 02/2027.",
} as const;

/** "2027-02" → 01/02/2027 – 28/02/2027. */
export function periodOf(month: string): BillingPeriod {
  const first = `${month}-01`;
  if (!/^\d{4}-\d{2}$/.test(month) || !isBusinessDate(first)) {
    throw new DomainValueError(BILLING_MESSAGES.badMonth);
  }
  const { from, to } = monthRange(first);
  return { month, from, to };
}

/** The month a business date falls in: "2027-02". */
export const monthOf = (date: string): string => date.slice(0, 7);

/** The month after "2027-12": "2028-01". */
export function nextMonth(month: string): string {
  return monthOf(addDays(periodOf(month).to, 1));
}

/** "02/2027" for screens and messages. */
export const formatMonth = (month: string): string =>
  `${month.slice(5, 7)}/${month.slice(0, 4)}`;

/** One approved revision as billing reads it. */
export interface BillingTerms {
  /** contract_revision.id; absent in pure tests. */
  id?: string;
  number: number;
  status: string;
  effectiveFrom: string;
  /** Contract code, or code + "/01". */
  code: string;
  minRentalDays: number | null;
  paymentTermsDays: number;
  /** VAT rate in hundredths of a percent (8 % = 800); null without VAT. */
  vatBasisPoints: number | null;
  /** Daily price by item id; absent or null when the revision has none. */
  prices: ReadonlyMap<string, number | null>;
}

/** "8.00" (numeric of the database) → 800. */
export function basisPointsOf(
  rate: string | null,
  enabled: boolean,
): number | null {
  if (!enabled || rate === null) return null;
  return Math.round(Number(rate) * 100);
}

/** 800 → "8.00" for the numeric columns. */
export const rateText = (basisPoints: number | null): string | null =>
  basisPoints === null ? null : (basisPoints / 100).toFixed(2);

/** The approved revision in force on a date. */
export function termsOn(
  terms: readonly BillingTerms[],
  date: string,
): BillingTerms {
  const found = revisionAt(terms, date);
  if (!found) throw new Error(`No approved revision on ${date}`);
  return found;
}

export interface ItemFacts {
  code: string;
  name: string;
}

export interface StatementLine {
  kind: "RENT" | "MINIMUM" | "ADJUSTMENT";
  itemId: string | null;
  itemCode: string | null;
  itemName: string | null;
  quantityMilli: number;
  fromDate: BusinessDate | null;
  toDate: BusinessDate | null;
  calendarDays: number | null;
  holidayDays: number | null;
  chargedDays: number | null;
  dailyPrice: number | null;
  amount: Money;
  vatBasisPoints: number | null;
  revisionCode: string | null;
  /** A later price segment of the same piece ("Đổi giá"). */
  priceChanged: boolean;
  /** The revision has no price for the item: billed at 0 ₫, blocks closing. */
  missingPrice: boolean;
  inDoc: DocRef | null;
  inDate: BusinessDate | null;
  originDate: BusinessDate | null;
  out: { kind: EndKind; doc: DocRef; date: BusinessDate } | null;
  /** MINIMUM: the minimum and the days already charged. */
  minimumDays: number | null;
  rentedDays: number | null;
  adjustment: StatementAdjustment | null;
}

export interface StatementAdjustment {
  id: string;
  refMonth: string;
  amount: number;
  reason: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FreightInput {
  deliveryNoteId: string;
  code: string;
  batchNo: number | null;
  vehiclePlate: string | null;
  date: BusinessDate;
  amount: number;
}

export interface StatementFreight extends FreightInput {
  vatBasisPoints: number | null;
}

export interface VatGroup {
  basisPoints: number;
  base: Money;
  amount: Money;
}

export interface Statement {
  period: BillingPeriod;
  /** Last day counted: the period end, or today in a running period. */
  asOf: BusinessDate;
  running: boolean;
  lines: StatementLine[];
  freight: StatementFreight[];
  rentAmount: Money;
  adjustmentAmount: Money;
  freightAmount: Money;
  beforeVat: Money;
  vat: VatGroup[];
  vatAmount: Money;
  totalAmount: Money;
  revisionCode: string;
  paymentTermsDays: number;
  dueDate: BusinessDate;
  holidayDays: number;
  /** Lines without a price: the period cannot be closed. */
  missingPrices: string[];
}

export interface StatementInput {
  period: BillingPeriod;
  today: BusinessDate;
  pieces: readonly Piece[];
  terms: readonly BillingTerms[];
  holidays: readonly HolidayRange[];
  items: ReadonlyMap<string, ItemFacts>;
  freight: readonly FreightInput[];
  adjustments: readonly StatementAdjustment[];
}

const maxDate = (a: BusinessDate, b: BusinessDate) => (a > b ? a : b);
const minDate = (a: BusinessDate, b: BusinessDate) => (a < b ? a : b);

interface Segment {
  from: BusinessDate;
  to: BusinessDate;
  terms: BillingTerms;
  price: number | null;
}

/**
 * [from, to] cut where the price or the VAT of the item changes (0.2 #16,
 * #79). A revision that leaves both alone does not split the line.
 */
export function priceSegments(
  itemId: string,
  from: BusinessDate,
  to: BusinessDate,
  terms: readonly BillingTerms[],
): Segment[] {
  const cuts = [
    ...new Set(
      terms
        .filter((entry) => entry.status === "APPROVED")
        .map((entry) => entry.effectiveFrom as BusinessDate)
        .filter((date) => date > from && date <= to),
    ),
  ].sort();
  const segments: Segment[] = [];
  let start = from;
  for (const cut of [...cuts, addDays(to, 1)]) {
    const current = termsOn(terms, start);
    const price = current.prices.get(itemId) ?? null;
    const last = segments.at(-1);
    const end = addDays(cut, -1);
    if (
      last &&
      last.price === price &&
      last.terms.vatBasisPoints === current.vatBasisPoints
    ) {
      segments[segments.length - 1] = { ...last, to: end };
    } else {
      segments.push({ from: start, to: end, terms: current, price });
    }
    start = cut;
  }
  return segments;
}

/** Charged days of a piece from its first delivery to its end (0.2 #75). */
export function chargedDaysOf(
  piece: Piece,
  holidays: readonly HolidayRange[],
): number {
  if (!piece.end) return 0;
  const from = addDays(piece.originDate, 1);
  const calendar = Math.max(0, daysBetween(piece.originDate, piece.end.date));
  return calendar - holidayDaysIn(from, piece.end.date, holidays);
}

function baseLine(
  piece: Piece,
  items: ReadonlyMap<string, ItemFacts>,
): Omit<
  StatementLine,
  | "kind"
  | "fromDate"
  | "toDate"
  | "calendarDays"
  | "holidayDays"
  | "chargedDays"
  | "dailyPrice"
  | "amount"
  | "vatBasisPoints"
  | "revisionCode"
  | "priceChanged"
  | "missingPrice"
  | "minimumDays"
  | "rentedDays"
> {
  const facts = items.get(piece.itemId);
  return {
    itemId: piece.itemId,
    itemCode: facts?.code ?? null,
    itemName: facts?.name ?? null,
    quantityMilli: piece.milli,
    inDoc: piece.inDoc,
    inDate: piece.startDate,
    originDate: piece.originDate,
    out: piece.end
      ? { kind: piece.end.kind, doc: piece.end.doc, date: piece.end.date }
      : null,
    adjustment: null,
  };
}

/** Rent lines of one piece inside the period (0.2 #4). */
export function rentLines(
  piece: Piece,
  period: BillingPeriod,
  asOf: BusinessDate,
  terms: readonly BillingTerms[],
  holidays: readonly HolidayRange[],
  items: ReadonlyMap<string, ItemFacts>,
): StatementLine[] {
  const from = maxDate(period.from, addDays(piece.startDate, 1));
  const to = minDate(asOf, piece.end ? piece.end.date : period.to);
  if (from > to) return [];
  return priceSegments(piece.itemId, from, to, terms).map((segment, index) => {
    const calendarDays = daysBetween(segment.from, segment.to) + 1;
    const holidayDays = holidayDaysIn(segment.from, segment.to, holidays);
    const chargedDays = calendarDays - holidayDays;
    const price = segment.price ?? 0;
    return {
      ...baseLine(piece, items),
      kind: "RENT",
      fromDate: segment.from,
      toDate: segment.to,
      calendarDays,
      holidayDays,
      chargedDays,
      dailyPrice: price,
      amount: rentAmount({
        dailyPrice: price,
        quantityMilli: piece.milli,
        days: chargedDays,
      }),
      vatBasisPoints: segment.terms.vatBasisPoints,
      revisionCode: segment.terms.code,
      priceChanged: index > 0,
      missingPrice: segment.price === null,
      minimumDays: null,
      rentedDays: null,
    };
  });
}

/** The top-up to the minimum days, in the period of the end (0.2 #74–#76). */
export function minimumLine(
  piece: Piece,
  period: BillingPeriod,
  asOf: BusinessDate,
  terms: readonly BillingTerms[],
  holidays: readonly HolidayRange[],
  items: ReadonlyMap<string, ItemFacts>,
): StatementLine | null {
  const end = piece.end;
  if (!end?.minimumApplies) return null;
  if (end.date < period.from || end.date > minDate(period.to, asOf)) {
    return null;
  }
  const atEnd = termsOn(terms, end.date);
  const minimumDays = atEnd.minRentalDays ?? DEFAULT_MIN_RENTAL_DAYS;
  const rentedDays = chargedDaysOf(piece, holidays);
  const days = minimumDays - rentedDays;
  if (days <= 0 || piece.milli === 0) return null;
  const price = atEnd.prices.get(piece.itemId) ?? null;
  return {
    ...baseLine(piece, items),
    kind: "MINIMUM",
    fromDate: null,
    toDate: null,
    calendarDays: null,
    holidayDays: null,
    chargedDays: days,
    dailyPrice: price ?? 0,
    amount: rentAmount({
      dailyPrice: price ?? 0,
      quantityMilli: piece.milli,
      days,
    }),
    vatBasisPoints: atEnd.vatBasisPoints,
    revisionCode: atEnd.code,
    priceChanged: false,
    missingPrice: price === null,
    minimumDays,
    rentedDays,
  };
}

const pieceKey = (line: StatementLine) =>
  [
    line.itemId,
    line.inDoc?.id,
    line.originDate,
    line.out?.doc.id ?? "",
    line.out?.kind ?? "",
    line.kind,
    line.fromDate,
    line.toDate,
    line.dailyPrice,
    line.vatBasisPoints,
  ].join("|");

/** Pieces of one lot ending alike share a line (design D8). */
function merge(lines: readonly StatementLine[]): StatementLine[] {
  const merged = new Map<string, StatementLine>();
  for (const line of lines) {
    const key = pieceKey(line);
    const seen = merged.get(key);
    if (!seen) {
      merged.set(key, line);
      continue;
    }
    const quantityMilli = seen.quantityMilli + line.quantityMilli;
    merged.set(key, {
      ...seen,
      quantityMilli,
      amount: rentAmount({
        dailyPrice: seen.dailyPrice ?? 0,
        quantityMilli,
        days: seen.chargedDays ?? 0,
      }),
    });
  }
  return [...merged.values()];
}

/** Item code, delivery, gone before still there, then dates (design D8). */
function byStatementOrder(a: StatementLine, b: StatementLine): number {
  const kind = (line: StatementLine) => (line.kind === "ADJUSTMENT" ? 1 : 0);
  return (
    kind(a) - kind(b) ||
    (a.itemCode ?? "").localeCompare(b.itemCode ?? "") ||
    (a.inDate ?? "").localeCompare(b.inDate ?? "") ||
    (a.inDoc?.code ?? "").localeCompare(b.inDoc?.code ?? "") ||
    (a.out?.date ?? "9999").localeCompare(b.out?.date ?? "9999") ||
    (a.out?.doc.code ?? "").localeCompare(b.out?.doc.code ?? "") ||
    (a.kind === "MINIMUM" ? 1 : 0) - (b.kind === "MINIMUM" ? 1 : 0) ||
    (a.fromDate ?? "").localeCompare(b.fromDate ?? "") ||
    (a.adjustment?.createdAt.getTime() ?? 0) -
      (b.adjustment?.createdAt.getTime() ?? 0)
  );
}

function adjustmentLine(
  adjustment: StatementAdjustment,
  vatBasisPoints: number | null,
): StatementLine {
  return {
    kind: "ADJUSTMENT",
    itemId: null,
    itemCode: null,
    itemName: null,
    quantityMilli: 0,
    fromDate: null,
    toDate: null,
    calendarDays: null,
    holidayDays: null,
    chargedDays: null,
    dailyPrice: null,
    amount: toMoney(adjustment.amount),
    vatBasisPoints,
    revisionCode: null,
    priceChanged: false,
    missingPrice: false,
    inDoc: null,
    inDate: null,
    originDate: null,
    out: null,
    minimumDays: null,
    rentedDays: null,
    adjustment,
  };
}

/** VAT per rate (0.2 #79): rounded half up on the total of each rate. */
export function vatGroups(
  entries: readonly { amount: number; vatBasisPoints: number | null }[],
): VatGroup[] {
  const bases = new Map<number, number>();
  for (const entry of entries) {
    if (entry.vatBasisPoints === null) continue;
    bases.set(
      entry.vatBasisPoints,
      (bases.get(entry.vatBasisPoints) ?? 0) + entry.amount,
    );
  }
  return [...bases.entries()]
    .sort(([a], [b]) => a - b)
    .map(([basisPoints, base]) => ({
      basisPoints,
      base: toMoney(base),
      amount: toMoney(
        Number(roundHalfUp(BigInt(base) * BigInt(basisPoints), 10_000n)),
      ),
    }));
}

const sum = (values: readonly number[]) =>
  toMoney(values.reduce((total, value) => total + value, 0));

/** The statement of one contract for one period. */
export function buildStatement(input: StatementInput): Statement {
  const { period, today, terms, holidays, items } = input;
  const running = today <= period.to;
  const asOf = running ? today : period.to;
  const rent = input.pieces.flatMap((piece) => {
    const lines = rentLines(piece, period, asOf, terms, holidays, items);
    const minimum = minimumLine(piece, period, asOf, terms, holidays, items);
    return minimum ? [...lines, minimum] : lines;
  });
  const atEnd = termsOn(terms, period.to);
  const adjustments = input.adjustments.map((entry) =>
    adjustmentLine(entry, atEnd.vatBasisPoints),
  );
  const lines = [...merge(rent), ...adjustments].sort(byStatementOrder);
  const freight = input.freight
    .filter((entry) => entry.date >= period.from && entry.date <= asOf)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code),
    )
    .map((entry) => ({
      ...entry,
      vatBasisPoints: termsOn(terms, entry.date).vatBasisPoints,
    }));
  const rentAmountTotal = sum(
    lines.filter((line) => line.kind !== "ADJUSTMENT").map((l) => l.amount),
  );
  const adjustmentAmount = sum(adjustments.map((line) => line.amount));
  const freightAmount = sum(freight.map((entry) => entry.amount));
  const vat = vatGroups([...lines, ...freight]);
  const vatAmount = sum(vat.map((group) => group.amount));
  const beforeVat = toMoney(rentAmountTotal + adjustmentAmount + freightAmount);
  return {
    period,
    asOf,
    running,
    lines,
    freight,
    rentAmount: rentAmountTotal,
    adjustmentAmount,
    freightAmount,
    beforeVat,
    vat,
    vatAmount,
    totalAmount: toMoney(beforeVat + vatAmount),
    revisionCode: atEnd.code,
    paymentTermsDays: atEnd.paymentTermsDays,
    dueDate: addDays(period.to, atEnd.paymentTermsDays),
    holidayDays: holidayDaysIn(period.from, period.to, holidays),
    missingPrices: [
      ...new Set(
        lines
          .filter((line) => line.missingPrice)
          .map((line) => line.itemCode ?? ""),
      ),
    ],
  };
}

/** A period has something to bill (closing and the D7 list need it). */
export const hasContent = (statement: Statement): boolean =>
  statement.lines.length > 0 || statement.freight.length > 0;

/** "Loại dòng" of D7 and the Excel sheet (design D8, D9). */
export function lineLabel(line: StatementLine): string {
  if (line.kind === "ADJUSTMENT") return "Điều chỉnh";
  if (line.kind === "MINIMUM") return "Bù tối thiểu";
  if (line.out?.kind === "LOSS") return "Mất";
  if (line.out?.kind === "BUY_BACK") return "Mua lại";
  if (line.out?.kind === "TRANSFER") return "Chuyển đi";
  if (line.priceChanged) return "Đổi giá";
  return "Thuê";
}

/** "8 %" for a VAT rate in hundredths of a percent. */
export const vatText = (basisPoints: number): string =>
  `${(basisPoints / 100).toLocaleString("vi-VN")} %`;

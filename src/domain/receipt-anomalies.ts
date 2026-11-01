// Ask again before posting (goods-receipt design D5b, requirements 0.2 #30):
// the ledger is append-only and a value booked wrong cannot be corrected
// yet (#42), so a stray zero on the phone must be confirmed first. The same
// pure check runs on the phone and again on the server.
import { dict } from "@/locales";

import {
  needsWeighing,
  receivedInLineUnit,
  type ReceiptLineInput,
  type ReceivingLine,
} from "./goods-receipt";
import { formatMoney, type Money } from "./money";
import { formatQuantity, toQuantity } from "./quantity";

/** More than 10 % over on a kg line; exactly 10 % passes (scale drift). */
const KG_TOLERANCE_NUMERATOR = 11n;
const KG_TOLERANCE_DENOMINATOR = 10n;

export const COSTS_ANOMALY_KEY = "costs";

export interface AnomalyLine {
  readonly open: ReceivingLine;
  readonly line: ReceiptLineInput;
}

export interface AnomalyInput {
  /** In receipt order: the index names the field. */
  readonly lines: readonly AnomalyLine[];
  readonly tripCosts: Money;
  /** Expected costs of the whole order. */
  readonly expectedCosts: Money;
}

export interface Anomaly {
  /** Stable key the phone sends back in confirmedOverrides. */
  readonly key: string;
  readonly field: string;
  /** The question of the confirm dialog (spec wording). */
  readonly question: string;
  /** What goes into the order history once confirmed. */
  readonly note: string;
}

export function lineAnomalyKey(orderLineId: string): string {
  return `line:${orderLineId}`;
}

function isOver(open: ReceivingLine, received: number, left: number): boolean {
  if (received <= left) return false;
  if (open.lineUnit === "PIECE") return true;
  return (
    BigInt(received) * KG_TOLERANCE_DENOMINATOR >
    BigInt(left) * KG_TOLERANCE_NUMERATOR
  );
}

function lineAnomaly(
  { open, line }: AnomalyLine,
  index: number,
): Anomaly | null {
  if (line.status !== "COUNTED") return null;
  const received = receivedInLineUnit(open, line);
  const left = Math.max(open.orderedMilli - open.receivedMilli, 0);
  if (!isOver(open, received, left)) return null;
  const unit = open.lineUnit;
  const got = formatQuantity(toQuantity(received, unit));
  const rest = formatQuantity(toQuantity(left, unit));
  const field = needsWeighing(open)
    ? `lines.${index}.weighedKg`
    : `lines.${index}.quantity`;
  const unitLabel = unit === "PIECE" ? "cái" : "kg";
  return {
    key: lineAnomalyKey(open.orderLineId),
    field,
    question: dict.receiving.anomalies.quantityOver(got, rest, unitLabel),
    note: dict.receiving.anomalies.noteOver(open.itemCode, got, rest, unitLabel),
  };
}

/** Every point of the trip that needs a second yes, in screen order. */
export function receiptAnomalies(input: AnomalyInput): Anomaly[] {
  const found = input.lines
    .map(lineAnomaly)
    .filter((anomaly): anomaly is Anomaly => anomaly !== null);
  if (input.tripCosts > input.expectedCosts) {
    found.push({
      key: COSTS_ANOMALY_KEY,
      field: "costs",
      question: dict.receiving.anomalies.costsOver(
        formatMoney(input.tripCosts),
        formatMoney(input.expectedCosts),
      ),
      note: dict.receiving.anomalies.noteCostHigh(formatMoney(input.tripCosts)),
    });
  }
  return found;
}

/** The anomalies not confirmed yet; extra confirmations are ignored. */
export function unconfirmedAnomalies(
  anomalies: readonly Anomaly[],
  confirmed: readonly string[],
): Anomaly[] {
  const yes = new Set(confirmed);
  return anomalies.filter((anomaly) => !yes.has(anomaly.key));
}

/** RECEIPT_POSTED note: "PN-2026-094 · đã xác nhận nhận dư …; chi phí cao …". */
export function receiptPostedNote(
  receiptCode: string,
  confirmed: readonly Anomaly[],
): string {
  if (confirmed.length === 0) return receiptCode;
  return `${receiptCode} · đã xác nhận ${confirmed.map((anomaly) => anomaly.note).join("; ")}`;
}

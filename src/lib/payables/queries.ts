// The block of one seller on D14c (payables design D7, D8): terms, masked
// bank account, receipts in the fixed order, and payments with what each
// one paid. CCCD and bank account leave the server only masked.
import { orderPayables } from "@/domain/payables";
import type { BusinessDate } from "@/domain/business-date";
import { toMoney, type Money } from "@/domain/money";
import { formatBankRef, maskIdNumber } from "@/domain/partner-fields";

import {
  readLedger,
  readSupplierInfos,
  type PayableView,
  type PaymentRow,
  type SupplierLedger,
} from "./balances";
import type { Reader } from "./debts";

/** Payments shown before "Xem thêm". */
export const PAYMENT_PAGE_SIZE = 20;

export interface PaymentPart {
  receiptCode: string;
  amount: Money;
  /** Taken from the advance when a later receipt was posted. */
  fromAdvance: boolean;
  /** When the part was taken (the receipt day for an advance part). */
  at: Date;
}

export interface PaymentView extends PaymentRow {
  parts: PaymentPart[];
  /** Still kept as advance (0 when cancelled). */
  advanceLeft: Money;
}

export interface SupplierDetail {
  id: string;
  code: string;
  name: string;
  kind: "COMPANY" | "PERSON";
  paymentTermsDays: number;
  /** "•••• •••• 2345" or null. */
  idNumber: string | null;
  /** "Vietcombank ···5678" or null. */
  bankRef: string | null;
  orderCount: number;
  owed: Money;
  advance: Money;
  payables: PayableView[];
  payments: PaymentView[];
  hasMorePayments: boolean;
}

/** What each payment paid, from the live and the voided allocations. */
export function paymentViews(ledger: SupplierLedger): PaymentView[] {
  const codes = new Map(ledger.payables.map((row) => [row.key, row.code]));
  return ledger.payments.map((payment) => {
    const parts = ledger.allocations
      .filter((row) => row.paymentId === payment.id)
      .map((row) => ({
        receiptCode: codes.get(row.goodsReceiptId) ?? "",
        amount: row.amount,
        fromAdvance: row.mode === "ADVANCE",
        at: row.createdAt,
      }));
    const used = parts.reduce((sum, part) => sum + part.amount, 0);
    return {
      ...payment,
      parts,
      advanceLeft: toMoney(payment.cancelled ? 0 : payment.amount - used),
    };
  });
}

/** D14c block of one seller, or null when there is no such seller. */
export async function supplierDetail(
  db: Reader,
  supplierId: string,
  today: BusinessDate,
  options: { showPaid?: boolean; paymentLimit?: number } = {},
): Promise<SupplierDetail | null> {
  const infos = await readSupplierInfos(db);
  const info = infos.get(supplierId);
  if (!info) return null;
  const ledger = await readLedger(db, supplierId, today);
  const limit = options.paymentLimit ?? PAYMENT_PAGE_SIZE;
  const payments = paymentViews(ledger);
  return {
    id: info.id,
    code: info.code,
    name: info.name,
    kind: info.kind,
    paymentTermsDays: info.paymentTermsDays,
    idNumber: info.idNumberLast4 ? maskIdNumber(info.idNumberLast4) : null,
    bankRef: formatBankRef(info.bankName, info.bankAccountLast4),
    orderCount: new Set(ledger.payables.map((row) => row.orderId)).size,
    owed: ledger.owed,
    advance: ledger.advance,
    payables: orderPayables(ledger.payables).filter(
      (row) => options.showPaid || row.remaining > 0,
    ),
    payments: payments.slice(0, limit),
    hasMorePayments: payments.length > limit,
  };
}

// "Xuất Excel" of D14c (payables spec "Xuất Excel phải trả", design D8): the
// filter and search on screen, every page. Three sheets: one row per seller
// (CCCD and bank account masked, design D7), one row per receipt (paid
// ones too), one row per payment (cancelled ones too). Money is an integer
// cell, dates are Excel dates.
import type { Database } from "@/db/client";
import { EXPORT_MAX_ROWS } from "@/domain/activity";
import type { BusinessDate } from "@/domain/business-date";
import { formatBankRef, maskIdNumber } from "@/domain/partner-fields";
import { PAYMENT_KIND_LABELS } from "@/domain/payables";
import { PAYMENT_METHOD_LABELS } from "@/domain/receivables";
import { buildXlsxBook, type XlsxValue } from "@/lib/export/xlsx";
import { ExportTooLarge, type ExportedFile } from "@/lib/receivables/export";

import { supplierBalances, type PayableQuery } from "./balances";
import { paymentViews } from "./queries";

export { ExportTooLarge };

export const EXPORT_MESSAGES = {
  tooMany: "Danh sách quá dài để xuất. Bạn lọc hẹp lại rồi xuất.",
} as const;

const KIND_LABELS = { COMPANY: "Công ty", PERSON: "Cá nhân" } as const;

const date = (value: string | null): XlsxValue =>
  value ? { date: value } : null;

/** The workbook of D14c for the filter and search on screen. */
export async function exportPayables(
  db: Database,
  today: BusinessDate,
  query: Omit<PayableQuery, "page">,
): Promise<ExportedFile> {
  const page = await supplierBalances(db, today, query);
  const sellers: XlsxValue[][] = [];
  const receipts: XlsxValue[][] = [];
  const payments: XlsxValue[][] = [];
  for (const row of page.all) {
    const info = page.infos.get(row.id);
    sellers.push([
      row.code,
      row.name,
      KIND_LABELS[row.kind],
      info?.idNumberLast4 ? maskIdNumber(info.idNumberLast4) : null,
      info ? formatBankRef(info.bankName, info.bankAccountLast4) : null,
      row.paymentTermsDays,
      row.owed,
      row.overdue.amount,
      row.overdue.amount > 0 ? row.overdue.days : null,
      row.advance,
    ]);
    const ledger = page.ledgers.get(row.id);
    if (!ledger) continue;
    for (const payable of ledger.payables) {
      receipts.push([
        row.name,
        payable.code,
        payable.orderCode,
        payable.tripNo,
        date(payable.issuedDate),
        payable.total,
        payable.paid,
        payable.remaining,
        date(payable.dueDate),
        payable.status.kind === "OVERDUE" ? payable.status.days : null,
      ]);
    }
    for (const payment of paymentViews(ledger)) {
      payments.push([
        payment.code,
        date(payment.paidDate),
        row.name,
        PAYMENT_KIND_LABELS[payment.kind],
        PAYMENT_METHOD_LABELS[payment.method],
        payment.amount,
        payment.parts
          .map((part) => `${part.receiptCode} ${part.amount}`)
          .join("; ") || null,
        payment.advanceLeft,
        payment.cancelled ? "Đã hủy" : "Còn hiệu lực",
        payment.cancelled?.reason ?? null,
        payment.createdByName,
      ]);
    }
  }
  if (receipts.length > EXPORT_MAX_ROWS || payments.length > EXPORT_MAX_ROWS) {
    throw new ExportTooLarge(EXPORT_MESSAGES.tooMany);
  }
  const file = buildXlsxBook([
    {
      sheetName: "Theo người bán",
      columns: [
        { header: "Mã người bán", width: 12 },
        { header: "Người bán", width: 34 },
        { header: "Loại", width: 10 },
        { header: "CCCD", width: 16 },
        { header: "Tài khoản", width: 24 },
        { header: "Số ngày được nợ", width: 10 },
        { header: "Còn phải trả", width: 14 },
        { header: "Quá hạn", width: 14 },
        { header: "Số ngày quá hạn", width: 10 },
        { header: "Đã ứng trước", width: 14 },
      ],
      rows: sellers,
    },
    {
      sheetName: "Các khoản",
      columns: [
        { header: "Người bán", width: 30 },
        { header: "Phiếu nhập", width: 14 },
        { header: "Đơn mua", width: 14 },
        { header: "Chuyến", width: 8 },
        { header: "Ngày nhập", width: 12 },
        { header: "Tiền hàng", width: 14 },
        { header: "Đã trả", width: 14 },
        { header: "Còn lại", width: 14 },
        { header: "Hạn", width: 12 },
        { header: "Số ngày quá hạn", width: 10 },
      ],
      rows: receipts,
    },
    {
      sheetName: "Phiếu chi",
      columns: [
        { header: "Mã phiếu", width: 14 },
        { header: "Ngày chi", width: 12 },
        { header: "Người bán", width: 30 },
        { header: "Loại", width: 14 },
        { header: "Hình thức", width: 14 },
        { header: "Số tiền", width: 14 },
        { header: "Đã trừ vào", width: 50 },
        { header: "Còn giữ ứng trước", width: 14 },
        { header: "Trạng thái", width: 12 },
        { header: "Lý do hủy", width: 30 },
        { header: "Người ghi", width: 18 },
      ],
      rows: payments,
    },
  ]);
  return { filename: `cong-no-phai-tra-${today}.xlsx`, file };
}

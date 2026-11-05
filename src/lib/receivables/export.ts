// "Xuất Excel" of D14 (receivables spec "Xuất Excel công nợ", design D7):
// the filter and search on screen, every page. Three sheets: one row per
// customer, one row per debt (settled ones too) with the parts in their own
// columns, one row per receipt (cancelled ones too). Money is an integer
// cell, dates are Excel dates.
import type { Database } from "@/db/client";
import type { BusinessDate } from "@/domain/business-date";
import { EXPORT_MAX_ROWS } from "@/domain/activity";
import {
  DEBT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  RECEIPT_KIND_LABELS,
} from "@/domain/receivables";
import { buildXlsxBook, type XlsxValue } from "@/lib/export/xlsx";

import {
  customerBalances,
  type BalanceQuery,
  type CustomerBalance,
} from "./balances";
import { debtLabel, receiptsWithAllocations } from "./receipts";

export const EXPORT_MESSAGES = {
  tooMany: "Danh sách quá dài để xuất. Bạn lọc hẹp lại rồi xuất.",
} as const;

const date = (value: string | null): XlsxValue =>
  value ? { date: value } : null;

/** Like the D14 table: what is left, split by kind. */
function customerRow(row: CustomerBalance): XlsxValue[] {
  return [
    row.code,
    row.name,
    row.rentAndFreight,
    row.sale,
    row.compensationAndBuyBack,
    row.owed,
    row.overdue.amount,
    row.overdue.amount > 0 ? row.overdue.days : null,
    row.prepaid,
    row.status.label,
  ];
}

export interface ExportedFile {
  filename: string;
  file: Uint8Array;
}

export class ExportTooLarge extends Error {
  override readonly name = "ExportTooLarge";
}

/** The workbook of D14 for the filter and search on screen. */
export async function exportReceivables(
  db: Database,
  today: BusinessDate,
  query: Omit<BalanceQuery, "page">,
): Promise<ExportedFile> {
  const page = await customerBalances(db, today, query);
  const customers: XlsxValue[][] = [];
  const debts: XlsxValue[][] = [];
  const receipts: XlsxValue[][] = [];
  for (const row of page.all) {
    const ledger = page.ledgers.get(row.id);
    if (!ledger) continue;
    customers.push(customerRow(row));
    for (const debt of ledger.debts) {
      debts.push([
        row.name,
        debt.contractCode,
        debtLabel(debt),
        DEBT_KIND_LABELS[debt.kind],
        date(debt.issuedDate),
        debt.rent,
        debt.freight,
        debt.sale,
        debt.compensation,
        debt.buyBack,
        debt.vat,
        debt.total,
        debt.paid,
        debt.remaining,
        date(debt.dueDate),
        debt.status.kind === "OVERDUE" ? debt.status.days : null,
      ]);
    }
    for (const entry of receiptsWithAllocations(ledger)) {
      const r = entry.receipt;
      receipts.push([
        r.code,
        date(r.receivedDate),
        row.name,
        RECEIPT_KIND_LABELS[r.kind],
        r.contractCode,
        PAYMENT_METHOD_LABELS[r.method],
        r.amount,
        entry.settled.map((s) => `${s.label} ${s.amount}`).join("; ") || null,
        r.cancelled ? "Đã hủy" : "Còn hiệu lực",
        r.cancelled?.reason ?? null,
      ]);
    }
  }
  if (debts.length > EXPORT_MAX_ROWS || receipts.length > EXPORT_MAX_ROWS) {
    throw new ExportTooLarge(EXPORT_MESSAGES.tooMany);
  }
  const file = buildXlsxBook([
    {
      sheetName: "Theo nhà thầu",
      columns: [
        { header: "Mã nhà thầu", width: 12 },
        { header: "Nhà thầu", width: 34 },
        { header: "Thuê & cước", width: 14 },
        { header: "Bán", width: 14 },
        { header: "Đền bù, mua lại", width: 14 },
        { header: "Đang nợ", width: 14 },
        { header: "Quá hạn", width: 14 },
        { header: "Số ngày quá hạn", width: 10 },
        { header: "Trả trước", width: 14 },
        { header: "Tình hình", width: 18 },
      ],
      rows: customers,
    },
    {
      sheetName: "Các khoản",
      columns: [
        { header: "Nhà thầu", width: 30 },
        { header: "Hợp đồng", width: 26 },
        { header: "Chứng từ", width: 30 },
        { header: "Loại", width: 10 },
        { header: "Ngày phát sinh", width: 14 },
        { header: "Thuê", width: 14 },
        { header: "Cước", width: 12 },
        { header: "Bán", width: 14 },
        { header: "Đền bù", width: 12 },
        { header: "Mua lại", width: 12 },
        { header: "VAT", width: 12 },
        { header: "Phát sinh", width: 14 },
        { header: "Đã thu", width: 14 },
        { header: "Còn nợ", width: 14 },
        { header: "Hạn", width: 12 },
        { header: "Số ngày quá hạn", width: 10 },
      ],
      rows: debts,
    },
    {
      sheetName: "Phiếu thu",
      columns: [
        { header: "Mã phiếu", width: 14 },
        { header: "Ngày thu", width: 12 },
        { header: "Nhà thầu", width: 30 },
        { header: "Loại", width: 14 },
        { header: "Hợp đồng của cọc", width: 26 },
        { header: "Hình thức", width: 14 },
        { header: "Số tiền", width: 14 },
        { header: "Đã trừ vào", width: 50 },
        { header: "Trạng thái", width: 12 },
        { header: "Lý do hủy", width: 30 },
      ],
      rows: receipts,
    },
  ]);
  return { filename: `cong-no-${today}.xlsx`, file };
}

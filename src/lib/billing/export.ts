// "Xuất Excel" of D7 (rental-billing design D9): the whole month in one
// workbook — one row per contract, one row per statement line in the D7
// order, one row per freight. Money and quantities are numbers, dates are
// Excel dates, so the accountant can sum and filter without retyping.
import type { Database } from "@/db/client";
import type { BusinessDate } from "@/domain/business-date";
import { lineLabel, type StatementLine } from "@/domain/rental-billing";
import {
  buildXlsxBook,
  type XlsxSheet,
  type XlsxValue,
} from "@/lib/export/xlsx";

import {
  contractStatement,
  periodList,
  type ContractStatementView,
} from "./queries";

type Reader = Pick<Database, "select">;

const date = (value: string | null): XlsxValue =>
  value === null ? null : { date: value };

const rate = (basisPoints: number | null): XlsxValue =>
  basisPoints === null ? null : basisPoints / 100;

const clock = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function summaryRow(view: ContractStatementView): XlsxValue[] {
  const { contract, statement, closed } = view;
  return [
    contract.code,
    contract.customerName,
    contract.siteName,
    statement.rentAmount,
    statement.adjustmentAmount,
    statement.freightAmount,
    statement.vatAmount,
    statement.totalAmount,
    date(statement.dueDate),
    closed ? "Đã chốt" : statement.running ? "Tạm tính" : "Chưa chốt",
    closed?.byName ?? null,
    closed ? clock.format(closed.at) : null,
  ];
}

function detailRow(code: string, line: StatementLine): XlsxValue[] {
  return [
    code,
    line.itemCode,
    line.itemName,
    lineLabel(line),
    line.inDoc?.code ?? null,
    date(line.inDate),
    line.out?.doc.code ?? null,
    date(line.out?.date ?? null),
    line.kind === "ADJUSTMENT" ? null : line.quantityMilli / 1000,
    date(line.fromDate),
    date(line.toDate),
    line.calendarDays,
    line.holidayDays,
    line.chargedDays,
    line.dailyPrice,
    line.amount,
    rate(line.vatBasisPoints),
    line.adjustment
      ? `Kỳ ${line.adjustment.refMonth.slice(5)}/${line.adjustment.refMonth.slice(0, 4)}: ${line.adjustment.reason}`
      : line.kind === "MINIMUM"
        ? `Tối thiểu ${line.minimumDays} ngày, đã thuê ${line.rentedDays} ngày`
        : line.revisionCode,
  ];
}

const SUMMARY: XlsxSheet["columns"] = [
  { header: "Số hợp đồng", width: 26 },
  { header: "Nhà thầu", width: 32 },
  { header: "Công trình", width: 30 },
  { header: "Tiền thuê", width: 14 },
  { header: "Điều chỉnh", width: 13 },
  { header: "Cước", width: 13 },
  { header: "VAT", width: 12 },
  { header: "Phải thu", width: 15 },
  { header: "Hạn trả", width: 12 },
  { header: "Trạng thái", width: 12 },
  { header: "Người chốt", width: 18 },
  { header: "Giờ chốt", width: 18 },
];

const DETAIL: XlsxSheet["columns"] = [
  { header: "Số hợp đồng", width: 26 },
  { header: "Mã hàng", width: 12 },
  { header: "Tên hàng", width: 26 },
  { header: "Loại dòng", width: 13 },
  { header: "Chứng từ giao", width: 16 },
  { header: "Ngày giao", width: 12 },
  { header: "Chứng từ trả", width: 16 },
  { header: "Ngày trả", width: 12 },
  { header: "Số lượng", width: 10 },
  { header: "Từ", width: 12 },
  { header: "Đến", width: 12 },
  { header: "Ngày lịch", width: 10 },
  { header: "Trừ nghỉ", width: 10 },
  { header: "Ngày tính", width: 10 },
  { header: "Giá / ngày", width: 11 },
  { header: "Thành tiền", width: 14 },
  { header: "Thuế suất (%)", width: 12 },
  { header: "Ghi chú", width: 40 },
];

const FREIGHT: XlsxSheet["columns"] = [
  { header: "Số hợp đồng", width: 26 },
  { header: "Phiếu xuất", width: 16 },
  { header: "Đợt", width: 6 },
  { header: "Biển số", width: 14 },
  { header: "Ngày", width: 12 },
  { header: "Cước", width: 14 },
  { header: "Thuế suất (%)", width: 12 },
];

export interface BillingExport {
  file: Uint8Array;
  filename: string;
  contracts: number;
}

/** The workbook of a month: tien-thue-2027-02.xlsx. */
export async function exportPeriod(
  db: Reader,
  month: string,
  today: BusinessDate,
): Promise<BillingExport> {
  const list = await periodList(db, month, today);
  const views: ContractStatementView[] = [];
  for (const entry of list.contracts) {
    const view = await contractStatement(db, entry.id, month, today);
    if (view) views.push(view);
  }
  const file = buildXlsxBook([
    { sheetName: "Tổng hợp", columns: SUMMARY, rows: views.map(summaryRow) },
    {
      sheetName: "Chi tiết",
      columns: DETAIL,
      rows: views.flatMap((view) =>
        view.statement.lines.map((line) => detailRow(view.contract.code, line)),
      ),
    },
    {
      sheetName: "Cước",
      columns: FREIGHT,
      rows: views.flatMap((view) =>
        view.statement.freight.map((entry) => [
          view.contract.code,
          entry.code,
          entry.batchNo,
          entry.vehiclePlate,
          date(entry.date),
          entry.amount,
          rate(entry.vatBasisPoints),
        ]),
      ),
    },
  ]);
  return { file, filename: `tien-thue-${month}.xlsx`, contracts: views.length };
}

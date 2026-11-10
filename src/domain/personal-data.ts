// Sellers' personal data (personal-data-protection D6–D8, 0.2 số 156–số 166):
// the notice wording, when a notice is needed, how long a CCCD is kept and
// how a seller is written into append-only tables. Pure.
import type { BusinessDate } from "./business-date";

/**
 * Wording of each notice version. A version that has been used never
 * changes: new wording is a new version (spec "Phiên bản câu thông báo").
 */
export const PERSONAL_DATA_NOTICES: Readonly<Record<number, string>> = {
  1: "{companyName} lưu các thông tin sau của ông/bà: họ tên, số điện thoại, địa chỉ, số CCCD, tên ngân hàng và 4 số cuối tài khoản. Mục đích: liên hệ mua bán, thanh toán tiền hàng và lập chứng từ thuế (bảng kê thu mua không có hóa đơn). Số CCCD được mã hóa, chỉ nhân viên được giao việc mới xem được số đầy đủ. Dữ liệu lưu trên máy chủ đặt tại Singapore, trong 10 năm kể từ lần mua gần nhất. Ông/bà có quyền yêu cầu xem, sửa hoặc xóa, liên hệ {companyPhone}.",
};

export const CURRENT_NOTICE_VERSION = 1;

export const DATA_NOTICE_MESSAGE =
  "Chưa ghi nhận đã thông báo cho người bán, không lưu được thông tin cá nhân";

export interface NoticeCompany {
  readonly companyName: string;
  readonly companyPhone: string;
}

/** The notice as read to the seller, null for an unknown version. */
export function renderDataNotice(
  version: number,
  company: NoticeCompany,
): string | null {
  const template = PERSONAL_DATA_NOTICES[version];
  if (template === undefined) return null;
  return template
    .replaceAll("{companyName}", company.companyName)
    .replaceAll("{companyPhone}", company.companyPhone);
}

export type SellerKind = "COMPANY" | "PERSON";

export interface NoticeFields {
  readonly idNumber?: unknown;
  readonly phone?: unknown;
  readonly address?: unknown;
  readonly bankAccountLast4?: unknown;
  readonly bankName?: unknown;
}

const present = (value: unknown): boolean =>
  typeof value === "string" ? value.trim() !== "" : Boolean(value);

/**
 * Must the seller have been told? Any CCCD, of any kind of seller; for a
 * person also a phone, an address or an account. A name alone does not count.
 */
export function needsDataNotice(kind: string, values: NoticeFields): boolean {
  if (present(values.idNumber)) return true;
  return (
    kind === "PERSON" &&
    [
      values.phone,
      values.address,
      values.bankAccountLast4,
      values.bankName,
    ].some(present)
  );
}

/** Years a CCCD is kept; pending the lawyer (#78), so a parameter. */
export const ID_NUMBER_RETENTION_YEARS = 10;

/**
 * First day the CCCD may no longer be kept. A year count ending on a day the
 * month lacks ends on the month's last day (29/02/2028 + 10 = 28/02/2038).
 */
export function idNumberRetainedUntil(
  lastReceiptDate: string,
  years: number = ID_NUMBER_RETENTION_YEARS,
): BusinessDate {
  const [year = 0, month = 1, day = 1] = lastReceiptDate.split("-").map(Number);
  const target = year + years;
  const lastDay = new Date(Date.UTC(target, month, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${target}-${pad(month)}-${pad(Math.min(day, lastDay))}` as BusinessDate;
}

export interface SellerRef {
  readonly kind: string;
  readonly code: string;
  readonly name: string;
}

/**
 * How a seller is written into append-only tables (design D8): those rows
 * cannot be erased later, so a person is written by code only.
 */
export function sellerLabel(seller: SellerRef): string {
  return seller.kind === "PERSON" ? seller.code : seller.name;
}

export function anonymizedSellerName(code: string): string {
  return `Đã ẩn danh (${code})`;
}

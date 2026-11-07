// What D18 writes for a log row (activity-log design D1).
import {
  BROWSER_LABELS,
  DOCUMENT_TYPE_LABELS,
  actionLabel,
  type ActivityAction,
  type ActionGroup,
  type DocumentType,
} from "@/domain/activity";
import type { BadgeTone } from "@/components/domain/tone-badge";
import type { BusinessDate } from "@/domain/business-date";
import type { Device } from "@/domain/device";
import { ROLE_LABELS, type Role } from "@/domain/role";

const ACTION_TONES: Readonly<Record<ActivityAction, BadgeTone>> = {
  CREATE: "neutral",
  UPDATE: "highlight",
  SUBMIT: "neutral",
  SEND: "neutral",
  APPROVE: "success",
  POST: "success",
  CLOSE_PERIOD: "success",
  SETTLE: "success",
  RETURN: "warning",
  REJECT: "destructive",
  CANCEL: "destructive",
  CLOSE: "warning",
  DELETE_DRAFT: "destructive",
  DELETE: "destructive",
  SIGN_IN: "muted",
  START: "highlight",
  ASSIGN: "neutral",
  RECALL: "warning",
  RECEIVE: "highlight",
  REPORT: "highlight",
  COUNT: "highlight",
};

export function actionBadge(
  action: ActivityAction,
  type: DocumentType | null,
): { label: string; tone: BadgeTone } {
  return { label: actionLabel(action, type), tone: ACTION_TONES[action] };
}

/** "Kế toán · máy tính". */
export function whoText(role: Role, device: Device): string {
  return `${ROLE_LABELS[role]} · ${device === "MOBILE" ? "điện thoại" : "máy tính"}`;
}

/** "Máy tính · Edge". */
export function deviceLabel(
  device: Device,
  browser: keyof typeof BROWSER_LABELS,
) {
  return `${device === "MOBILE" ? "Điện thoại" : "Máy tính"} · ${BROWSER_LABELS[browser]}`;
}

export function documentTypeLabel(type: DocumentType | null): string {
  return type ? DOCUMENT_TYPE_LABELS[type] : "";
}

/** Pages that show a document by its code; others are plain text. */
export function documentHref(
  type: DocumentType | null,
  code: string | null,
): string | null {
  if (!code) return null;
  const path = encodeURIComponent(code);
  switch (type) {
    case "PURCHASE_ORDER":
      return `/purchasing/orders/${path}`;
    case "REPAIR_ORDER":
      return `/repairs/${path}`;
    case "STOCKTAKE":
      return `/inventory/stocktakes/${path}`;
    case "ITEM":
      return `/inventory/items/${path}`;
    case "SITE_TRANSFER":
      return `/sales/site-transfers/${path}`;
    case "BUY_BACK":
      return `/sales/buy-backs/${path}`;
    default:
      return null;
  }
}

const WEEKDAYS = [
  "Chủ nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

/** "Thứ Tư, 28/10/2026". */
export function dayHeading(date: BusinessDate): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const weekday =
    WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/** "27–28/10", "28/10", "30/09–28/10" for the first tile. */
export function rangeText(from: BusinessDate, to: BusinessDate): string {
  const [, fm = "", fd = ""] = from.split("-");
  const [, tm = "", td = ""] = to.split("-");
  if (from === to) return `${td}/${tm}`;
  return fm === tm ? `${fd}–${td}/${tm}` : `${fd}/${fm}–${td}/${tm}`;
}

export const GROUP_CHIPS: readonly {
  value: ActionGroup | null;
  label: string;
}[] = [
  { value: null, label: "Tất cả" },
  { value: "CREATE", label: "Tạo" },
  { value: "UPDATE", label: "Sửa" },
  { value: "APPROVAL", label: "Duyệt, ghi sổ" },
  { value: "REVERSAL", label: "Trả lại, hủy, xóa" },
  { value: "SIGN_IN", label: "Đăng nhập" },
];

// The activity log's vocabulary (activity-log design D3, D8): actions and
// their filter groups, document types, flags, working hours and the browser
// read from a User-Agent. Pure; the database CHECKs list the same values.
import { BUSINESS_TIME_ZONE } from "./business-date";
import { DEVICE_LABELS, type Device } from "./device";

export const ACTIVITY_ACTIONS = [
  "CREATE",
  "UPDATE",
  "SUBMIT",
  "APPROVE",
  "POST",
  "RETURN",
  "CANCEL",
  "CLOSE",
  "DELETE_DRAFT",
  "DELETE",
  "SIGN_IN",
  "START",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const ACTION_LABELS: Readonly<Record<ActivityAction, string>> = {
  CREATE: "Tạo",
  UPDATE: "Sửa",
  SUBMIT: "Gửi duyệt",
  APPROVE: "Duyệt",
  POST: "Ghi sổ",
  RETURN: "Trả lại",
  CANCEL: "Hủy",
  CLOSE: "Đóng đơn",
  DELETE_DRAFT: "Xóa nháp",
  DELETE: "Xóa",
  SIGN_IN: "Đăng nhập",
  START: "Bắt đầu nhặt",
};

export const ACTION_GROUPS = [
  "CREATE",
  "UPDATE",
  "APPROVAL",
  "REVERSAL",
  "SIGN_IN",
] as const;
export type ActionGroup = (typeof ACTION_GROUPS)[number];

export const ACTION_GROUP_LABELS: Readonly<Record<ActionGroup, string>> = {
  CREATE: "Tạo",
  UPDATE: "Sửa",
  APPROVAL: "Duyệt, ghi sổ",
  REVERSAL: "Trả lại, hủy, xóa",
  SIGN_IN: "Đăng nhập",
};

/** Which actions each D18 filter group shows (design D3). */
export const GROUP_ACTIONS: Readonly<
  Record<ActionGroup, readonly ActivityAction[]>
> = {
  CREATE: ["CREATE"],
  UPDATE: ["UPDATE", "START"],
  APPROVAL: ["SUBMIT", "APPROVE", "POST"],
  REVERSAL: ["RETURN", "CANCEL", "CLOSE", "DELETE_DRAFT", "DELETE"],
  SIGN_IN: ["SIGN_IN"],
};

/** D18 tile "Duyệt, ghi sổ": what changed the books; submitting did not. */
export const APPROVAL_TILE_ACTIONS: readonly ActivityAction[] = [
  "APPROVE",
  "POST",
];

/** D18 tile "Sửa, xóa, trả lại". */
export const EDIT_TILE_ACTIONS: readonly ActivityAction[] = [
  "UPDATE",
  "RETURN",
  "CANCEL",
  "CLOSE",
  "DELETE_DRAFT",
  "DELETE",
];

export const DOCUMENT_TYPES = [
  "PURCHASE_ORDER",
  "GOODS_RECEIPT",
  "REPAIR_ORDER",
  "STOCKTAKE",
  "STOCK_ADJUSTMENT",
  "OPENING_BALANCE",
  "ITEM",
  "ITEM_GROUP",
  "KIT",
  "SUPPLIER",
  "CUSTOMER",
  "SITE",
  "LOCATION",
  "USER",
  "SCRAP_PRICE",
  "COMPANY_PROFILE",
  "CONTRACT",
  "CONTRACT_AMENDMENT",
  "DELIVERY_NOTE",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Readonly<Record<DocumentType, string>> = {
  PURCHASE_ORDER: "Đơn thu mua",
  GOODS_RECEIPT: "Phiếu nhập",
  REPAIR_ORDER: "Phiếu sửa chữa",
  STOCKTAKE: "Kiểm kê",
  STOCK_ADJUSTMENT: "Phiếu điều chỉnh",
  OPENING_BALANCE: "Tồn đầu kỳ",
  ITEM: "Vật tư",
  ITEM_GROUP: "Nhóm hàng",
  KIT: "Bộ",
  SUPPLIER: "Nhà cung cấp",
  CUSTOMER: "Nhà thầu",
  SITE: "Công trình",
  LOCATION: "Kho/bãi/xưởng",
  USER: "Người dùng",
  SCRAP_PRICE: "Giá sắt vụn",
  COMPANY_PROFILE: "Cài đặt công ty",
  CONTRACT: "Hợp đồng",
  CONTRACT_AMENDMENT: "Phụ lục hợp đồng",
  DELIVERY_NOTE: "Phiếu xuất",
};

/** The label of an action on a document: submitting an order places it. */
export function actionLabel(
  action: ActivityAction,
  type: DocumentType | null,
): string {
  if (action === "SUBMIT" && type === "PURCHASE_ORDER") return "Đặt đơn";
  return ACTION_LABELS[action];
}

export const ACTIVITY_FLAGS = ["OFF_HOURS", "SENSITIVE", "ANOMALY"] as const;
export type ActivityFlag = (typeof ACTIVITY_FLAGS)[number];

export const FLAG_LABELS: Readonly<Record<ActivityFlag, string>> = {
  OFF_HOURS: "Ngoài giờ",
  SENSITIVE: "Dữ liệu nhạy cảm",
  ANOMALY: "Có xác nhận bất thường",
};

export const BROWSERS = [
  "EDGE",
  "CHROME",
  "COCCOC",
  "SAFARI",
  "FIREFOX",
  "OTHER",
] as const;
export type Browser = (typeof BROWSERS)[number];

export const BROWSER_LABELS: Readonly<Record<Browser, string>> = {
  EDGE: "Edge",
  CHROME: "Chrome",
  COCCOC: "Cốc Cốc",
  SAFARI: "Safari",
  FIREFOX: "Firefox",
  OTHER: "Khác",
};

/**
 * The browser from a User-Agent. Order matters: Edge and Cốc Cốc also say
 * "Chrome", Chrome also says "Safari".
 */
export function detectBrowser(userAgent: string | null | undefined): Browser {
  const agent = userAgent ?? "";
  if (/\bEdg(e|A|iOS)?\//.test(agent)) return "EDGE";
  if (/coc_coc_browser/i.test(agent)) return "COCCOC";
  if (/\bFirefox\/|\bFxiOS\//.test(agent)) return "FIREFOX";
  if (/\bChrome\/|\bCriOS\//.test(agent)) return "CHROME";
  if (/\bSafari\//.test(agent) && /\bVersion\//.test(agent)) return "SAFARI";
  return "OTHER";
}

/** "Máy tính · Edge", "Điện thoại · Chrome" (D18 Thiết bị). */
export function deviceText(device: Device, browser: Browser): string {
  return `${DEVICE_LABELS[device]} · ${BROWSER_LABELS[browser]}`;
}

export interface WorkingHours {
  /** "06:00": the first in-hours minute. */
  start: string;
  /** "21:00": the first off-hours minute. */
  end: string;
}

/** 0.2 #34: the office works 06:00–21:00 Vietnam time. */
export const WORKING_HOURS: WorkingHours = { start: "06:00", end: "21:00" };

const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function secondsOf(clock: string): number {
  const [h = "0", m = "0", s = "0"] = clock.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/**
 * Off hours in Vietnam time (design D8): working hours are [start, end),
 * so 05:59:59 and 21:00:00 are off hours, 06:00:00 and 20:59:59 are not.
 */
export function isOffHours(at: Date, hours: WorkingHours): boolean {
  const now = secondsOf(clockFormat.format(at));
  return now < secondsOf(hours.start) || now >= secondsOf(hours.end);
}

/** Most field changes kept on one log row (design D6). */
export const MAX_CHANGES = 50;
/** Longest summary stored (design D2). */
export const SUMMARY_MAX = 300;
/** D18 loads this many rows per page (design D9). */
export const ACTIVITY_PAGE_SIZE = 50;
/** Most rows one Excel export carries (0.2 #34). */
export const EXPORT_MAX_ROWS = 10_000;
/** Longest date range a D18 filter accepts. */
export const MAX_RANGE_DAYS = 366;
/** D18 opens on this many days, today included. */
export const DEFAULT_RANGE_DAYS = 7;

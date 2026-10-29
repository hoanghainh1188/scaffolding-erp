// The D18 filter read from the address bar (activity-log design D9). Pure:
// the page, the list API and the Excel export all read it the same way.
import {
  ACTION_GROUPS,
  DEFAULT_RANGE_DAYS,
  DOCUMENT_TYPES,
  MAX_RANGE_DAYS,
  type ActionGroup,
  type DocumentType,
} from "./activity";
import {
  addDays,
  daysBetween,
  isBusinessDate,
  type BusinessDate,
} from "./business-date";

export const ACTIVITY_FILTER_MESSAGES = {
  date: "Ngày không hợp lệ",
  order: "Từ ngày phải trước hoặc bằng đến ngày",
  range: `Chọn khoảng tối đa ${MAX_RANGE_DAYS} ngày`,
  type: "Loại chứng từ không hợp lệ",
  group: "Nhóm thao tác không hợp lệ",
  code: "Mã chứng từ dài tối đa 60 ký tự",
} as const;

export interface ActivityFilter {
  from: BusinessDate;
  to: BusinessDate;
  userId: string | null;
  type: DocumentType | null;
  /** Matched whole, ignoring case. */
  code: string | null;
  group: ActionGroup | null;
  /** "Chỉ cần xem kỹ": rows with a flag only. */
  review: boolean;
}

export type FilterResult =
  { ok: true; filter: ActivityFilter } | { ok: false; error: string };

type Params = Readonly<Record<string, string | null | undefined>>;

const text = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/** The last DEFAULT_RANGE_DAYS days, today included. */
export function defaultRange(today: BusinessDate): {
  from: BusinessDate;
  to: BusinessDate;
} {
  return { from: addDays(today, -(DEFAULT_RANGE_DAYS - 1)), to: today };
}

export function parseActivityFilter(
  params: Params,
  today: BusinessDate,
): FilterResult {
  const range = defaultRange(today);
  const fromText = text(params.from);
  const toText = text(params.to);
  if (
    (fromText && !isBusinessDate(fromText)) ||
    (toText && !isBusinessDate(toText))
  ) {
    return { ok: false, error: ACTIVITY_FILTER_MESSAGES.date };
  }
  const from = (fromText as BusinessDate | null) ?? range.from;
  const to = (toText as BusinessDate | null) ?? range.to;
  if (from > to) return { ok: false, error: ACTIVITY_FILTER_MESSAGES.order };
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
    return { ok: false, error: ACTIVITY_FILTER_MESSAGES.range };
  }
  const type = text(params.type);
  if (type && !(DOCUMENT_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: ACTIVITY_FILTER_MESSAGES.type };
  }
  const group = text(params.group);
  if (group && !(ACTION_GROUPS as readonly string[]).includes(group)) {
    return { ok: false, error: ACTIVITY_FILTER_MESSAGES.group };
  }
  const code = text(params.code);
  if (code && code.length > 60) {
    return { ok: false, error: ACTIVITY_FILTER_MESSAGES.code };
  }
  return {
    ok: true,
    filter: {
      from,
      to,
      userId: text(params.user),
      type: type as DocumentType | null,
      code,
      group: group as ActionGroup | null,
      review: params.review === "1",
    },
  };
}

/** The filter back as address-bar parameters (defaults left out). */
export function filterParams(
  filter: ActivityFilter,
  today: BusinessDate,
): URLSearchParams {
  const params = new URLSearchParams();
  const range = defaultRange(today);
  if (filter.from !== range.from || filter.to !== range.to) {
    params.set("from", filter.from);
    params.set("to", filter.to);
  }
  if (filter.userId) params.set("user", filter.userId);
  if (filter.type) params.set("type", filter.type);
  if (filter.code) params.set("code", filter.code);
  if (filter.group) params.set("group", filter.group);
  if (filter.review) params.set("review", "1");
  return params;
}

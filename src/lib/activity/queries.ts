// Reading the activity log for D18 and its Excel export (activity-log
// design D9, D10). Newest first, by (created_at, id); a cursor carries the
// last row read and the newest id of the first page, so rows written while
// the director reads neither slip in nor shift the counts.
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { activityLog, user } from "@/db/schema";
import {
  ACTIVITY_PAGE_SIZE,
  APPROVAL_TILE_ACTIONS,
  DOCUMENT_TYPE_LABELS,
  EDIT_TILE_ACTIONS,
  EXPORT_MAX_ROWS,
  FLAG_LABELS,
  GROUP_ACTIONS,
  actionLabel,
  deviceText,
  type ActivityAction,
  type ActivityFlag,
  type Browser,
  type DocumentType,
} from "@/domain/activity";
import type { FieldChange } from "@/domain/activity-changes";
import { changePhrase } from "@/domain/activity-summary";
import type { ActivityFilter } from "@/domain/activity-filter";
import {
  addDays,
  BUSINESS_TIME_ZONE,
  formatDateTimeSeconds,
  type BusinessDate,
} from "@/domain/business-date";
import type { Device } from "@/domain/device";
import { ROLE_LABELS, type Role } from "@/domain/role";
import { buildXlsx, type XlsxColumn } from "@/lib/export/xlsx";

export interface ActivityRow {
  id: number;
  /** ISO instant. */
  at: string;
  userId: string;
  userName: string;
  username: string;
  role: Role;
  device: Device;
  browser: Browser;
  action: ActivityAction;
  documentType: DocumentType | null;
  documentCode: string | null;
  summary: string;
  changes: FieldChange[];
  flags: ActivityFlag[];
}

export interface ActivitySummary {
  total: number;
  people: number;
  mobile: number;
  /** Duyệt + Ghi sổ: what changed the books. */
  approvals: number;
  /** Sửa, trả lại, hủy, đóng đơn, xóa. */
  edits: number;
  /** Rows with a flag. */
  review: number;
}

export interface ActivityDay {
  date: BusinessDate;
  count: number;
}

export interface ActivityPage {
  rows: ActivityRow[];
  /** Null on the last page. */
  nextCursor: string | null;
  /** Rows of the whole filter, up to the snapshot. */
  total: number;
}

export interface ActivityOverview extends ActivityPage {
  summary: ActivitySummary;
  days: ActivityDay[];
  /** "Chỉ cần xem kỹ (N)": flagged rows of the filter, review off. */
  reviewCount: number;
}

interface Cursor {
  at: string;
  id: number;
  maxId: number;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/** Null for anything that is not a cursor this module wrote. */
export function decodeCursor(text: string | null | undefined): Cursor | null {
  if (!text) return null;
  try {
    const value = JSON.parse(
      Buffer.from(text, "base64url").toString("utf8"),
    ) as Partial<Cursor>;
    if (
      typeof value.at !== "string" ||
      Number.isNaN(Date.parse(value.at)) ||
      !Number.isSafeInteger(value.id) ||
      !Number.isSafeInteger(value.maxId)
    ) {
      return null;
    }
    return value as Cursor;
  } catch {
    return null;
  }
}

/** Vietnam midnight of a business date, as a timestamptz. */
const vnMidnight = (date: BusinessDate) =>
  sql`(${date}::date)::timestamp at time zone ${BUSINESS_TIME_ZONE}`;

function conditions(
  filter: ActivityFilter,
  options: { review?: boolean; maxId?: number } = {},
): SQL[] {
  const where: SQL[] = [
    sql`${activityLog.createdAt} >= ${vnMidnight(filter.from)}`,
    // The day after `to`, as a date: no interval arithmetic in the session zone.
    sql`${activityLog.createdAt} < ${vnMidnight(addDays(filter.to, 1))}`,
  ];
  if (filter.userId) where.push(eq(activityLog.userId, filter.userId));
  if (filter.type) where.push(eq(activityLog.documentType, filter.type));
  if (filter.code) {
    where.push(sql`lower(${activityLog.documentCode}) = lower(${filter.code})`);
  }
  if (filter.group) {
    where.push(inArray(activityLog.action, [...GROUP_ACTIONS[filter.group]]));
  }
  if (options.review ?? filter.review) {
    where.push(sql`${activityLog.flags} <> '{}'::text[]`);
  }
  if (options.maxId !== undefined) {
    where.push(sql`${activityLog.id} <= ${options.maxId}`);
  }
  return where;
}

const rowColumns = {
  id: activityLog.id,
  createdAt: activityLog.createdAt,
  userId: activityLog.userId,
  userName: user.name,
  username: user.username,
  role: activityLog.role,
  device: activityLog.device,
  browser: activityLog.browser,
  action: activityLog.action,
  documentType: activityLog.documentType,
  documentCode: activityLog.documentCode,
  summary: activityLog.summary,
  changes: activityLog.changes,
  flags: activityLog.flags,
};

interface Selected {
  id: number;
  createdAt: Date;
  userId: string;
  userName: string;
  username: string;
  role: string;
  device: string;
  browser: string;
  action: string;
  documentType: string | null;
  documentCode: string | null;
  summary: string;
  changes: FieldChange[];
  flags: string[];
}

function toRow(row: Selected): ActivityRow {
  return {
    id: row.id,
    at: row.createdAt.toISOString(),
    userId: row.userId,
    userName: row.userName,
    username: row.username,
    role: row.role as Role,
    device: row.device as Device,
    browser: row.browser as Browser,
    action: row.action as ActivityAction,
    documentType: row.documentType as DocumentType | null,
    documentCode: row.documentCode,
    summary: row.summary,
    changes: row.changes,
    flags: row.flags as ActivityFlag[],
  };
}

async function newestId(db: Database, filter: ActivityFilter) {
  const [row] = await db
    .select({ id: sql<number | null>`max(${activityLog.id})` })
    .from(activityLog)
    .where(and(...conditions(filter)));
  return Number(row?.id ?? 0);
}

async function countRows(db: Database, where: SQL[]): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activityLog)
    .where(and(...where));
  return row?.n ?? 0;
}

async function pageAt(
  db: Database,
  filter: ActivityFilter,
  maxId: number,
  after: { at: string; id: number } | null,
): Promise<ActivityPage> {
  const where = conditions(filter, { maxId });
  const page = after
    ? [
        ...where,
        sql`(${activityLog.createdAt}, ${activityLog.id}) < (${after.at}::timestamptz, ${after.id})`,
      ]
    : where;
  const rows = await db
    .select(rowColumns)
    .from(activityLog)
    .innerJoin(user, eq(user.id, activityLog.userId))
    .where(and(...page))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(ACTIVITY_PAGE_SIZE + 1);
  const shown = rows.slice(0, ACTIVITY_PAGE_SIZE).map(toRow);
  const last = shown.at(-1);
  return {
    rows: shown,
    nextCursor:
      rows.length > ACTIVITY_PAGE_SIZE && last
        ? encodeCursor({ at: last.at, id: last.id, maxId })
        : null,
    total: await countRows(db, where),
  };
}

/** One page of the filter, after `cursor` (or from the newest row). */
export async function listActivity(
  db: Database,
  filter: ActivityFilter,
  cursorText?: string | null,
): Promise<ActivityPage> {
  const cursor = decodeCursor(cursorText);
  return cursor
    ? pageAt(db, filter, cursor.maxId, cursor)
    : pageAt(
        db,
        filter,
        await newestId(db, { ...filter, review: false }),
        null,
      );
}

/** The four D18 tiles of the filter. */
export async function activitySummary(
  db: Database,
  filter: ActivityFilter,
  maxId?: number,
): Promise<ActivitySummary> {
  const inList = (actions: readonly string[]) =>
    sql.join(
      actions.map((action) => sql`${action}`),
      sql`, `,
    );
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      people: sql<number>`count(distinct ${activityLog.userId})::int`,
      mobile: sql<number>`(count(*) filter (where ${activityLog.device} = 'MOBILE'))::int`,
      approvals: sql<number>`(count(*) filter (where ${activityLog.action} in (${inList(APPROVAL_TILE_ACTIONS)})))::int`,
      edits: sql<number>`(count(*) filter (where ${activityLog.action} in (${inList(EDIT_TILE_ACTIONS)})))::int`,
      review: sql<number>`(count(*) filter (where ${activityLog.flags} <> '{}'::text[]))::int`,
    })
    .from(activityLog)
    .where(and(...conditions(filter, { maxId })));
  return {
    total: row?.total ?? 0,
    people: row?.people ?? 0,
    mobile: row?.mobile ?? 0,
    approvals: row?.approvals ?? 0,
    edits: row?.edits ?? 0,
    review: row?.review ?? 0,
  };
}

/** Rows per Vietnam day, newest day first. */
export async function activityDays(
  db: Database,
  filter: ActivityFilter,
  maxId?: number,
): Promise<ActivityDay[]> {
  // The zone is a constant written into the text, not a parameter: GROUP BY
  // must see the very same expression as the select list.
  const zone = sql.raw(`'${BUSINESS_TIME_ZONE}'`);
  const day = sql<string>`to_char((${activityLog.createdAt} at time zone ${zone})::date, 'YYYY-MM-DD')`;
  const rows = await db
    .select({ date: day, count: sql<number>`count(*)::int` })
    .from(activityLog)
    .where(and(...conditions(filter, { maxId })))
    .groupBy(day)
    .orderBy(desc(day));
  return rows.map((row) => ({
    date: row.date as BusinessDate,
    count: row.count,
  }));
}

/** The first page with everything D18 shows around it. */
export async function activityOverview(
  db: Database,
  filter: ActivityFilter,
): Promise<ActivityOverview> {
  const maxId = await newestId(db, { ...filter, review: false });
  const [page, summary, days, reviewCount] = await Promise.all([
    pageAt(db, filter, maxId, null),
    activitySummary(db, filter, maxId),
    activityDays(db, filter, maxId),
    countRows(db, conditions(filter, { review: true, maxId })),
  ]);
  return { ...page, summary, days, reviewCount };
}

export interface ActivityPerson {
  id: string;
  name: string;
  username: string;
  role: Role;
}

/** Everyone who could appear in the log, for the "Người làm" filter. */
export async function activityPeople(db: Database): Promise<ActivityPerson[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    })
    .from(user)
    .orderBy(asc(user.name));
  return rows.map((row) => ({ ...row, role: row.role as Role }));
}

// ------------------------------------------------------------ export

export const EXPORT_MESSAGES = {
  tooMany: (count: number) =>
    `Có ${count.toLocaleString("vi-VN")} thao tác, quá ${EXPORT_MAX_ROWS.toLocaleString("vi-VN")} dòng. Thu hẹp khoảng ngày hoặc bộ lọc`,
} as const;

const EXPORT_COLUMNS: readonly XlsxColumn[] = [
  { header: "Thời điểm", width: 20 },
  { header: "Người làm", width: 20 },
  { header: "Tên đăng nhập", width: 14 },
  { header: "Vai trò", width: 12 },
  { header: "Thiết bị", width: 18 },
  { header: "Thao tác", width: 12 },
  { header: "Loại chứng từ", width: 16 },
  { header: "Mã chứng từ", width: 16 },
  { header: "Nội dung", width: 50 },
  { header: "Thay đổi", width: 60 },
  { header: "Cờ", width: 28 },
];

/** One Excel row, values as D18 shows them (CCCD and STK already masked). */
export function exportCells(row: ActivityRow): string[] {
  return [
    formatDateTimeSeconds(new Date(row.at)),
    row.userName,
    row.username,
    ROLE_LABELS[row.role],
    deviceText(row.device, row.browser),
    actionLabel(row.action, row.documentType),
    row.documentType ? DOCUMENT_TYPE_LABELS[row.documentType] : "",
    row.documentCode ?? "",
    row.summary,
    row.changes.map(changePhrase).join("\n"),
    row.flags.map((flag) => FLAG_LABELS[flag]).join(", "),
  ];
}

export type ExportResult =
  | { ok: true; file: Uint8Array; filename: string; rows: number }
  | { ok: false; status: 422; error: string };

/** Every row of the filter as .xlsx, or a refusal above EXPORT_MAX_ROWS. */
export async function exportActivity(
  db: Database,
  filter: ActivityFilter,
): Promise<ExportResult> {
  const where = conditions(filter);
  const count = await countRows(db, where);
  if (count > EXPORT_MAX_ROWS) {
    return { ok: false, status: 422, error: EXPORT_MESSAGES.tooMany(count) };
  }
  const rows = await db
    .select(rowColumns)
    .from(activityLog)
    .innerJoin(user, eq(user.id, activityLog.userId))
    .where(and(...where))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(EXPORT_MAX_ROWS);
  return {
    ok: true,
    file: buildXlsx({
      sheetName: "Nhật ký thao tác",
      columns: EXPORT_COLUMNS,
      rows: rows.map((row) => exportCells(toRow(row))),
    }),
    filename: `nhat-ky-${filter.from}-${filter.to}.xlsx`,
    rows: rows.length,
  };
}

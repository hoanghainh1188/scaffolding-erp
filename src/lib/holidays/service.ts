// Holidays without rent (rental-billing spec rental-holidays, design D2,
// D6): only the director writes them; a row that touches a closed period
// (old or new range) cannot change, because closed rent is never computed
// again (0.2 #22). Writers take the holiday lock exclusively, a closing
// takes it shared, so no period closes on a table that is changing.
import { asc, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { rentalHoliday } from "@/db/schema";
import { diffFields, type FieldSpec } from "@/domain/activity-changes";
import { formatBusinessDate, type BusinessDate } from "@/domain/business-date";
import { can } from "@/domain/permissions";
import { formatMonth } from "@/domain/rental-billing";
import {
  checkHoliday,
  firstOverlap,
  HOLIDAY_MESSAGES,
  holidayLength,
  type HolidayRange,
} from "@/domain/rental-holiday";
import type { ActivityActor } from "@/lib/activity/actor";
import { logActivity, type Tx } from "@/lib/activity/log";
import {
  conflict,
  notFound,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import { ContractFieldError, forbidden, run } from "@/lib/contracts/common";

import {
  closedPeriodWithin,
  latestClosedPeriod,
  type HolidayRow,
} from "./queries";

/** The advisory lock shared with closing a period (design D6). */
export const HOLIDAY_LOCK = "rental-holidays";

export const HOLIDAY_SERVICE_MESSAGES = {
  closed: (month: string, contractCode: string) =>
    `Kỳ ${formatMonth(month)} đã chốt cho hợp đồng ${contractCode} nên không đổi được ngày nghỉ trong kỳ đó. Sai sót thì ghi dòng điều chỉnh ở kỳ sau.`,
  stale: "Ngày nghỉ này vừa được người khác sửa. Bạn tải lại để xem bản mới.",
} as const;

export interface HolidayBody {
  name?: string;
  startDate?: string;
  endDate?: string;
  /** Edits only: when the row was last saved (409 when stale). */
  updatedAt?: string;
}

export interface SavedHoliday {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  updatedAt: string;
}

const FIELDS: readonly FieldSpec<HolidayRange>[] = [
  { field: "name", label: "Tên", value: (row) => row.name },
  {
    field: "startDate",
    label: "Từ ngày",
    value: (row) => formatBusinessDate(row.startDate),
  },
  {
    field: "endDate",
    label: "Đến ngày",
    value: (row) => formatBusinessDate(row.endDate),
  },
];

const rangeText = (range: HolidayRange) =>
  range.startDate === range.endDate
    ? formatBusinessDate(range.startDate)
    : `${formatBusinessDate(range.startDate)} – ${formatBusinessDate(range.endDate)}`;

const summaryOf = (range: HolidayRange) =>
  `${range.name} · ${rangeText(range)} · ${holidayLength(range)} ngày`;

function assertDirector(actor: ActivityActor): void {
  if (!can(actor.role, "holidays.manage")) {
    throw new ServiceFailure(forbidden());
  }
}

function parse(body: HolidayBody): HolidayRange {
  try {
    return checkHoliday({
      name: body.name ?? "",
      startDate: body.startDate ?? "",
      endDate: body.endDate ?? "",
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      const fieldName =
        error.message === HOLIDAY_MESSAGES.nameRequired ||
        error.message === HOLIDAY_MESSAGES.nameTooLong
          ? "name"
          : "endDate";
      throw new ContractFieldError(error.message, fieldName);
    }
    throw error;
  }
}

async function lockHolidays(tx: Tx): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${HOLIDAY_LOCK}))`,
  );
}

/** Refuses a range that touches a closed period (0.2 #22). */
async function assertOpen(tx: Tx, ranges: readonly HolidayRange[]) {
  const latest = await latestClosedPeriod(tx);
  if (!latest) return;
  for (const range of ranges) {
    if (range.startDate > latest.periodEnd) continue;
    const hit =
      (await closedPeriodWithin(tx, range.startDate, range.endDate)) ?? latest;
    throw new ServiceFailure(
      conflict(HOLIDAY_SERVICE_MESSAGES.closed(hit.month, hit.contractCode)),
    );
  }
}

async function assertNoOverlap(tx: Tx, range: HolidayRange) {
  const rows = await tx
    .select({
      id: rentalHoliday.id,
      name: rentalHoliday.name,
      startDate: rentalHoliday.startDate,
      endDate: rentalHoliday.endDate,
    })
    .from(rentalHoliday)
    .orderBy(asc(rentalHoliday.startDate));
  const hit = firstOverlap(
    range,
    rows.map((row) => ({
      ...row,
      startDate: row.startDate as BusinessDate,
      endDate: row.endDate as BusinessDate,
    })),
  );
  if (hit) {
    throw new ContractFieldError(
      HOLIDAY_MESSAGES.overlap(hit.day, hit.holiday.name),
      "startDate",
    );
  }
}

const saved = (
  row: HolidayRow | typeof rentalHoliday.$inferSelect,
): SavedHoliday => ({
  id: row.id,
  name: row.name,
  startDate: row.startDate,
  endDate: row.endDate,
  updatedAt: row.updatedAt.toISOString(),
});

async function lockRow(tx: Tx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ServiceFailure(notFound());
  const [row] = await tx
    .select()
    .from(rentalHoliday)
    .where(eq(rentalHoliday.id, id))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return row;
}

const rangeOf = (row: typeof rentalHoliday.$inferSelect): HolidayRange => ({
  id: row.id,
  name: row.name,
  startDate: row.startDate as BusinessDate,
  endDate: row.endDate as BusinessDate,
});

function assertFresh(row: { updatedAt: Date }, updatedAt?: string) {
  if (!updatedAt || new Date(updatedAt).getTime() !== row.updatedAt.getTime()) {
    throw new ServiceFailure(conflict(HOLIDAY_SERVICE_MESSAGES.stale));
  }
}

/** "Thêm ngày nghỉ" in Settings. */
export function createHoliday(
  db: Database,
  actor: ActivityActor,
  body: HolidayBody,
): Promise<ServiceResult<SavedHoliday>> {
  return run(async () => {
    assertDirector(actor);
    const range = parse(body);
    return db.transaction(async (tx) => {
      await lockHolidays(tx);
      await assertOpen(tx, [range]);
      await assertNoOverlap(tx, range);
      const [row] = await tx
        .insert(rentalHoliday)
        .values({ ...range, createdBy: actor.id, updatedBy: actor.id })
        .returning();
      if (!row) throw new Error("holiday insert returned nothing");
      await logActivity(tx, actor, {
        action: "CREATE",
        document: { type: "RENTAL_HOLIDAY", id: row.id, code: range.name },
        summary: summaryOf(range),
      });
      return ok(saved(row));
    });
  });
}

/** "Sửa" a holiday; both the old and the new range must be open. */
export function updateHoliday(
  db: Database,
  actor: ActivityActor,
  id: string,
  body: HolidayBody,
): Promise<ServiceResult<SavedHoliday>> {
  return run(async () => {
    assertDirector(actor);
    const range = { ...parse(body), id };
    return db.transaction(async (tx) => {
      await lockHolidays(tx);
      const row = await lockRow(tx, id);
      assertFresh(row, body.updatedAt);
      const before = rangeOf(row);
      await assertOpen(tx, [before, range]);
      await assertNoOverlap(tx, range);
      const changes = diffFields(FIELDS, before, range);
      if (changes.length === 0) return ok(saved(row));
      const [updated] = await tx
        .update(rentalHoliday)
        .set({
          name: range.name,
          startDate: range.startDate,
          endDate: range.endDate,
          updatedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(rentalHoliday.id, id))
        .returning();
      if (!updated) throw new Error("holiday update returned nothing");
      await logActivity(tx, actor, {
        action: "UPDATE",
        document: { type: "RENTAL_HOLIDAY", id, code: range.name },
        summary: summaryOf(range),
        changes,
      });
      return ok(saved(updated));
    });
  });
}

/** "Xóa" a holiday after the confirmation of the settings page. */
export function deleteHoliday(
  db: Database,
  actor: ActivityActor,
  id: string,
  body: Pick<HolidayBody, "updatedAt">,
): Promise<ServiceResult<{ id: string }>> {
  return run(async () => {
    assertDirector(actor);
    return db.transaction(async (tx) => {
      await lockHolidays(tx);
      const row = await lockRow(tx, id);
      assertFresh(row, body.updatedAt);
      const before = rangeOf(row);
      await assertOpen(tx, [before]);
      await tx.delete(rentalHoliday).where(eq(rentalHoliday.id, id));
      await logActivity(tx, actor, {
        action: "DELETE",
        document: { type: "RENTAL_HOLIDAY", id, code: before.name },
        summary: summaryOf(before),
      });
      return ok({ id });
    });
  });
}

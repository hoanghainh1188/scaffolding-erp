// `npm run pii:purge` (personal-data-protection D7, 0.2 số 161, số 166): deletes
// what has outlived its retention period. The deadline is computed here,
// never stored, so changing the period needs no data change. Safe to re-run.
import { and, asc, eq, isNotNull, max, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { goodsReceipt, purchaseOrder, supplier, user } from "@/db/schema";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { changeSummary } from "@/domain/activity-summary";
import type { FieldChange } from "@/domain/activity-changes";
import { maskIdNumber } from "@/domain/partner-fields";
import {
  ID_NUMBER_RETENTION_YEARS,
  idNumberRetainedUntil,
} from "@/domain/personal-data";
import { parseRole } from "@/domain/role";
import { systemActor, type ActivityActor } from "@/lib/activity/actor";
import { logActivity, type Tx } from "@/lib/activity/log";

/**
 * Who the log names for this command: the log needs a real account and none
 * stands for the system, so the longest-standing active Director (0.2 số 168).
 */
export async function purgeActor(db: Database): Promise<ActivityActor | null> {
  const [director] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(and(eq(user.role, "DIRECTOR"), eq(user.status, "ACTIVE")))
    .orderBy(asc(user.createdAt))
    .limit(1);
  return director
    ? systemActor({ id: director.id, role: parseRole(director.role) })
    : null;
}

export interface PurgeResult {
  taxFiles: number;
  idNumbers: number;
}

export interface PurgeOptions {
  today?: BusinessDate;
  years?: number;
}

async function lastReceiptDate(
  tx: Tx,
  supplierId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ last: max(goodsReceipt.businessDate) })
    .from(goodsReceipt)
    .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.orderId))
    .where(eq(purchaseOrder.supplierId, supplierId));
  return row?.last ?? null;
}

const expired = (anchor: string, today: BusinessDate, years: number): boolean =>
  today >= idNumberRetainedUntil(anchor, years);

async function lockRow(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(supplier)
    .where(eq(supplier.id, id))
    .for("update");
  return row;
}

async function purgeTaxFile(
  db: Database,
  actor: ActivityActor,
  id: string,
  today: BusinessDate,
  years: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const row = await lockRow(tx, id);
    if (!row?.taxIdentityEnc) return false;
    const anchor = await lastReceiptDate(tx, id);
    if (anchor === null || !expired(anchor, today, years)) return false;
    await tx
      .update(supplier)
      .set({ taxIdentityEnc: null })
      .where(eq(supplier.id, id));
    await logActivity(tx, actor, {
      action: "ANONYMIZE",
      document: { type: "SUPPLIER", id, code: row.code },
      summary: "Xóa hồ sơ thuế đã hết thời hạn giữ",
      sensitive: true,
    });
    return true;
  });
}

/**
 * Counted from the later of the last receipt and the day the CCCD was typed
 * in, so one entered again today is kept (0.2 số 166); the creation day when
 * neither is known.
 */
export function retentionAnchor(
  lastReceipt: string | null,
  savedAt: Date | null,
  createdAt: Date,
): string {
  const saved = savedAt === null ? null : toBusinessDate(savedAt);
  if (lastReceipt === null) return saved ?? toBusinessDate(createdAt);
  return saved !== null && saved > lastReceipt ? saved : lastReceipt;
}

async function purgeIdNumber(
  db: Database,
  actor: ActivityActor,
  id: string,
  today: BusinessDate,
  years: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const row = await lockRow(tx, id);
    if (!row?.idNumberLast4 || row.anonymizedAt) return false;
    const anchor = retentionAnchor(
      await lastReceiptDate(tx, id),
      row.idNumberSavedAt,
      row.createdAt,
    );
    if (!expired(anchor, today, years)) return false;
    await tx
      .update(supplier)
      .set({ idNumberEnc: null, idNumberLast4: null })
      .where(eq(supplier.id, id));
    const changes: FieldChange[] = [
      {
        field: "idNumber",
        label: "Số CCCD",
        before: maskIdNumber(row.idNumberLast4),
        after: null,
      },
    ];
    await logActivity(tx, actor, {
      action: "UPDATE",
      document: { type: "SUPPLIER", id, code: row.code },
      summary: changeSummary(changes),
      changes,
      sensitive: true,
    });
    return true;
  });
}

async function purgeEach(
  ids: readonly { id: string }[],
  purge: (id: string) => Promise<boolean>,
): Promise<number> {
  let done = 0;
  for (const { id } of ids) {
    if (await purge(id)) done += 1;
  }
  return done;
}

export async function purgeExpiredPii(
  db: Database,
  actor: ActivityActor,
  options: PurgeOptions = {},
): Promise<PurgeResult> {
  const today = options.today ?? toBusinessDate(new Date());
  const years = options.years ?? ID_NUMBER_RETENTION_YEARS;
  const taxFiles = await db
    .select({ id: supplier.id })
    .from(supplier)
    .where(isNotNull(supplier.taxIdentityEnc));
  const idNumbers = await db
    .select({ id: supplier.id })
    .from(supplier)
    .where(
      sql`${supplier.idNumberEnc} is not null and ${supplier.anonymizedAt} is null`,
    );
  return {
    taxFiles: await purgeEach(taxFiles, (id) =>
      purgeTaxFile(db, actor, id, today, years),
    ),
    idNumbers: await purgeEach(idNumbers, (id) =>
      purgeIdNumber(db, actor, id, today, years),
    ),
  };
}

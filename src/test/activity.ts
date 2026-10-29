// Integration-test helpers for the activity log (activity-log design D5).
import { asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { activityLog } from "@/db/schema";

export type ActivityRow = typeof activityLog.$inferSelect;

/** Every row, oldest first; with `code`, only that document's. */
export async function activityRows(
  db: Database,
  code?: string,
): Promise<ActivityRow[]> {
  const query = db.select().from(activityLog);
  const filtered =
    code === undefined
      ? query
      : query.where(eq(activityLog.documentCode, code));
  return filtered.orderBy(asc(activityLog.id));
}

/** The newest row of a document (or of all), or undefined. */
export async function lastActivity(
  db: Database,
  code?: string,
): Promise<ActivityRow | undefined> {
  return (await activityRows(db, code)).at(-1);
}

/** "CREATE PO-2026-001" lines, oldest first, for compact expectations. */
export async function activityTrail(
  db: Database,
  code?: string,
): Promise<string[]> {
  return (await activityRows(db, code)).map(
    (row) => `${row.action} ${row.documentCode ?? "–"}`,
  );
}

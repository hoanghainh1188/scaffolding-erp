// The one way to write the activity log (activity-log design D4): inside the
// transaction of the action, so a rolled-back action leaves no row and a
// failed log write rolls the action back.
import {
  WORKING_HOURS,
  isOffHours,
  type ActivityAction,
  type ActivityFlag,
  type DocumentType,
  type WorkingHours,
} from "@/domain/activity";
import { capChanges, type FieldChange } from "@/domain/activity-changes";
import { clampSummary } from "@/domain/activity-summary";
import type { Database } from "@/db/client";
import { activityLog } from "@/db/schema";

import type { ActivityActor } from "./actor";

/** A transaction handle: logActivity never takes the plain database. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ActivityDocument {
  type: DocumentType;
  id: string;
  /** The code D18 shows; null for a document without one (scrap price). */
  code: string | null;
}

export interface ActivityEntry {
  action: ActivityAction;
  /** Required for every action but SIGN_IN. */
  document?: ActivityDocument;
  summary: string;
  changes?: readonly FieldChange[];
  /** A confirmed anomaly: overrides on a receipt, high repair cost... (D8). */
  anomaly?: boolean;
  /**
   * Masked CCCD / bank account in `changes` (touchesSensitive), a role, a
   * lock state or a password reset (D8).
   */
  sensitive?: boolean;
}

export interface LogOptions {
  now?: Date;
  workingHours?: WorkingHours;
}

/** The flags of a row, in a stable order (design D8). */
export function activityFlags(
  entry: ActivityEntry,
  at: Date,
  hours: WorkingHours,
): ActivityFlag[] {
  const flags: ActivityFlag[] = [];
  if (isOffHours(at, hours)) flags.push("OFF_HOURS");
  if (entry.sensitive) flags.push("SENSITIVE");
  if (entry.anomaly) flags.push("ANOMALY");
  return flags;
}

/**
 * Appends one row. An UPDATE with no changed field writes nothing (design
 * D6): callers pass the diff and need not check it themselves.
 */
export async function logActivity(
  tx: Tx,
  actor: ActivityActor,
  entry: ActivityEntry,
  options: LogOptions = {},
): Promise<void> {
  const changes = entry.changes ?? [];
  if (entry.action === "UPDATE" && entry.changes && changes.length === 0) {
    return;
  }
  if (entry.action !== "SIGN_IN" && !entry.document) {
    throw new Error(`activity ${entry.action} needs a document`);
  }
  const at = options.now ?? new Date();
  await tx.insert(activityLog).values({
    createdAt: at,
    userId: actor.id,
    role: actor.role,
    device: actor.device,
    browser: actor.browser,
    action: entry.action,
    documentType: entry.document?.type ?? null,
    documentId: entry.document?.id ?? null,
    documentCode: entry.document?.code ?? null,
    summary: clampSummary(entry.summary),
    changes: capChanges(changes),
    flags: activityFlags(entry, at, options.workingHours ?? WORKING_HOURS),
  });
}

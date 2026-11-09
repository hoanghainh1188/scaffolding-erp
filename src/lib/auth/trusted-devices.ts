// Devices trusted to skip the code step (director-mfa design D11). Better
// Auth keeps them as `verification` rows named `trust-device-*` whose value
// is the user id; its own disable only forgets the device making the call.
import { and, count, eq, gt, like } from "drizzle-orm";

import type { Database } from "@/db/client";
import { verification } from "@/db/schema";

import type { Executor } from "./credentials";

const TRUSTED = like(verification.identifier, "trust-device-%");

/** Every device of this user must enter a code again. Returns how many. */
export async function forgetTrustedDevices(
  tx: Executor,
  userId: string,
): Promise<number> {
  const removed = await tx
    .delete(verification)
    .where(and(TRUSTED, eq(verification.value, userId)))
    .returning({ id: verification.id });
  return removed.length;
}

export async function countTrustedDevices(
  db: Database,
  userId: string,
  now: Date,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(verification)
    .where(
      and(
        TRUSTED,
        eq(verification.value, userId),
        gt(verification.expiresAt, now),
      ),
    );
  return row?.value ?? 0;
}

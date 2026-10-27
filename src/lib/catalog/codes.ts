import { eq, sql } from "drizzle-orm";

import { item, kit } from "@/db/schema";
import type { Executor } from "@/lib/auth/credentials";

import { COMMON_MESSAGES, ServiceFailure, conflict } from "./common";

/**
 * Items and kits share one code space (master-data design D1). Two tables
 * cannot enforce that with an index, so creating either takes this lock
 * and checks both tables inside the same transaction.
 */
export async function claimItemOrKitCode(
  tx: Executor,
  code: string,
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('catalog-code'))`);
  const [usedByItem] = await tx
    .select({ id: item.id })
    .from(item)
    .where(eq(item.code, code));
  const [usedByKit] = await tx
    .select({ id: kit.id })
    .from(kit)
    .where(eq(kit.code, code));
  if (usedByItem || usedByKit) {
    throw new ServiceFailure(conflict(COMMON_MESSAGES.codeTaken));
  }
}

// Yearly document numbers (inventory-ledger design D8): ĐC-2026-004.
import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { documentCounter } from "@/db/schema";
import { formatDocumentCode } from "@/domain/stock-adjustment";

type Tx = Pick<Database, "insert">;

/**
 * The next code for a prefix in a year, taken in the caller's transaction
 * (the row lock of the upsert makes two callers get two numbers).
 */
export async function nextDocumentCode(
  tx: Tx,
  prefix: string,
  year: number,
): Promise<string> {
  const [row] = await tx
    .insert(documentCounter)
    .values({ prefix, year, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [documentCounter.prefix, documentCounter.year],
      set: { lastNumber: sql`${documentCounter.lastNumber} + 1` },
    })
    .returning({ lastNumber: documentCounter.lastNumber });
  return formatDocumentCode(prefix, year, row?.lastNumber ?? 1);
}

// Sample repair slips for `npm run db:seed:dev` (simple-repair design D13):
// numbers continue after PSC-2026-021 (already in the sample ledger), and a
// draft like drawing D12 waits to be posted.
import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { documentCounter, item, repairOrder } from "@/db/schema";
import { toBusinessDate } from "@/domain/business-date";
import { REPAIR_PREFIX } from "@/domain/repair-order";
import type { Actor } from "@/lib/catalog/common";

import { createRepairDraft, defaultRepairLocation } from "./orders";

/** PSC-2026-021 is in the sample ledger; the next slip is 022. */
const SAMPLE_LAST_NUMBER = 21;

/** Seeds once; returns the number of slips added. */
export async function seedRepairs(
  db: Database,
  actor: Actor,
  now: Date = new Date(),
): Promise<number> {
  const [any] = await db
    .select({ id: repairOrder.id })
    .from(repairOrder)
    .limit(1);
  if (any) return 0;
  const today = toBusinessDate(now);
  await db
    .insert(documentCounter)
    .values({
      prefix: REPAIR_PREFIX,
      year: Number(today.slice(0, 4)),
      lastNumber: SAMPLE_LAST_NUMBER,
    })
    .onConflictDoUpdate({
      target: [documentCounter.prefix, documentCounter.year],
      set: {
        lastNumber: sql`greatest(${documentCounter.lastNumber}, ${SAMPLE_LAST_NUMBER})`,
      },
    });
  const yard = await defaultRepairLocation(db);
  const ids = new Map(
    (
      await db
        .select({ id: item.id, code: item.code })
        .from(item)
        .where(sql`${item.code} in ('GG-K17', 'GG-CH')`)
    ).map((row) => [row.code, row.id]),
  );
  if (!yard || ids.size < 2) return 0;
  const created = await createRepairDraft(
    db,
    actor,
    {
      repairDate: today,
      repairedBy: "Tổ anh Hoàng Nam",
      fromLocationId: yard.id,
      toLocationId: yard.id,
      lines: [
        {
          itemId: ids.get("GG-K17"),
          quantityTaken: "40",
          quantityGood: "36",
          quantityScrap: "4",
          repairCost: 1_980_000,
        },
        {
          itemId: ids.get("GG-CH"),
          quantityTaken: "20",
          quantityGood: "20",
          quantityScrap: "0",
          repairCost: 240_000,
        },
      ],
    },
    today,
  );
  if (!created.ok) throw new Error(created.error);
  return 1;
}

// Sample value adjustment for `npm run db:seed:dev` (stock-value-adjustment
// task 7.1): a trip-cost fix of the first sample receipt, waiting for the
// director. Needs seedReceiving first; running it again adds nothing.
import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { stockAdjustment } from "@/db/schema";
import type { Actor } from "@/lib/catalog/common";

import { submitAdjustment } from "./adjustments";
import { receiptOptions } from "./revaluations";
import { createTripAdjustment } from "./trip-adjustments";

/** What the sample says was overpaid on the trip. */
const SAMPLE_OVERCHARGE = 300_000;

/** Number of documents added (0 when one exists or no receipt can take it). */
export async function seedValueAdjustments(
  db: Database,
  accountant: Actor,
): Promise<number> {
  const [any] = await db
    .select({ id: stockAdjustment.id })
    .from(stockAdjustment)
    .where(eq(stockAdjustment.kind, "REVALUE"))
    .limit(1);
  if (any) return 0;
  const receipt = (await receiptOptions(db))
    .filter((option) => option.recordedCost > SAMPLE_OVERCHARGE)
    .sort((a, b) => a.code.localeCompare(b.code))[0];
  if (!receipt) return 0;
  const corrected = receipt.recordedCost - SAMPLE_OVERCHARGE;
  const created = await createTripAdjustment(db, accountant, {
    receiptId: receipt.id,
    correctedTripCost: corrected,
    reason: `Hóa đơn nhà xe ${receipt.code}: chi phí chuyến thật ${corrected.toLocaleString("vi-VN")} ₫`,
  });
  if (!created.ok) return 0;
  const submitted = await submitAdjustment(db, accountant, created.data.id);
  return submitted.ok ? 1 : 0;
}

// Integration-test helpers for personal-data-protection.
import { eq } from "drizzle-orm";

import { purchaseOrder, supplier } from "@/db/schema";

import type { TestContext } from "./auth";

/** The seller's name as an order of that seller shows it. */
export async function getPurchasingOrder(
  ctx: TestContext,
  supplierId: string,
): Promise<string | undefined> {
  const [row] = await ctx.db
    .select({ name: supplier.name })
    .from(purchaseOrder)
    .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .where(eq(purchaseOrder.supplierId, supplierId))
    .limit(1);
  return row?.name;
}

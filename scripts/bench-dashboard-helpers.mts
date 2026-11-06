// Data writers of the dashboard bench (scripts/bench-dashboard.mts): the
// same calls as the integration tests, with the business date of each
// document given, so a year of history goes through the real services.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { location } from "../src/db/schema/index.ts";
import type { BusinessDate } from "../src/domain/business-date.ts";
import { toBusinessDate } from "../src/domain/business-date.ts";
import { postMovements } from "../src/lib/inventory/post.ts";
import type { TestContext } from "../src/test/auth.ts";
import type { ContractFixture } from "../src/test/contracts.ts";
import type { DeliveryFixture } from "../src/test/deliveries.ts";
import { deliverMore } from "../src/test/returns.ts";

export { approvedContract } from "../src/test/deliveries.ts";

/** What every bench contract receives once. */
const PICKS = [
  ["GG-K17", "GOOD", 10],
  ["GG-CH", "GOOD", 20],
  ["GG-M16", "GOOD", 5],
] as const;

/** Enough yard stock for every contract, a day before the first one. */
export async function openingAt(
  ctx: TestContext,
  fx: ContractFixture,
  now: Date,
  contracts: number,
): Promise<string> {
  const [yard] = await ctx.db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  if (!yard) throw new Error("no BAI-01");
  const businessDate: BusinessDate = toBusinessDate(now);
  await ctx.db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "TEST",
        documentId: null,
        documentCode: `BENCH-OPEN-${randomUUID().slice(0, 8)}`,
        businessDate,
        lines: PICKS.map(([code, condition, pieces]) => ({
          itemId: fx.item(code),
          condition,
          locationId: yard.id,
          movement: "OPENING" as const,
          quantityMilli: pieces * contracts * 1000,
          amount: pieces * contracts * 100_000,
          description: "bench",
        })),
      },
      businessDate,
    ),
  );
  return yard.id;
}

/** One posted delivery of PICKS to the contract on `now`. */
export function deliverMoreAt(
  ctx: TestContext,
  fx: Omit<DeliveryFixture, "place">,
  contractId: string,
  now: Date,
): Promise<void> {
  return deliverMore(
    ctx,
    { ...fx, place: async () => fx.yard },
    contractId,
    PICKS.map(([code, condition, pieces]) => [code, condition, pieces]),
    now,
  );
}

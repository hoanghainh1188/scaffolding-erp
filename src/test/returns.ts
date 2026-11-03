// Integration-test helpers for return notes (returns-and-compensation tasks
// 3.x): the D5 rental, approved and delivered once, so its site has
// 30 GG-K17 Mới + 90 Tốt, 260 GG-CH Tốt and 60 GG-M16 Tốt.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { deliveryNoteLine, site } from "@/db/schema";
import {
  postReturn,
  type PostReturnBody,
  type ReturnLineBody,
} from "@/lib/returns/post";

import type { TestContext } from "./auth";
import {
  approvedRental,
  confirm,
  NOW,
  planned,
  setupDeliveryFixture,
  started,
  type DeliveryFixture,
} from "./deliveries";

/** "Today" of every return test: Thursday 05/11/2026, 09:40 in Vietnam. */
export const RETURN_NOW = new Date("2026-11-05T02:40:00Z");

export interface ReturnFixture extends DeliveryFixture {
  deal: { id: string; code: string };
  /** The SITE location of the contract. */
  siteLocation: string;
}

export async function setupReturnFixture(
  ctx: TestContext,
): Promise<ReturnFixture> {
  const fx = await setupDeliveryFixture(ctx);
  const deal = await approvedRental(ctx, fx);
  await deliverMore(ctx, fx, deal.id, [
    ["GG-K17", "NEW", 30],
    ["GG-K17", "GOOD", 90],
    ["GG-CH", "GOOD", 260],
    ["GG-M16", "GOOD", 60],
  ]);
  const [work] = await ctx.db
    .select({ locationId: site.locationId })
    .from(site)
    .where(eq(site.id, fx.site("Trường THCS Dương Nội")));
  return { ...fx, deal, siteLocation: work?.locationId ?? "" };
}

/** One more posted delivery of these picks to the contract's site. */
export async function deliverMore(
  ctx: TestContext,
  fx: DeliveryFixture,
  contractId: string,
  picks: readonly [string, "NEW" | "GOOD", number][],
  now: Date = NOW,
): Promise<void> {
  const totals = new Map<string, number>();
  for (const [code, , count] of picks) {
    totals.set(code, (totals.get(code) ?? 0) + count);
  }
  const note = await planned(ctx, fx, {
    contractId,
    lines: [...totals].map(([code, count]) => ({
      itemId: fx.item(code),
      quantity: String(count),
    })),
    overContractConfirmed: true,
  });
  const version = await started(ctx, fx, note.id, now);
  const lines = await ctx.db
    .select({ id: deliveryNoteLine.id, itemId: deliveryNoteLine.itemId })
    .from(deliveryNoteLine)
    .where(eq(deliveryNoteLine.noteId, note.id));
  const lineOf = (code: string) =>
    lines.find((row) => row.itemId === fx.item(code))?.id ?? "";
  const result = await confirm(
    ctx,
    fx,
    note.id,
    version,
    picks.map(([code, condition, count]) => ({
      lineId: lineOf(code),
      condition,
      quantity: String(count),
    })),
    { now },
  );
  if (!result.ok) throw new Error(result.error);
}

export type Counts = [good: number, repair: number, scrap: number, lost: number];

export const lineBody = (
  itemId: string,
  [good, repair, scrap, lost]: Counts,
): ReturnLineBody => ({
  itemId,
  good: String(good),
  repair: String(repair),
  scrap: String(scrap),
  lost: String(lost),
});

/** vantung saves a return note of these lines to BAI-01. */
export function returnOf(
  ctx: TestContext,
  fx: ReturnFixture,
  lines: Record<string, Counts>,
  options: {
    draftId?: string;
    now?: Date;
    actor?: ReturnFixture["warehouse"];
    body?: Partial<PostReturnBody>;
  } = {},
) {
  return postReturn(
    ctx.db,
    options.actor ?? fx.warehouse,
    {
      clientDraftId: options.draftId ?? randomUUID(),
      contractId: fx.deal.id,
      yardLocationId: fx.yard,
      vehiclePlate: "29C-456.78",
      lines: Object.entries(lines).map(([code, counts]) =>
        lineBody(fx.item(code), counts),
      ),
      ...options.body,
    },
    { now: options.now ?? RETURN_NOW },
  );
}

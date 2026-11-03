// Integration-test helpers for site-operations (tasks 3.x–5.x): the D5
// rental moved to An Phú – Block B and delivered there (20 GG-K17 Mới + 100
// Tốt, 260 GG-CH Tốt, 60 GG-M16 Tốt), and the D5 rental at Dương Nội,
// approved but not delivered, to receive transfers. Both are Minh Phát's.
import { eq } from "drizzle-orm";

import { site } from "@/db/schema";
import {
  createAndPostSiteTransfer,
  type PostedTransfer,
} from "@/lib/site-transfers/post";
import {
  createSiteTransfer,
  type TransferBody,
} from "@/lib/site-transfers/service";

import type { TestContext } from "./auth";
import { d5Rental } from "./contracts";
import {
  approvedContract,
  approvedRental,
  setupDeliveryFixture,
  type DeliveryFixture,
} from "./deliveries";
import { deliverMore } from "./returns";

/** "Today" of the site tests: Thursday 05/11/2026, 15:30 in Vietnam. */
export const SITE_NOW = new Date("2026-11-05T08:30:00Z");

export interface SiteFixture extends DeliveryFixture {
  /** An Phú – Block B, running, goods on site. */
  from: { id: string; code: string };
  /** Dương Nội, approved, nothing delivered. */
  to: { id: string; code: string };
  fromLocation: string;
  toLocation: string;
}

async function locationOf(ctx: TestContext, siteId: string): Promise<string> {
  const [row] = await ctx.db
    .select({ locationId: site.locationId })
    .from(site)
    .where(eq(site.id, siteId));
  return row?.locationId ?? "";
}

export async function setupSiteFixture(ctx: TestContext): Promise<SiteFixture> {
  const fx = await setupDeliveryFixture(ctx);
  const anPhu = fx.site("Chung cư An Phú – Block B");
  const from = await approvedContract(ctx, fx, {
    ...d5Rental(fx),
    siteId: anPhu,
  });
  await deliverMore(ctx, fx, from.id, [
    ["GG-K17", "NEW", 20],
    ["GG-K17", "GOOD", 100],
    ["GG-CH", "GOOD", 260],
    ["GG-M16", "GOOD", 60],
  ]);
  const to = await approvedRental(ctx, fx);
  return {
    ...fx,
    from,
    to,
    fromLocation: await locationOf(ctx, anPhu),
    toLocation: await locationOf(ctx, fx.site("Trường THCS Dương Nội")),
  };
}

/** A transfer body from An Phú to Dương Nội of these counts. */
export function transferBody(
  fx: SiteFixture,
  counts: Record<string, number>,
  extra: Partial<TransferBody> = {},
): TransferBody {
  return {
    fromContractId: fx.from.id,
    toContractId: fx.to.id,
    lines: Object.entries(counts).map(([code, count]) => ({
      itemId: fx.item(code),
      quantity: String(count),
    })),
    vehiclePlate: "29C-456.78",
    ...extra,
  };
}

/** quocbao saves a draft that must save. */
export async function draftTransfer(
  ctx: TestContext,
  fx: SiteFixture,
  counts: Record<string, number>,
  extra: Partial<TransferBody> = {},
  now: Date = SITE_NOW,
) {
  const saved = await createSiteTransfer(
    ctx.db,
    fx.sales,
    transferBody(fx, counts, extra),
    { now },
  );
  if (!saved.ok) throw new Error(saved.error);
  return saved.data;
}

/** quocbao confirms a transfer at once; it must post. */
export async function movedNow(
  ctx: TestContext,
  fx: SiteFixture,
  counts: Record<string, number>,
  extra: Partial<TransferBody> = {},
  now: Date = SITE_NOW,
): Promise<PostedTransfer> {
  const posted = await createAndPostSiteTransfer(
    ctx.db,
    fx.sales,
    transferBody(fx, counts, extra),
    { now },
  );
  if (!posted.ok) throw new Error(posted.error);
  return posted.data;
}

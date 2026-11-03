// Integration-test helpers for delivery notes (deliveries tasks 3.x): the
// contract fixture, stock at BAI-01 and an approved rental of drawing D5
// (BO-17 × 300 = 600 GG-K17, 600 GG-CH, 300 GG-M16, plus 400 PK-KU).
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { location } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import { approveContract, submitContract } from "@/lib/contracts/approval";
import type { ContractBody } from "@/lib/contracts/service";
import { createContract } from "@/lib/contracts/service";
import { postDelivery, type PickBody } from "@/lib/deliveries/post";
import {
  changeDeliveryStatus,
  createDelivery,
  type DeliveryBody,
} from "@/lib/deliveries/service";
import { postMovements } from "@/lib/inventory/post";

import type { TestContext } from "./auth";
import {
  d5Rental,
  kgSale,
  setupContractFixture,
  type ContractFixture,
} from "./contracts";

/** "Today" of every delivery test: Tuesday 03/11/2026, 10:42 in Vietnam. */
export const NOW = new Date("2026-11-03T03:42:00Z");
export const TODAY = "2026-11-03" as BusinessDate;

export interface DeliveryFixture extends ContractFixture {
  yard: string;
  /** Location id by code. */
  place: (code: string) => Promise<string>;
}

/** Stock at BAI-01 used by most tests (OPENING on 01/11/2026). */
const OPENING: [string, Condition, number, number][] = [
  ["GG-K17", "GOOD", 1240, 195_000],
  ["GG-K17", "NEW", 100, 210_000],
  ["GG-CH", "NEW", 300, 60_000],
  ["GG-CH", "GOOD", 2480, 52_000],
  ["GG-M16", "GOOD", 640, 120_000],
  ["GG-M16", "NEEDS_REPAIR", 20, 90_000],
  ["GG-M16", "SCRAP", 10, 50_000],
  ["PK-KU", "NEW", 1000, 30_000],
];

export async function setupDeliveryFixture(
  ctx: TestContext,
): Promise<DeliveryFixture> {
  const fx = await setupContractFixture(ctx);
  const place = async (code: string) => {
    const [row] = await ctx.db
      .select({ id: location.id })
      .from(location)
      .where(eq(location.code, code));
    if (!row) throw new Error(`no location ${code}`);
    return row.id;
  };
  const yard = await place("BAI-01");
  await stockUp(ctx, fx, yard, OPENING);
  return { ...fx, yard, place };
}

export async function stockUp(
  ctx: TestContext,
  fx: ContractFixture,
  locationId: string,
  rows: readonly [string, Condition, number, number][],
): Promise<void> {
  await ctx.db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "TEST",
        documentId: null,
        documentCode: `TEST-OPEN-${randomUUID().slice(0, 8)}`,
        businessDate: "2026-11-01" as BusinessDate,
        lines: rows.map(([code, condition, pieces, cost]) => ({
          itemId: fx.item(code),
          condition,
          locationId,
          movement: "OPENING" as const,
          quantityMilli: pieces * 1000,
          amount: pieces * cost,
          description: "test",
        })),
      },
      TODAY,
    ),
  );
}

/** A contract created by quocbao and approved by the director. */
export async function approvedContract(
  ctx: TestContext,
  fx: ContractFixture,
  body: ContractBody,
): Promise<{ id: string; code: string }> {
  const saved = await createContract(ctx.db, fx.sales, body);
  if (!saved.ok) throw new Error(saved.error);
  const sent = await submitContract(ctx.db, fx.sales, saved.data.id);
  if (!sent.ok) throw new Error(sent.error);
  const approved = await approveContract(
    ctx.db,
    fx.director,
    saved.data.id,
    null,
  );
  if (!approved.ok) throw new Error(approved.error);
  return { id: saved.data.id, code: saved.data.code };
}

export const approvedRental = (ctx: TestContext, fx: ContractFixture) =>
  approvedContract(ctx, fx, d5Rental(fx));

export const approvedKgSale = (ctx: TestContext, fx: ContractFixture) =>
  approvedContract(ctx, fx, kgSale(fx));

/** A batch by quocbao that must save. */
export async function planned(
  ctx: TestContext,
  fx: ContractFixture,
  body: DeliveryBody,
) {
  const saved = await createDelivery(ctx.db, fx.sales, body, { now: NOW });
  if (!saved.ok) throw new Error(saved.error);
  return saved.data;
}

/** vantung starts picking; returns the version the phone keeps. */
export async function started(
  ctx: TestContext,
  fx: ContractFixture,
  noteId: string,
  now: Date = NOW,
) {
  const result = await changeDeliveryStatus(
    ctx.db,
    fx.warehouse,
    noteId,
    "START",
    null,
    { now },
  );
  if (!result.ok) throw new Error(result.error);
  return result.data.updatedAt;
}

/** vantung confirms the truck leaving with these picks. */
export function confirm(
  ctx: TestContext,
  fx: ContractFixture,
  noteId: string,
  startedVersion: string,
  picks: PickBody[],
  options: {
    draftId?: string;
    now?: Date;
    actor?: ContractFixture["warehouse"];
  } = {},
) {
  return postDelivery(
    ctx.db,
    options.actor ?? fx.warehouse,
    noteId,
    {
      clientDraftId: options.draftId ?? randomUUID(),
      startedVersion,
      vehiclePlate: "51X-000.01",
      departedAt: (options.now ?? NOW).toISOString(),
      picks,
    },
    { now: options.now ?? NOW },
  );
}

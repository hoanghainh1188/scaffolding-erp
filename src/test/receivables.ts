// Integration-test helpers for receivables (tasks 3.x–5.x): the D5 rental of
// Minh Phát (NT-0001) delivered once, closed periods written straight into
// billing_period, an approved compensation note, a posted sale by kg, and
// receipts recorded by thuha.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  billingPeriod,
  compensationNote,
  contractRevision,
  deliveryNoteLine,
} from "@/db/schema";
import { addDays, type BusinessDate } from "@/domain/business-date";
import { approveCompensation } from "@/lib/compensations/service";
import type { ContractBody } from "@/lib/contracts/service";

import type { TestContext } from "./auth";
import { kgSale } from "./contracts";
import { approvedContract, confirm, planned, started } from "./deliveries";
import { returnOf, setupReturnFixture, type ReturnFixture } from "./returns";

export type ReceivableFixture = ReturnFixture & {
  /** Minh Phát. */
  customerId: string;
};

export async function setupReceivableFixture(
  ctx: TestContext,
): Promise<ReceivableFixture> {
  const fx = await setupReturnFixture(ctx);
  return { ...fx, customerId: fx.customer("NT-0001") };
}

const monthEnd = (month: string): string => {
  const [year, mm] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year ?? 0, mm ?? 1, 0));
  return last.toISOString().slice(0, 10);
};

/** A closed period of `month` ("YYYY-MM") owing `total`, due after `terms`. */
export async function closedPeriod(
  ctx: TestContext,
  fx: ReceivableFixture,
  month: string,
  total: number,
  options: {
    terms?: number;
    contractId?: string;
    vat?: number;
    freight?: number;
  } = {},
): Promise<{ id: string; dueDate: string }> {
  const contractId = options.contractId ?? fx.deal.id;
  const [rev] = await ctx.db
    .select({ id: contractRevision.id })
    .from(contractRevision)
    .where(eq(contractRevision.contractId, contractId));
  const terms = options.terms ?? 15;
  const periodEnd = monthEnd(month);
  const dueDate = addDays(periodEnd as BusinessDate, terms);
  const vat = options.vat ?? 0;
  const freight = options.freight ?? 0;
  const [row] = await ctx.db
    .insert(billingPeriod)
    .values({
      contractId,
      month: `${month}-01`,
      periodEnd,
      revisionId: rev?.id ?? "",
      rentAmount: Math.max(total - vat - freight, 0),
      adjustmentAmount: total < 0 ? total : 0,
      freightAmount: freight,
      vatAmount: vat,
      totalAmount: total,
      paymentTermsDays: terms,
      dueDate,
      holidayDays: 0,
      lineCount: 1,
      closedBy: fx.accountant.id,
      closedAt: new Date(),
    })
    .returning({ id: billingPeriod.id });
  return { id: row?.id ?? "", dueDate };
}

/** A return with 2 lost GG-K17, approved by the director on `now`. */
export async function approvedCompensation(
  ctx: TestContext,
  fx: ReceivableFixture,
  now: Date,
  lost = 2,
): Promise<{ id: string; amountDue: number; dueDate: string }> {
  const posted = await returnOf(ctx, fx, { "GG-K17": [0, 0, 0, lost] });
  if (!posted.ok) throw new Error(posted.error);
  const notes = await ctx.db.select().from(compensationNote);
  const note = notes.find((row) => row.status === "PENDING");
  if (!note) throw new Error("no compensation note");
  const approved = await approveCompensation(
    ctx.db,
    fx.director,
    note.id,
    { updatedAt: note.updatedAt.toISOString(), approvalReason: "Duyệt thử" },
    { now },
  );
  if (!approved.ok) throw new Error(approved.error);
  return {
    id: note.id,
    amountDue: approved.data.amountDue ?? 0,
    dueDate: approved.data.dueDate ?? "",
  };
}

/** A sale by kg to `customerCode`, delivered: 90 GG-K17, 1.250,5 kg. */
export async function deliveredSale(
  ctx: TestContext,
  fx: ReceivableFixture,
  extra: Partial<ContractBody> = {},
  now?: Date,
): Promise<{ contractId: string; noteId: string; code: string }> {
  const deal = await approvedContract(ctx, fx, { ...kgSale(fx), ...extra });
  const note = await planned(ctx, fx, {
    contractId: deal.id,
    lines: [
      {
        itemId: fx.item("GG-K17"),
        condition: "GOOD",
        pricingUnit: "KG",
        quantity: "1250,5",
      },
    ],
  });
  const version = await started(ctx, fx, note.id, now);
  const [line] = await ctx.db
    .select({ id: deliveryNoteLine.id })
    .from(deliveryNoteLine)
    .where(eq(deliveryNoteLine.noteId, note.id));
  const result = await confirm(
    ctx,
    fx,
    note.id,
    version,
    [
      {
        lineId: line?.id ?? "",
        condition: "GOOD",
        quantity: "90",
        weighedKg: "1250,5",
      },
    ],
    { now },
  );
  if (!result.ok) throw new Error(result.error);
  return { contractId: deal.id, noteId: note.id, code: note.code };
}

export const requestId = (): string => randomUUID();

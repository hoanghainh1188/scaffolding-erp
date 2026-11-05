// Compensation notes on D8 (returns-and-compensation design D3, D5, D7; 0.2
// #20, #64): the director fills prices the contract lacked, gives a
// discount with a reason, approves or rejects. Each command locks the note
// first, checks the version the screen read, then writes one activity row.
import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  compensationNote,
  compensationNoteLine,
  contract,
  contractRevision,
  item,
} from "@/db/schema";
import {
  diffFields,
  type FieldChange,
  type FieldSpec,
} from "@/domain/activity-changes";
import { formatMoney, toMoney } from "@/domain/money";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import {
  amountDue,
  assertDiscount,
  assertPriced,
  COMPENSATION_KIND_LABELS,
  COMPENSATION_KINDS,
  COMPENSATION_MESSAGES,
  compensationTotal,
  dueDate,
  reasonOrNull,
  transition,
  type CompensationCommand,
  type CompensationKind,
  type CompensationStatus,
  type PricedLine,
} from "@/domain/compensation";
import { DomainValueError } from "@/domain/errors";
import { can } from "@/domain/permissions";
import {
  approvedSummary,
  priceChangeText,
  rejectedSummary,
} from "@/domain/return-summary";
import { logActivity } from "@/lib/activity/log";
import {
  conflict,
  notFound,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import {
  forbidden,
  run,
  type ContractActor,
  type Tx,
} from "@/lib/contracts/common";
import { overdueDebt } from "@/lib/contracts/overdue";
import { prepaymentSuffix, settleCredits } from "@/lib/receivables/credits";
import { isUuid, milliOf } from "@/lib/deliveries/records";

import { COMPENSATION_DOCUMENT_TYPE } from "./create";

export interface CompensationEditBody {
  updatedAt?: string;
  prices?: { itemId?: string; kind?: string; unitPrice?: number | null }[];
  discountAmount?: number;
  discountReason?: string | null;
}

export interface CompensationApproveBody {
  updatedAt?: string;
  approvalReason?: string | null;
  /** Saved together with the approval (D8 sends what is on screen). */
  discountAmount?: number;
  discountReason?: string | null;
  prices?: CompensationEditBody["prices"];
}

export interface CompensationRejectBody {
  updatedAt?: string;
  reason?: string | null;
}

export interface MovedCompensation {
  id: string;
  code: string;
  status: CompensationStatus;
  amountDue: number | null;
  dueDate: string | null;
  updatedAt: string;
}

export interface CompensationOptions {
  now?: Date;
}

type NoteRow = typeof compensationNote.$inferSelect;

interface LineRow {
  itemId: string;
  itemCode: string;
  kind: CompensationKind;
  quantityMilli: number;
  unitPrice: number | null;
  contractPrice: number | null;
}

function assertApprover(actor: ContractActor): void {
  if (!can(actor.role, "compensations.approve")) {
    throw new ServiceFailure(forbidden());
  }
}

async function lockNote(tx: Tx, id: string): Promise<NoteRow> {
  if (!isUuid(id)) throw new ServiceFailure(notFound());
  const [row] = await tx
    .select()
    .from(compensationNote)
    .where(eq(compensationNote.id, id))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return row;
}

async function linesOf(tx: Tx, noteId: string): Promise<LineRow[]> {
  const rows = await tx
    .select({
      itemId: compensationNoteLine.itemId,
      itemCode: item.code,
      kind: compensationNoteLine.kind,
      quantity: compensationNoteLine.quantity,
      unitPrice: compensationNoteLine.unitPrice,
      contractPrice: compensationNoteLine.contractPrice,
    })
    .from(compensationNoteLine)
    .innerJoin(item, eq(item.id, compensationNoteLine.itemId))
    .where(eq(compensationNoteLine.noteId, noteId));
  return rows.map((row) => ({
    ...row,
    kind: row.kind as CompensationKind,
    quantityMilli: milliOf(row.quantity),
  }));
}

/** The note FOR UPDATE, in the state the command may act on. */
async function opened(
  tx: Tx,
  id: string,
  updatedAt: string | undefined,
  command: CompensationCommand,
): Promise<NoteRow> {
  const note = await lockNote(tx, id);
  transition(note.status as CompensationStatus, command);
  if (
    !updatedAt ||
    new Date(updatedAt).getTime() !== note.updatedAt.getTime()
  ) {
    throw new ServiceFailure(conflict(COMPENSATION_MESSAGES.stale));
  }
  return note;
}

const kindOf = (value: string | undefined): CompensationKind | null =>
  (COMPENSATION_KINDS as readonly string[]).includes(value ?? "")
    ? (value as CompensationKind)
    : null;

const money = (value: number | null) =>
  value === null ? null : formatMoney(toMoney(value));

/** Applies the prices typed for lines the contract had no price for. */
async function applyPrices(
  tx: Tx,
  noteId: string,
  lines: LineRow[],
  prices: CompensationEditBody["prices"],
): Promise<{ lines: LineRow[]; changed: string[]; fields: FieldChange[] }> {
  const changed: string[] = [];
  const fields: FieldChange[] = [];
  const next = lines.map((line) => ({ ...line }));
  for (const entry of prices ?? []) {
    const kind = kindOf(entry.kind);
    const line = next.find(
      (row) => row.itemId === entry.itemId && row.kind === kind,
    );
    if (!line || kind === null) continue;
    const price = entry.unitPrice ?? null;
    if (price === line.unitPrice) continue;
    if (line.contractPrice !== null) {
      throw new DomainValueError(
        COMPENSATION_MESSAGES.priceKnown(line.itemCode, kind),
      );
    }
    if (price !== null && (!Number.isInteger(price) || price < 0)) {
      throw new DomainValueError(COMPENSATION_MESSAGES.badPrice);
    }
    changed.push(priceChangeText(line.itemCode, kind, line.unitPrice, price));
    fields.push({
      field: `price.${line.itemCode}.${kind}`,
      label: `Đơn giá ${line.itemCode} ${COMPENSATION_KIND_LABELS[kind]}`,
      before: money(line.unitPrice),
      after: money(price),
    });
    line.unitPrice = price;
    await tx
      .update(compensationNoteLine)
      .set({ unitPrice: price })
      .where(
        and(
          eq(compensationNoteLine.noteId, noteId),
          eq(compensationNoteLine.itemId, line.itemId),
          eq(compensationNoteLine.kind, kind),
        ),
      );
  }
  return { lines: next, changed, fields };
}

const priced = (lines: readonly LineRow[]): PricedLine[] =>
  lines.map((line) => ({
    itemCode: line.itemCode,
    kind: line.kind,
    quantityMilli: line.quantityMilli,
    unitPrice: line.unitPrice,
  }));

const moved = (
  note: NoteRow,
  status: CompensationStatus,
  updatedAt: Date,
  extra: { amountDue?: number | null; dueDate?: string | null } = {},
): MovedCompensation => ({
  id: note.id,
  code: note.code,
  status,
  amountDue: extra.amountDue ?? null,
  dueDate: extra.dueDate ?? null,
  updatedAt: updatedAt.toISOString(),
});

const DISCOUNT_FIELDS: readonly FieldSpec<{
  discountAmount: number;
  discountReason: string | null;
}>[] = [
  {
    field: "discountAmount",
    label: "Giảm trừ",
    value: (row) => money(row.discountAmount),
  },
  {
    field: "discountReason",
    label: "Lý do giảm",
    value: (row) => row.discountReason,
  },
];

/** Prices, discount and their reason, saved without changing the status. */
async function saveEdits(
  tx: Tx,
  note: NoteRow,
  body: CompensationEditBody,
  now: Date,
): Promise<{
  lines: LineRow[];
  summary: string[];
  changes: FieldChange[];
  discount: number;
  reason: string | null;
}> {
  const { lines, changed, fields } = await applyPrices(
    tx,
    note.id,
    await linesOf(tx, note.id),
    body.prices,
  );
  const total = compensationTotal(priced(lines));
  const discount = body.discountAmount ?? note.discountAmount;
  const reason = assertDiscount(
    total,
    discount,
    body.discountReason === undefined
      ? note.discountReason
      : body.discountReason,
  );
  const changes = diffFields(
    DISCOUNT_FIELDS,
    {
      discountAmount: note.discountAmount,
      discountReason: note.discountReason,
    },
    { discountAmount: discount, discountReason: reason },
  );
  if (changes.length > 0 || changed.length > 0) {
    await tx
      .update(compensationNote)
      .set({ discountAmount: discount, discountReason: reason, updatedAt: now })
      .where(eq(compensationNote.id, note.id));
  }
  return {
    lines,
    discount,
    reason,
    changes: [...fields, ...changes],
    summary: [
      ...changed,
      ...changes.map(
        (change) =>
          `${change.label.toLocaleLowerCase("vi-VN")}: ${change.before ?? "trống"} → ${change.after ?? "trống"}`,
      ),
    ],
  };
}

/** "Lưu" on D8: prices of unpriced lines and the discount (director only). */
export function updateCompensation(
  db: Database,
  actor: ContractActor,
  id: string,
  body: CompensationEditBody,
  options: CompensationOptions = {},
): Promise<ServiceResult<MovedCompensation>> {
  return run(async () =>
    db.transaction(async (tx) => {
      assertApprover(actor);
      const now = options.now ?? new Date();
      const note = await opened(tx, id, body.updatedAt, "EDIT");
      const saved = await saveEdits(tx, note, body, now);
      if (saved.summary.length === 0) {
        return ok(moved(note, "PENDING", note.updatedAt));
      }
      await logActivity(
        tx,
        actor,
        {
          action: "UPDATE",
          document: {
            type: COMPENSATION_DOCUMENT_TYPE,
            id: note.id,
            code: note.code,
          },
          summary: saved.summary.join("; "),
          changes: saved.changes,
        },
        { now },
      );
      return ok(moved(note, "PENDING", now));
    }),
  );
}

async function paymentTermsDays(tx: Tx, revisionId: string): Promise<number> {
  const [row] = await tx
    .select({ days: contractRevision.paymentTermsDays })
    .from(contractRevision)
    .where(eq(contractRevision.id, revisionId));
  return row?.days ?? 0;
}

async function customerOf(tx: Tx, contractId: string): Promise<string> {
  const [row] = await tx
    .select({ customerId: contract.customerId })
    .from(contract)
    .where(eq(contract.id, contractId));
  return row?.customerId ?? "";
}

/**
 * "Duyệt <tiền>": every line priced, discount with its reason, a reason
 * when the customer is overdue (0.2 #15); stores the amount due and the due
 * date for receivables (design D5).
 */
export function approveCompensation(
  db: Database,
  actor: ContractActor,
  id: string,
  body: CompensationApproveBody,
  options: CompensationOptions = {},
): Promise<ServiceResult<MovedCompensation>> {
  return run(async () =>
    db.transaction(async (tx) => {
      assertApprover(actor);
      const now = options.now ?? new Date();
      const note = await opened(tx, id, body.updatedAt, "APPROVE");
      const saved = await saveEdits(tx, note, body, now);
      assertPriced(priced(saved.lines));
      const customerId = await customerOf(tx, note.contractId);
      const overdue = await overdueDebt(tx, customerId, toBusinessDate(now));
      const reason = reasonOrNull(body.approvalReason);
      if (overdue.amount > 0 && reason === null) {
        throw new DomainValueError(
          COMPENSATION_MESSAGES.overdueReason(overdue.amount, overdue.days),
        );
      }
      const total = compensationTotal(priced(saved.lines));
      const due = amountDue(total, saved.discount);
      const approvedDate: BusinessDate = toBusinessDate(now);
      const payBy = dueDate(
        approvedDate,
        await paymentTermsDays(tx, note.revisionId),
      );
      await tx
        .update(compensationNote)
        .set({
          status: "APPROVED",
          amountDue: due,
          approvalReason: reason,
          approvedBy: actor.id,
          approvedAt: now,
          approvedDate,
          dueDate: payBy,
          updatedAt: now,
        })
        .where(eq(compensationNote.id, note.id));
      // receivables design D3: the prepayment settles the new debt at once.
      const taken = await settleCredits(tx, customerId, actor, approvedDate);
      await logActivity(
        tx,
        actor,
        {
          action: "APPROVE",
          document: {
            type: COMPENSATION_DOCUMENT_TYPE,
            id: note.id,
            code: note.code,
          },
          summary: `${approvedSummary(due, saved.discount, saved.reason, reason)}${prepaymentSuffix(taken)}`,
          anomaly: saved.discount > 0 || overdue.amount > 0,
        },
        { now },
      );
      return ok(
        moved(note, "APPROVED", now, { amountDue: due, dueDate: payBy }),
      );
    }),
  );
}

/** "Từ chối": final, with a reason; nothing is owed (design D3). */
export function rejectCompensation(
  db: Database,
  actor: ContractActor,
  id: string,
  body: CompensationRejectBody,
  options: CompensationOptions = {},
): Promise<ServiceResult<MovedCompensation>> {
  return run(async () =>
    db.transaction(async (tx) => {
      assertApprover(actor);
      const now = options.now ?? new Date();
      const note = await opened(tx, id, body.updatedAt, "REJECT");
      const reason = reasonOrNull(body.reason);
      if (reason === null) {
        throw new DomainValueError(COMPENSATION_MESSAGES.rejectReason);
      }
      const total = compensationTotal(priced(await linesOf(tx, note.id)));
      await tx
        .update(compensationNote)
        .set({
          status: "REJECTED",
          rejectedReason: reason,
          rejectedBy: actor.id,
          rejectedAt: now,
          updatedAt: now,
        })
        .where(eq(compensationNote.id, note.id));
      await logActivity(
        tx,
        actor,
        {
          action: "REJECT",
          document: {
            type: COMPENSATION_DOCUMENT_TYPE,
            id: note.id,
            code: note.code,
          },
          summary: rejectedSummary(total, reason),
        },
        { now },
      );
      return ok(moved(note, "REJECTED", now));
    }),
  );
}

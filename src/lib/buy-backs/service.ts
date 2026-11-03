// Buy-back notes on D6c (site-operations design D5; 0.2 #67, #71): sales
// make and edit a pending note with prices prefilled from the lost price of
// the contract; the director approves (which posts SALE_OUT at the site and
// stops the rent) or rejects. Every command locks the contract, then the
// note, and logs one activity row in the same transaction.
import { asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { buyBackNote, buyBackNoteLine } from "@/db/schema";
import { diffFields, type FieldSpec } from "@/domain/activity-changes";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import {
  allocateBuyBack,
  assertBuyBackLines,
  BUY_BACK_MESSAGES,
  BUY_BACK_PREFIX,
  buyBackDueDate,
  buyBackTotal,
  isOffContractPrice,
  requireBuyBackText,
  transition,
  type BuyBackLineInput,
  type BuyBackStatus,
} from "@/domain/buy-back";
import { amountsText } from "@/domain/delivery-summary";
import { DomainValueError } from "@/domain/errors";
import { formatMoney, toMoney } from "@/domain/money";
import type { MovementDraft } from "@/domain/movement";
import { can } from "@/domain/permissions";
import { parseQuantity } from "@/domain/quantity";
import { buyBackSummary } from "@/domain/site-operations-summary";
import { logActivity } from "@/lib/activity/log";
import {
  conflict,
  notFound,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import {
  assertContractAccess,
  ContractFieldError,
  forbidden,
  run,
  type ContractActor,
  type Tx,
} from "@/lib/contracts/common";
import { overdueDebt } from "@/lib/contracts/overdue";
import { lockContract, type LockedContract } from "@/lib/contracts/records";
import { contractTermsAt, type ContractTerms } from "@/lib/contracts/terms";
import {
  BUY_BACK_DOCUMENT_TYPE,
  db3,
  isUuid,
  itemFacts,
  milliOf,
  onSiteByItemCondition,
  type ItemFacts,
} from "@/lib/deliveries/records";
import { nextDocumentCode } from "@/lib/inventory/counter";
import { postMovements } from "@/lib/inventory/post";
import { contractPlace } from "@/lib/site-transfers/records";

export interface BuyBackBody {
  contractId?: string;
  reason?: string | null;
  lines?: { itemId?: string; quantity?: string; unitPrice?: number | null }[];
  /** Edits: when the note was last saved (409 when stale). */
  updatedAt?: string;
}

export interface BuyBackDecisionBody {
  updatedAt?: string;
  reason?: string | null;
}

export interface SavedBuyBack {
  id: string;
  code: string;
  status: BuyBackStatus;
  updatedAt: string;
  amountDue: number | null;
  dueDate: string | null;
}

export interface BuyBackOptions {
  now?: Date;
}

type NoteRow = typeof buyBackNote.$inferSelect;

const SERVICE_MESSAGES = {
  contract: "Bạn mở phiếu mua lại từ hợp đồng thuê.",
  item: "Bạn chọn mã hàng.",
  price: "Đơn giá mua lại phải là số tiền không âm.",
} as const;

const field = (message: string, name: string) =>
  new ContractFieldError(message, name);

const savedOf = (row: NoteRow): SavedBuyBack => ({
  id: row.id,
  code: row.code,
  status: row.status as BuyBackStatus,
  updatedAt: row.updatedAt.toISOString(),
  amountDue: row.amountDue,
  dueDate: row.dueDate,
});

function assertApprover(actor: ContractActor): void {
  if (!can(actor.role, "buybacks.approve")) {
    throw new ServiceFailure(forbidden());
  }
}

/** The contract must be a running rental with a site (design D5). */
async function siteOf(tx: Tx, locked: LockedContract): Promise<string> {
  if (locked.type !== "RENTAL" || locked.status !== "ACTIVE") {
    throw new DomainValueError(BUY_BACK_MESSAGES.notRental);
  }
  const place = await contractPlace(tx, locked.id);
  if (!place?.siteLocationId) {
    throw new DomainValueError(BUY_BACK_MESSAGES.notRental);
  }
  return place.siteLocationId;
}

const lostPrices = (terms: ContractTerms | null) =>
  new Map(
    (terms?.compensations ?? []).map((entry) => [
      entry.itemId,
      entry.lostPrice,
    ]),
  );

interface Parsed {
  reason: string;
  lines: BuyBackLineInput[];
  facts: Map<string, ItemFacts>;
}

async function parseBody(
  tx: Tx,
  body: BuyBackBody,
  prices: Map<string, number | null>,
): Promise<Parsed> {
  const reason = requireBuyBackText(body.reason, BUY_BACK_MESSAGES.reason);
  const raw = body.lines ?? [];
  const facts = await itemFacts(
    tx,
    raw.map((line) => line.itemId).filter((id): id is string => isUuid(id)),
  );
  const lines = raw.map((line, index): BuyBackLineInput => {
    const info = line.itemId ? facts.get(line.itemId) : undefined;
    if (!info) throw field(SERVICE_MESSAGES.item, `lines.${index}.itemId`);
    let milli = 0;
    try {
      milli = parseQuantity(line.quantity ?? "", info.unit).milli;
    } catch (error: unknown) {
      if (error instanceof DomainValueError) {
        throw field(error.message, `lines.${index}.quantity`);
      }
      throw error;
    }
    const contractPrice = prices.get(info.id) ?? null;
    const unitPrice =
      line.unitPrice === undefined ? contractPrice : line.unitPrice;
    if (unitPrice !== null && (!Number.isInteger(unitPrice) || unitPrice < 0)) {
      throw field(SERVICE_MESSAGES.price, `lines.${index}.unitPrice`);
    }
    return {
      itemId: info.id,
      itemCode: info.code,
      unit: info.unit,
      milli,
      unitPrice,
      contractPrice,
    };
  });
  return { reason, lines, facts };
}

const named = (
  lines: readonly { itemId: string; milli: number }[],
  facts: ReadonlyMap<string, ItemFacts>,
) =>
  lines.map((line) => {
    const info = facts.get(line.itemId) as ItemFacts;
    return {
      itemCode: info.code,
      itemName: info.name,
      unit: info.unit,
      milli: line.milli,
    };
  });

const priced = (lines: readonly BuyBackLineInput[]) =>
  lines.map((line) => ({ milli: line.milli, unitPrice: line.unitPrice ?? 0 }));

async function writeLines(
  tx: Tx,
  noteId: string,
  lines: readonly BuyBackLineInput[],
): Promise<void> {
  await tx.insert(buyBackNoteLine).values(
    lines.map((line, index) => ({
      noteId,
      lineNo: index + 1,
      itemId: line.itemId,
      quantity: db3(line.milli),
      unitPrice: line.unitPrice ?? 0,
      contractPrice: line.contractPrice,
    })),
  );
}

/** "Lưu" on D6c: the note goes straight to Chờ duyệt (0.2 #71). */
export function createBuyBack(
  db: Database,
  actor: ContractActor,
  body: BuyBackBody,
  options: BuyBackOptions = {},
): Promise<ServiceResult<SavedBuyBack>> {
  return run(async () => {
    if (!isUuid(body.contractId)) {
      throw field(SERVICE_MESSAGES.contract, "contractId");
    }
    const contractId = body.contractId;
    const now = options.now ?? new Date();
    const today = toBusinessDate(now);
    const saved = await db.transaction(async (tx) => {
      const locked = await lockContract(tx, contractId);
      assertContractAccess(actor, locked.type, "manage");
      const siteLocationId = await siteOf(tx, locked);
      const terms = await contractTermsAt(tx, locked.id, today);
      if (!terms) throw new DomainValueError(BUY_BACK_MESSAGES.notRental);
      const parsed = await parseBody(tx, body, lostPrices(terms));
      const lines = assertBuyBackLines(
        locked.code,
        parsed.lines,
        await onSiteByItemCondition(tx, locked.id),
      );
      const code = await nextDocumentCode(
        tx,
        BUY_BACK_PREFIX,
        Number(today.slice(0, 4)),
      );
      const [row] = await tx
        .insert(buyBackNote)
        .values({
          code,
          contractId: locked.id,
          siteLocationId,
          revisionId: terms.revisionId,
          reason: parsed.reason,
          createdBy: actor.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const note = row as NoteRow;
      await writeLines(tx, note.id, lines);
      await logActivity(
        tx,
        actor,
        {
          action: "CREATE",
          document: { type: BUY_BACK_DOCUMENT_TYPE, id: note.id, code },
          summary: buyBackSummary(
            named(lines, parsed.facts),
            buyBackTotal(priced(lines)),
          ),
          anomaly: lines.some(isOffContractPrice),
        },
        { now },
      );
      return savedOf(note);
    });
    return ok(saved);
  });
}

/** The note by id or code, then its contract and the note FOR UPDATE. */
async function lockNoteWithContract(
  tx: Tx,
  ref: string,
): Promise<{ locked: LockedContract; note: NoteRow }> {
  const [found] = await tx
    .select({ id: buyBackNote.id, contractId: buyBackNote.contractId })
    .from(buyBackNote)
    .where(isUuid(ref) ? eq(buyBackNote.id, ref) : eq(buyBackNote.code, ref));
  if (!found) throw new ServiceFailure(notFound());
  const locked = await lockContract(tx, found.contractId);
  const [note] = await tx
    .select()
    .from(buyBackNote)
    .where(eq(buyBackNote.id, found.id))
    .for("update");
  if (!note) throw new ServiceFailure(notFound());
  return { locked, note };
}

function assertFresh(note: NoteRow, updatedAt: string | undefined): void {
  if (
    !updatedAt ||
    new Date(updatedAt).getTime() !== note.updatedAt.getTime()
  ) {
    throw new ServiceFailure(conflict(BUY_BACK_MESSAGES.stale));
  }
}

async function storedLines(
  tx: Tx,
  noteId: string,
): Promise<{ lines: BuyBackLineInput[]; facts: Map<string, ItemFacts> }> {
  const rows = await tx
    .select()
    .from(buyBackNoteLine)
    .where(eq(buyBackNoteLine.noteId, noteId))
    .orderBy(asc(buyBackNoteLine.lineNo));
  const facts = await itemFacts(
    tx,
    rows.map((row) => row.itemId),
  );
  return {
    facts,
    lines: rows.map((row) => {
      const info = facts.get(row.itemId) as ItemFacts;
      return {
        itemId: row.itemId,
        itemCode: info.code,
        unit: info.unit,
        milli: milliOf(row.quantity),
        unitPrice: row.unitPrice,
        contractPrice: row.contractPrice,
      };
    }),
  };
}

interface Shown {
  goods: string;
  total: string;
  reason: string;
}

const SHOWN_FIELDS: readonly FieldSpec<Shown>[] = [
  { field: "lines", label: "Hàng", value: (row) => row.goods },
  { field: "total", label: "Tiền bán", value: (row) => row.total },
  { field: "reason", label: "Lý do", value: (row) => row.reason },
];

const shown = (
  lines: readonly BuyBackLineInput[],
  facts: ReadonlyMap<string, ItemFacts>,
  reason: string,
): Shown => ({
  goods: amountsText(named(lines, facts)),
  total: formatMoney(toMoney(buyBackTotal(priced(lines)))),
  reason,
});

/** "Lưu" on a pending note (Kinh doanh, 409 when stale). */
export function updateBuyBack(
  db: Database,
  actor: ContractActor,
  ref: string,
  body: BuyBackBody,
  options: BuyBackOptions = {},
): Promise<ServiceResult<SavedBuyBack>> {
  return run(async () => {
    const now = options.now ?? new Date();
    const today = toBusinessDate(now);
    const saved = await db.transaction(async (tx) => {
      const { locked, note } = await lockNoteWithContract(tx, ref);
      assertContractAccess(actor, locked.type, "manage");
      transition(note.status as BuyBackStatus, "EDIT");
      assertFresh(note, body.updatedAt);
      await siteOf(tx, locked);
      const terms = await contractTermsAt(tx, locked.id, today);
      const parsed = await parseBody(tx, body, lostPrices(terms));
      const lines = assertBuyBackLines(
        locked.code,
        parsed.lines,
        await onSiteByItemCondition(tx, locked.id),
      );
      const before = await storedLines(tx, note.id);
      const changes = diffFields(
        SHOWN_FIELDS,
        shown(before.lines, before.facts, note.reason),
        shown(lines, parsed.facts, parsed.reason),
      );
      if (changes.length === 0) return savedOf(note);
      await tx
        .delete(buyBackNoteLine)
        .where(eq(buyBackNoteLine.noteId, note.id));
      await writeLines(tx, note.id, lines);
      const [row] = await tx
        .update(buyBackNote)
        .set({
          reason: parsed.reason,
          revisionId: terms?.revisionId ?? note.revisionId,
          updatedAt: now,
        })
        .where(eq(buyBackNote.id, note.id))
        .returning();
      await logActivity(
        tx,
        actor,
        {
          action: "UPDATE",
          document: {
            type: BUY_BACK_DOCUMENT_TYPE,
            id: note.id,
            code: note.code,
          },
          summary: changes.map((change) => change.label).join(", "),
          changes,
          anomaly: lines.some(isOffContractPrice),
        },
        { now },
      );
      return savedOf(row as NoteRow);
    });
    return ok(saved);
  });
}

/** Guards the decision commands: a decided note names what happened. */
function decide(note: NoteRow, command: "APPROVE" | "REJECT"): BuyBackStatus {
  if (note.status === "APPROVED") {
    throw new DomainValueError(BUY_BACK_MESSAGES.approvedBy(note.code));
  }
  return transition(note.status as BuyBackStatus, command);
}

/**
 * "Duyệt <tiền>" (design D5): checks the site again, posts SALE_OUT at the
 * site (Mới first), stores the money due and the due date; the rent stops
 * after the approval day.
 */
export function approveBuyBack(
  db: Database,
  actor: ContractActor,
  ref: string,
  body: BuyBackDecisionBody,
  options: BuyBackOptions = {},
): Promise<ServiceResult<SavedBuyBack>> {
  return run(async () => {
    assertApprover(actor);
    const now = options.now ?? new Date();
    const today: BusinessDate = toBusinessDate(now);
    const saved = await db.transaction(async (tx) => {
      const { locked, note } = await lockNoteWithContract(tx, ref);
      decide(note, "APPROVE");
      if (body.updatedAt !== undefined) assertFresh(note, body.updatedAt);
      await siteOf(tx, locked);
      const { lines, facts } = await storedLines(tx, note.id);
      const onSite = await onSiteByItemCondition(tx, locked.id);
      assertBuyBackLines(locked.code, lines, onSite, true);
      const overdue = await overdueDebt(tx, locked.customerId);
      const reason = (body.reason ?? "").trim() || null;
      if (overdue.amount > 0 && reason === null) {
        throw new DomainValueError(
          BUY_BACK_MESSAGES.overdueReason(overdue.amount, overdue.days),
        );
      }
      if (reason !== null) requireBuyBackText(reason, BUY_BACK_MESSAGES.reason);
      const drafts: MovementDraft[] = lines.flatMap((line) =>
        allocateBuyBack({
          code: note.code,
          siteLocationId: note.siteLocationId,
          itemId: line.itemId,
          milli: line.milli,
          onSite: onSite.get(line.itemId) ?? { NEW: 0, GOOD: 0 },
        }),
      );
      const posting = await postMovements(
        tx,
        actor,
        {
          documentType: BUY_BACK_DOCUMENT_TYPE,
          documentId: note.id,
          documentCode: note.code,
          businessDate: today,
          lines: drafts,
        },
        today,
      );
      const terms = await contractTermsAt(tx, locked.id, today);
      const total = buyBackTotal(priced(lines));
      const [row] = await tx
        .update(buyBackNote)
        .set({
          status: "APPROVED",
          amountDue: total,
          approvalReason: reason,
          approvedBy: actor.id,
          approvedAt: now,
          approvedDate: today,
          dueDate: buyBackDueDate(today, terms?.paymentTermsDays ?? 0),
          postingId: posting.postingId,
          updatedAt: now,
        })
        .where(eq(buyBackNote.id, note.id))
        .returning();
      await logActivity(
        tx,
        actor,
        {
          action: "APPROVE",
          document: {
            type: BUY_BACK_DOCUMENT_TYPE,
            id: note.id,
            code: note.code,
          },
          summary: buyBackSummary(named(lines, facts), total),
          anomaly: overdue.amount > 0,
        },
        { now },
      );
      return savedOf(row as NoteRow);
    });
    return ok(saved);
  });
}

/** "Từ chối": final, with a reason; nothing is posted, the rent goes on. */
export function rejectBuyBack(
  db: Database,
  actor: ContractActor,
  ref: string,
  body: BuyBackDecisionBody,
  options: BuyBackOptions = {},
): Promise<ServiceResult<SavedBuyBack>> {
  return run(async () => {
    assertApprover(actor);
    const now = options.now ?? new Date();
    const saved = await db.transaction(async (tx) => {
      const { note } = await lockNoteWithContract(tx, ref);
      decide(note, "REJECT");
      const reason = requireBuyBackText(
        body.reason,
        BUY_BACK_MESSAGES.rejectReason,
      );
      const [row] = await tx
        .update(buyBackNote)
        .set({
          status: "REJECTED",
          rejectedReason: reason,
          rejectedBy: actor.id,
          rejectedAt: now,
          updatedAt: now,
        })
        .where(eq(buyBackNote.id, note.id))
        .returning();
      await logActivity(
        tx,
        actor,
        {
          action: "REJECT",
          document: {
            type: BUY_BACK_DOCUMENT_TYPE,
            id: note.id,
            code: note.code,
          },
          summary: `Lý do: ${reason}`,
        },
        { now },
      );
      return savedOf(row as NoteRow);
    });
    return ok(saved);
  });
}

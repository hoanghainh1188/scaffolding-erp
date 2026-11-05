// Amendments (contract-amendments spec, design D1, D2, D11): a full copy of
// the latest approved revision, changed, then approved again by the
// director. The contract row FOR UPDATE first (it holds the number count
// and decides whether an amendment may move), then the amendment row.
import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { contract, contractRevision, customer, site } from "@/db/schema";
import { changeSummary, reasonSummary } from "@/domain/activity-summary";
import {
  addDays,
  formatBusinessDate,
  isBusinessDate,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import {
  amendable,
  amendmentTransition,
  approvalReason,
  CONTRACT_MESSAGES,
  optionalReason,
  requiredReason,
  type AmendmentCommand,
  type RevisionStatus,
} from "@/domain/contract";
import { amendmentCode } from "@/domain/contract-code";
import {
  assertChanged,
  assertEffectiveDate,
  diffRevisions,
  REVISION_MESSAGES,
} from "@/domain/contract-revision";
import { amendmentSummary, approvalSummary } from "@/domain/contract-summary";
import {
  conflict,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import { logActivity } from "@/lib/activity/log";

import { lastDeliveryDate } from "@/lib/receivables/debts";

import { lastClosedPeriodEnd } from "./billing-lock";
import {
  assertApprover,
  assertContractAccess,
  ContractFieldError,
  run,
  type ContractActor,
  type Tx,
} from "./common";
import {
  checkContent,
  checkTerms,
  CONTENT_MESSAGES,
  comparable,
  readContent,
  writeContent,
  type StoredContent,
  type Terms,
} from "./content";
import { overdueDebt } from "./overdue";
import {
  dayRentOf,
  latestApproved,
  lockContract,
  lockRevision,
  openAmendment,
  readRevisions,
  termColumns,
  termsOf,
  valueOf,
  type LockedContract,
  type RevisionRow,
} from "./records";
import type { ContractBody } from "./service";

export interface AmendmentBody extends ContractBody {
  effectiveFrom?: string;
  reason?: string | null;
}

export interface SavedAmendment {
  id: string;
  contractId: string;
  number: number;
  code: string;
  status: RevisionStatus;
  updatedAt: string;
}

const number2 = (n: number) => String(n).padStart(2, "0");

function saved(row: RevisionRow, status = row.status, at = row.updatedAt) {
  return {
    id: row.id,
    contractId: row.contractId,
    number: row.number,
    code: row.code,
    status: status as RevisionStatus,
    updatedAt: at.toISOString(),
  };
}

/** Where the contract's amendments may take effect now. */
async function limitsOf(
  tx: Tx,
  locked: LockedContract,
  revisions: readonly RevisionRow[],
) {
  const original = revisions.find((row) => row.number === 0);
  const approved = revisions
    .filter((row) => row.kind === "AMENDMENT" && row.status === "APPROVED")
    .map((row) => row.effectiveFrom)
    .sort();
  return {
    contractStart: original?.startDate ?? "",
    lastApprovedEffective: approved.at(-1) ?? null,
    lastClosedEnd: await lastClosedPeriodEnd(tx, locked.id),
    lastSaleDelivery:
      locked.type === "SALE" ? await lastDeliveryDate(tx, locked.id) : null,
  };
}

function checkEffective(
  effectiveFrom: string,
  limits: Parameters<typeof assertEffectiveDate>[1],
) {
  if (!isBusinessDate(effectiveFrom)) {
    throw new ContractFieldError(CONTENT_MESSAGES.date, "effectiveFrom");
  }
  try {
    assertEffectiveDate(effectiveFrom, limits);
  } catch (error: unknown) {
    throw new ContractFieldError((error as Error).message, "effectiveFrom");
  }
}

/** The earliest day an amendment may take effect, from today on. */
function defaultEffective(
  today: BusinessDate,
  limits: Awaited<ReturnType<typeof limitsOf>>,
): string {
  const candidates = [
    today,
    limits.contractStart,
    limits.lastApprovedEffective ?? "",
    limits.lastClosedEnd
      ? addDays(limits.lastClosedEnd as BusinessDate, 1)
      : "",
    limits.lastSaleDelivery
      ? addDays(limits.lastSaleDelivery as BusinessDate, 1)
      : "",
  ];
  return candidates.sort().at(-1) ?? today;
}

/** Head of a revision for diffRevisions, codes rather than ids. */
async function headOf(tx: Tx, locked: LockedContract) {
  const [buyer] = await tx
    .select({ code: customer.code })
    .from(customer)
    .where(eq(customer.id, locked.customerId));
  const [place] = locked.siteId
    ? await tx
        .select({ code: site.code })
        .from(site)
        .where(eq(site.id, locked.siteId))
    : [];
  return {
    type: locked.type,
    customerId: buyer?.code ?? "",
    siteId: place?.code ?? null,
  };
}

/** The copy the amendment was made from, and its content. */
async function baseOf(
  tx: Tx,
  amendment: RevisionRow,
  revisions: readonly RevisionRow[],
) {
  const base =
    revisions.find((row) => row.id === amendment.basedOnRevisionId) ??
    latestApproved(revisions.filter((row) => row.number < amendment.number));
  if (!base) throw new Error("amendment without an approved base");
  return { base, content: await readContent(tx, base.id) };
}

async function changesOf(
  tx: Tx,
  locked: LockedContract,
  amendment: RevisionRow,
  revisions: readonly RevisionRow[],
  terms: Terms,
  content: StoredContent,
) {
  const { base, content: baseContent } = await baseOf(tx, amendment, revisions);
  const head = await headOf(tx, locked);
  try {
    return diffRevisions(
      await comparable(tx, head, termsOf(base), baseContent),
      await comparable(tx, head, terms, content),
      { effectiveFrom: amendment.effectiveFrom },
    );
  } catch (error: unknown) {
    throw new ServiceFailure(conflict((error as Error).message));
  }
}

function assertAmendable(locked: LockedContract, command: AmendmentCommand) {
  if (!amendable(locked.status)) {
    // Same table as amendmentTransition: drafts and pending contracts get
    // "chưa duyệt", ended ones "đã hủy / đã thanh lý".
    amendmentTransition(locked.status, "DRAFT", command);
  }
}

/** "Lập phụ lục": a draft copy of the latest approved revision. */
export function createAmendment(
  db: Database,
  actor: ContractActor,
  contractId: string,
  options: { today?: BusinessDate } = {},
): Promise<ServiceResult<SavedAmendment>> {
  return run(async () =>
    db.transaction(async (tx) => {
      const locked = await lockContract(tx, contractId);
      assertContractAccess(actor, locked.type, "manage");
      if (locked.status === "DRAFT" || locked.status === "PENDING") {
        throw new ServiceFailure(conflict(CONTRACT_MESSAGES.amendNotApproved));
      }
      assertAmendable(locked, "EDIT");
      const revisions = await readRevisions(tx, locked.id);
      const open = openAmendment(revisions);
      if (open) {
        throw new ServiceFailure(
          conflict(CONTRACT_MESSAGES.amendOpen(number2(open.number))),
        );
      }
      const base = latestApproved(revisions);
      if (!base) throw new Error("approved contract without approved revision");
      const content = await readContent(tx, base.id);
      const limits = await limitsOf(tx, locked, revisions);
      const n = locked.lastAmendmentNumber + 1;
      const code = amendmentCode(locked.code, n);
      const [row] = await tx
        .insert(contractRevision)
        .values({
          ...termColumns(termsOf(base)),
          contractId: locked.id,
          number: n,
          kind: "AMENDMENT",
          code,
          basedOnRevisionId: base.id,
          effectiveFrom: defaultEffective(
            options.today ?? toBusinessDate(new Date()),
            limits,
          ),
          createdBy: actor.id,
        })
        .returning();
      if (!row) throw new Error("amendment insert returned nothing");
      await writeContent(tx, row.id, content);
      await tx
        .update(contract)
        .set({ lastAmendmentNumber: n })
        .where(eq(contract.id, locked.id));
      await logActivity(tx, actor, {
        action: "CREATE",
        document: { type: "CONTRACT_AMENDMENT", id: row.id, code },
        summary: `Phụ lục ${number2(n)} của ${locked.code}`,
      });
      return ok(saved(row));
    }),
  );
}

/** "Lưu nháp" on D5b: whole body, guarded by the amendment's updatedAt. */
export function updateAmendment(
  db: Database,
  actor: ContractActor,
  contractId: string,
  number: number,
  body: AmendmentBody,
): Promise<ServiceResult<SavedAmendment>> {
  return run(async () =>
    db.transaction(async (tx) => {
      const locked = await lockContract(tx, contractId);
      assertContractAccess(actor, locked.type, "manage");
      const amendment = await lockAmendment(tx, locked, number);
      amendmentTransition(
        locked.status,
        amendment.status as RevisionStatus,
        "EDIT",
      );
      const seen = body.updatedAt ? new Date(body.updatedAt).getTime() : NaN;
      if (seen !== amendment.updatedAt.getTime()) {
        throw new ServiceFailure(conflict(CONTRACT_MESSAGES.stale));
      }
      if (
        (body.type !== undefined && body.type !== locked.type) ||
        (body.customerId !== undefined &&
          body.customerId !== locked.customerId) ||
        (body.siteId !== undefined && body.siteId !== locked.siteId)
      ) {
        throw new ServiceFailure(conflict(REVISION_MESSAGES.fixed));
      }
      const revisions = await readRevisions(tx, locked.id);
      const effectiveFrom = body.effectiveFrom ?? amendment.effectiveFrom;
      checkEffective(effectiveFrom, await limitsOf(tx, locked, revisions));
      const reason = optionalReason(body.reason);
      const original = revisions.find((row) => row.number === 0)!;
      const terms = checkTerms(
        locked.type,
        // The start and signing dates are fixed: missing means unchanged.
        {
          ...body,
          startDate: body.startDate ?? original.startDate,
          signedDate:
            body.signedDate === undefined
              ? original.signedDate
              : body.signedDate,
        },
        { paymentTermsDays: amendment.paymentTermsDays },
      );
      const previous = await readContent(tx, amendment.id);
      const content = await checkContent(tx, locked.type, body, previous);
      const next = { ...amendment, effectiveFrom };
      await changesOf(tx, locked, next, revisions, terms, content);
      const head = await headOf(tx, locked);
      const edits = diffRevisions(
        await comparable(tx, head, termsOf(amendment), previous),
        await comparable(tx, head, terms, content),
      );
      const now = new Date();
      await tx
        .update(contractRevision)
        .set({
          ...termColumns(terms),
          effectiveFrom,
          reason,
          updatedAt: now,
        })
        .where(eq(contractRevision.id, amendment.id));
      await writeContent(tx, amendment.id, content);
      const dateChange =
        effectiveFrom === amendment.effectiveFrom
          ? []
          : [
              {
                field: "effectiveFrom",
                label: "Hiệu lực từ",
                before: formatBusinessDate(amendment.effectiveFrom),
                after: formatBusinessDate(effectiveFrom),
              },
            ];
      const reasonChange =
        reason === amendment.reason
          ? []
          : [
              {
                field: "reason",
                label: "Lý do",
                before: amendment.reason,
                after: reason,
              },
            ];
      const changes = [...dateChange, ...reasonChange, ...edits];
      await logActivity(tx, actor, {
        action: "UPDATE",
        document: {
          type: "CONTRACT_AMENDMENT",
          id: amendment.id,
          code: amendment.code,
        },
        summary: changeSummary(changes),
        changes,
      });
      return ok(saved(amendment, amendment.status, now));
    }),
  );
}

async function lockAmendment(tx: Tx, locked: LockedContract, number: number) {
  const row = await lockRevision(tx, locked.id, number);
  if (row.kind !== "AMENDMENT")
    throw new ServiceFailure({
      ok: false,
      status: 404,
      error: "Không tìm thấy phụ lục",
    });
  return row;
}

/** "Gửi Giám đốc duyệt": a reason, a valid date and at least one change. */
export function submitAmendment(
  db: Database,
  actor: ContractActor,
  contractId: string,
  number: number,
): Promise<ServiceResult<SavedAmendment>> {
  return run(async () =>
    db.transaction(async (tx) => {
      const locked = await lockContract(tx, contractId);
      assertContractAccess(actor, locked.type, "manage");
      const amendment = await lockAmendment(tx, locked, number);
      const status = amendmentTransition(
        locked.status,
        amendment.status as RevisionStatus,
        "SUBMIT",
      );
      requiredReason(amendment.reason, CONTRACT_MESSAGES.amendReason);
      const revisions = await readRevisions(tx, locked.id);
      checkEffective(
        amendment.effectiveFrom,
        await limitsOf(tx, locked, revisions),
      );
      const changes = await changesOf(
        tx,
        locked,
        amendment,
        revisions,
        termsOf(amendment),
        await readContent(tx, amendment.id),
      );
      try {
        assertChanged(changes);
      } catch (error: unknown) {
        throw new ServiceFailure(conflict((error as Error).message));
      }
      const now = new Date();
      await tx
        .update(contractRevision)
        .set({
          status,
          submittedBy: actor.id,
          submittedAt: now,
          updatedAt: now,
        })
        .where(eq(contractRevision.id, amendment.id));
      await logActivity(tx, actor, {
        action: "SUBMIT",
        document: {
          type: "CONTRACT_AMENDMENT",
          id: amendment.id,
          code: amendment.code,
        },
        summary: changeSummary(changes),
      });
      return ok(saved(amendment, status, now));
    }),
  );
}

/**
 * Director only. The date is checked again: a period may have been closed
 * while the amendment waited (0.2 #22).
 */
export function approveAmendment(
  db: Database,
  actor: ContractActor,
  contractId: string,
  number: number,
  reason: string | null | undefined,
): Promise<ServiceResult<SavedAmendment>> {
  return run(async () =>
    db.transaction(async (tx) => {
      assertApprover(actor);
      const locked = await lockContract(tx, contractId);
      const amendment = await lockAmendment(tx, locked, number);
      const status = amendmentTransition(
        locked.status,
        amendment.status as RevisionStatus,
        "APPROVE",
      );
      const revisions = await readRevisions(tx, locked.id);
      checkEffective(
        amendment.effectiveFrom,
        await limitsOf(tx, locked, revisions),
      );
      const overdue = await overdueDebt(tx, locked.customerId);
      const text = approvalReason(overdue, reason);
      const { base, content: baseContent } = await baseOf(
        tx,
        amendment,
        revisions,
      );
      const content = await readContent(tx, amendment.id);
      const value = (terms: Terms, rows: StoredContent) =>
        locked.type === "RENTAL"
          ? dayRentOf(rows)
          : (valueOf(locked.type, terms, rows) ?? 0);
      const now = new Date();
      await tx
        .update(contractRevision)
        .set({
          status,
          approvedBy: actor.id,
          approvedAt: now,
          approvalReason: text,
          overdueAmount: overdue.amount > 0 ? overdue.amount : null,
          overdueDays: overdue.amount > 0 ? overdue.days : null,
          returnedReason: null,
          updatedAt: now,
        })
        .where(eq(contractRevision.id, amendment.id));
      await tx
        .update(contract)
        .set({ updatedAt: now })
        .where(eq(contract.id, locked.id));
      const summary = amendmentSummary({
        effectiveFrom: amendment.effectiveFrom,
        type: locked.type,
        before: value(termsOf(base), baseContent),
        after: value(termsOf(amendment), content),
      });
      await logActivity(tx, actor, {
        action: "APPROVE",
        document: {
          type: "CONTRACT_AMENDMENT",
          id: amendment.id,
          code: amendment.code,
        },
        summary:
          overdue.amount > 0
            ? `${summary} · ${approvalSummary(overdue, text)}`
            : summary,
        anomaly: overdue.amount > 0,
      });
      return ok(saved(amendment, status, now));
    }),
  );
}

/** "Từ chối" an amendment: back to draft with the reason. */
export function returnAmendment(
  db: Database,
  actor: ContractActor,
  contractId: string,
  number: number,
  reason: string | null | undefined,
): Promise<ServiceResult<SavedAmendment>> {
  return run(async () =>
    db.transaction(async (tx) => {
      assertApprover(actor);
      const locked = await lockContract(tx, contractId);
      const amendment = await lockAmendment(tx, locked, number);
      const status = amendmentTransition(
        locked.status,
        amendment.status as RevisionStatus,
        "RETURN",
      );
      const text = requiredReason(reason, CONTRACT_MESSAGES.returnReason);
      const now = new Date();
      await tx
        .update(contractRevision)
        .set({ status, returnedReason: text, updatedAt: now })
        .where(eq(contractRevision.id, amendment.id));
      await logActivity(tx, actor, {
        action: "RETURN",
        document: {
          type: "CONTRACT_AMENDMENT",
          id: amendment.id,
          code: amendment.code,
        },
        summary: text,
      });
      return ok(saved(amendment, status, now));
    }),
  );
}

/** "Hủy phụ lục": a draft or pending amendment; its number is not reused. */
export function cancelAmendment(
  db: Database,
  actor: ContractActor,
  contractId: string,
  number: number,
  reason: string | null | undefined,
): Promise<ServiceResult<SavedAmendment>> {
  return run(async () =>
    db.transaction(async (tx) => {
      const locked = await lockContract(tx, contractId);
      assertContractAccess(actor, locked.type, "manage");
      const amendment = await lockAmendment(tx, locked, number);
      const status = amendmentTransition(
        locked.status,
        amendment.status as RevisionStatus,
        "CANCEL",
      );
      const text = requiredReason(reason, CONTRACT_MESSAGES.cancelReason);
      const now = new Date();
      await tx
        .update(contractRevision)
        .set({ status, cancelledReason: text, updatedAt: now })
        .where(eq(contractRevision.id, amendment.id));
      await logActivity(tx, actor, {
        action: "CANCEL",
        document: {
          type: "CONTRACT_AMENDMENT",
          id: amendment.id,
          code: amendment.code,
        },
        summary: reasonSummary(text),
      });
      return ok(saved(amendment, status, now));
    }),
  );
}

// Moving a contract on (contracts spec, design D1, D3): send, approve,
// return, cancel. The contract FOR UPDATE first, transition() decides, the
// original revision follows the contract until approval and is frozen
// after it (trigger). Cancelling an approved contract cancels its open
// amendment in the same transaction (review of PR 128).
import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import { contract, contractRevision, item } from "@/db/schema";
import { DomainValueError } from "@/domain/errors";
import { reasonSummary } from "@/domain/activity-summary";
import {
  approvalReason,
  checkSubmittable,
  CONTRACT_MESSAGES,
  requiredReason,
  transition,
} from "@/domain/contract";
import { approvalSummary, contractSummary } from "@/domain/contract-summary";
import { ok, type ServiceResult } from "@/lib/catalog/common";
import { logActivity } from "@/lib/activity/log";

import {
  assertApprover,
  assertContractAccess,
  run,
  type ContractActor,
  type Tx,
} from "./common";
import { readContent } from "./content";
import { hasDeliveries, openDeliveries, openTransfersInto } from "./deliveries";
import { overdueDebt } from "./overdue";
import {
  lockContract,
  lockRevision,
  namesOf,
  readRevisions,
  termsOf,
  valueOf,
  type LockedContract,
} from "./records";

export const AMENDMENT_CANCELLED_BY_CONTRACT = "Hợp đồng đã hủy";

export interface MovedContract {
  id: string;
  code: string;
  status: string;
}

const done = (locked: LockedContract, status: string) =>
  ok({ id: locked.id, code: locked.code, status });

async function summaryOf(tx: Tx, locked: LockedContract) {
  const revision = await lockRevision(tx, locked.id, 0);
  const content = await readContent(tx, revision.id);
  const names = await namesOf(tx, locked.customerId, locked.siteId);
  return {
    revision,
    content,
    summary: contractSummary({
      type: locked.type,
      customer: names.customer,
      site: names.site,
      itemCount: content.lines.length,
      value: valueOf(locked.type, termsOf(revision), content),
    }),
  };
}

/** "Gửi Giám đốc duyệt": only a complete draft goes. */
export function submitContract(
  db: Database,
  actor: ContractActor,
  id: string,
): Promise<ServiceResult<MovedContract>> {
  return run(async () =>
    db.transaction(async (tx) => {
      const locked = await lockContract(tx, id);
      assertContractAccess(actor, locked.type, "manage");
      const next = transition(
        { status: locked.status, hasDeliveries: false },
        "SUBMIT",
      );
      const { revision, content, summary } = await summaryOf(tx, locked);
      const codes = await itemCodes(
        tx,
        content.lines.map((line) => line.itemId),
      );
      checkSubmittable({
        type: locked.type,
        endDate: revision.endDate,
        lines: content.lines.map((line) => ({
          itemCode: codes.get(line.itemId) ?? "",
          price: line.price,
        })),
        compensations: content.compensations.map((entry) => ({
          itemCode: codes.get(entry.itemId) ?? "",
          lostPrice: entry.lostPrice,
          damagePrice: entry.damagePrice,
        })),
      });
      const now = new Date();
      await tx
        .update(contractRevision)
        .set({
          status: "PENDING",
          submittedBy: actor.id,
          submittedAt: now,
          updatedAt: now,
        })
        .where(eq(contractRevision.id, revision.id));
      await tx
        .update(contract)
        .set({ status: next, updatedAt: now })
        .where(eq(contract.id, locked.id));
      await logActivity(tx, actor, {
        action: "SUBMIT",
        document: { type: "CONTRACT", id: locked.id, code: locked.code },
        summary,
      });
      return done(locked, next);
    }),
  );
}

/**
 * "Duyệt hợp đồng": director only; overdue debt asks for a reason, which
 * is kept with the debt seen at that moment (0.2 #15).
 */
export function approveContract(
  db: Database,
  actor: ContractActor,
  id: string,
  reason: string | null | undefined,
): Promise<ServiceResult<MovedContract>> {
  return run(async () =>
    db.transaction(async (tx) => {
      assertApprover(actor);
      const locked = await lockContract(tx, id);
      const next = transition(
        { status: locked.status, hasDeliveries: false },
        "APPROVE",
      );
      const overdue = await overdueDebt(tx, locked.customerId);
      const text = approvalReason(overdue, reason);
      const revision = await lockRevision(tx, locked.id, 0);
      const now = new Date();
      await tx
        .update(contractRevision)
        .set({
          status: "APPROVED",
          approvedBy: actor.id,
          approvedAt: now,
          approvalReason: text,
          overdueAmount: overdue.amount > 0 ? overdue.amount : null,
          overdueDays: overdue.amount > 0 ? overdue.days : null,
          returnedReason: null,
          updatedAt: now,
        })
        .where(eq(contractRevision.id, revision.id));
      await tx
        .update(contract)
        .set({ status: next, updatedAt: now })
        .where(eq(contract.id, locked.id));
      await logActivity(tx, actor, {
        action: "APPROVE",
        document: { type: "CONTRACT", id: locked.id, code: locked.code },
        summary: approvalSummary(overdue, text),
        anomaly: overdue.amount > 0,
      });
      return done(locked, next);
    }),
  );
}

/** "Từ chối": back to draft with the reason for the seller. */
export function returnContract(
  db: Database,
  actor: ContractActor,
  id: string,
  reason: string | null | undefined,
): Promise<ServiceResult<MovedContract>> {
  return run(async () =>
    db.transaction(async (tx) => {
      assertApprover(actor);
      const locked = await lockContract(tx, id);
      const next = transition(
        { status: locked.status, hasDeliveries: false },
        "RETURN",
      );
      const text = requiredReason(reason, CONTRACT_MESSAGES.returnReason);
      const revision = await lockRevision(tx, locked.id, 0);
      const now = new Date();
      await tx
        .update(contractRevision)
        .set({ status: "DRAFT", returnedReason: text, updatedAt: now })
        .where(eq(contractRevision.id, revision.id));
      await tx
        .update(contract)
        .set({ status: next, updatedAt: now })
        .where(eq(contract.id, locked.id));
      await logActivity(tx, actor, {
        action: "RETURN",
        document: { type: "CONTRACT", id: locked.id, code: locked.code },
        summary: text,
      });
      return done(locked, next);
    }),
  );
}

/**
 * "Hủy": a draft by its seller, an approved contract (no delivery yet) by
 * the director. The number stays used.
 */
export function cancelContract(
  db: Database,
  actor: ContractActor,
  id: string,
  reason: string | null | undefined,
): Promise<ServiceResult<MovedContract>> {
  return run(async () =>
    db.transaction(async (tx) => {
      const locked = await lockContract(tx, id);
      // A draft is its seller's; an approved contract the director's; any
      // other status is answered by transition() below.
      assertContractAccess(actor, locked.type, "view");
      if (locked.status === "DRAFT") {
        assertContractAccess(actor, locked.type, "manage");
      } else if (locked.status === "APPROVED") {
        assertApprover(actor);
      }
      const next = transition(
        {
          status: locked.status,
          hasDeliveries: await hasDeliveries(tx, locked.id),
        },
        "CANCEL",
      );
      const [openNote] = await openDeliveries(tx, locked.id);
      if (openNote !== undefined) {
        throw new DomainValueError(CONTRACT_MESSAGES.openDeliveries(openNote));
      }
      const [openTransfer] = await openTransfersInto(tx, locked.id);
      if (openTransfer !== undefined) {
        throw new DomainValueError(
          CONTRACT_MESSAGES.openTransfers(openTransfer),
        );
      }
      const text = requiredReason(reason, CONTRACT_MESSAGES.cancelReason);
      const now = new Date();
      if (locked.status === "DRAFT") {
        await tx
          .update(contractRevision)
          .set({ status: "CANCELLED", cancelledReason: text, updatedAt: now })
          .where(
            and(
              eq(contractRevision.contractId, locked.id),
              eq(contractRevision.number, 0),
            ),
          );
      }
      const open = (await readRevisions(tx, locked.id)).filter(
        (row) =>
          row.kind === "AMENDMENT" &&
          (row.status === "DRAFT" || row.status === "PENDING"),
      );
      for (const amendment of open) {
        await tx
          .update(contractRevision)
          .set({
            status: "CANCELLED",
            cancelledReason: AMENDMENT_CANCELLED_BY_CONTRACT,
            updatedAt: now,
          })
          .where(eq(contractRevision.id, amendment.id));
        await logActivity(tx, actor, {
          action: "CANCEL",
          document: {
            type: "CONTRACT_AMENDMENT",
            id: amendment.id,
            code: amendment.code,
          },
          summary: AMENDMENT_CANCELLED_BY_CONTRACT,
        });
      }
      await tx
        .update(contract)
        .set({ status: next, updatedAt: now })
        .where(eq(contract.id, locked.id));
      await logActivity(tx, actor, {
        action: "CANCEL",
        document: { type: "CONTRACT", id: locked.id, code: locked.code },
        summary: reasonSummary(text),
      });
      return done(locked, next);
    }),
  );
}

async function itemCodes(tx: Tx, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  const rows = unique.length
    ? await tx
        .select({ id: item.id, code: item.code })
        .from(item)
        .where(inArray(item.id, unique))
    : [];
  return new Map(rows.map((row) => [row.id, row.code]));
}

// Shared pieces of the receivables commands (design D5): the customer row
// FOR UPDATE guards every change of a customer's allocations, and it is
// always the last lock taken (contract → document → ledger → customer), so
// no command waits on a contract while it holds a customer.
import { eq } from "drizzle-orm";

import { customer, receiptAllocation } from "@/db/schema";
import type { AllocationMode, DebtKind } from "@/domain/receivables";
import { ReceivableRuleError } from "@/domain/receivables";
import {
  notFound,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import { run as runContract, type Tx } from "@/lib/contracts/common";

import type { ActivityActor } from "@/lib/activity/actor";

export interface LockedCustomer {
  id: string;
  code: string;
  name: string;
  paymentTermsDays: number;
}

/** The customer FOR UPDATE, or 404. */
export async function lockCustomer(
  tx: Tx,
  id: string,
): Promise<LockedCustomer> {
  const [row] = await tx
    .select({
      id: customer.id,
      code: customer.code,
      name: customer.name,
      paymentTermsDays: customer.paymentTermsDays,
    })
    .from(customer)
    .where(eq(customer.id, id))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return row;
}

/** The column of a debt kind on receipt_allocation. */
export function debtColumns(
  key: string,
): Pick<
  typeof receiptAllocation.$inferInsert,
  "billingPeriodId" | "deliveryNoteId" | "compensationNoteId" | "buyBackNoteId"
> {
  const [kind, id] = key.split(":") as [DebtKind, string];
  if (kind === "BILLING") return { billingPeriodId: id };
  if (kind === "SALE") return { deliveryNoteId: id };
  if (kind === "COMPENSATION") return { compensationNoteId: id };
  return { buyBackNoteId: id };
}

/** "receipt:<id>" or "credit:<id>" → the source column. */
export function sourceColumns(
  key: string,
): Pick<typeof receiptAllocation.$inferInsert, "receiptId" | "creditPeriodId"> {
  const [kind, id] = key.split(":");
  return kind === "credit" ? { creditPeriodId: id } : { receiptId: id };
}

/**
 * Writes allocations of a customer. It takes the LockedCustomer that
 * lockCustomer returned, so no caller can skip the lock (design D5).
 */
export async function insertAllocations(
  tx: Tx,
  actor: ActivityActor,
  locked: LockedCustomer,
  rows: readonly {
    sourceKey: string;
    debtKey: string;
    amount: number;
    mode: AllocationMode;
    settlementId?: string;
  }[],
): Promise<void> {
  if (rows.length === 0 || !locked.id) return;
  await tx.insert(receiptAllocation).values(
    rows.map((row) => ({
      ...sourceColumns(row.sourceKey),
      ...debtColumns(row.debtKey),
      amount: row.amount,
      mode: row.mode,
      settlementId: row.settlementId ?? null,
      createdBy: actor.id,
    })),
  );
}

/** Like the contract services, plus receivable rules with their status. */
export function run<T>(
  body: () => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  return runContract(async () => {
    try {
      return await body();
    } catch (error: unknown) {
      if (error instanceof ReceivableRuleError) {
        return { ok: false, status: error.status, error: error.message };
      }
      throw error;
    }
  });
}

// Shared pieces of the payables commands (payables design D4): the supplier
// row FOR UPDATE guards every change of a seller's allocations, and it is
// always the last lock taken (order → yard → ledger → supplier), so no
// command waits on an order while it holds a supplier.
import { eq } from "drizzle-orm";

import { supplier, supplierPaymentAllocation } from "@/db/schema";
import { PayableRuleError } from "@/domain/payables";
import type { ActivityActor } from "@/lib/activity/actor";
import {
  notFound,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import { run as runContract, type Tx } from "@/lib/contracts/common";

import type { AllocationMode } from "./balances";

export interface LockedSupplier {
  id: string;
  code: string;
  name: string;
  paymentTermsDays: number;
}

/** The supplier FOR UPDATE, or 404. */
export async function lockSupplier(
  tx: Tx,
  id: string,
): Promise<LockedSupplier> {
  const [row] = await tx
    .select({
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      paymentTermsDays: supplier.paymentTermsDays,
    })
    .from(supplier)
    .where(eq(supplier.id, id))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return row;
}

/**
 * Writes allocations of a seller. It takes the LockedSupplier that
 * lockSupplier returned, so no caller can skip the lock (design D4).
 */
export async function insertAllocations(
  tx: Tx,
  actor: ActivityActor,
  locked: LockedSupplier,
  rows: readonly {
    paymentId: string;
    goodsReceiptId: string;
    amount: number;
    mode: AllocationMode;
  }[],
  now?: Date,
): Promise<void> {
  if (rows.length === 0 || !locked.id) return;
  await tx.insert(supplierPaymentAllocation).values(
    rows.map((row) => ({
      ...row,
      createdBy: actor.id,
      ...(now ? { createdAt: now } : {}),
    })),
  );
}

/** Like the contract services, plus payable rules with their status. */
export function run<T>(
  body: () => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  return runContract(async () => {
    try {
      return await body();
    } catch (error: unknown) {
      if (error instanceof PayableRuleError) {
        return { ok: false, status: error.status, error: error.message };
      }
      throw error;
    }
  });
}

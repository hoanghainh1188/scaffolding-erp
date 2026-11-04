// Adjustments of a closed period (0.2 #22, #80; rental-billing design D5):
// the accountant or the director writes a correction of a closed month
// into a later month that is still open, with a reason; no approval, but a
// negative amount is flagged on the activity log for the director. Edits
// and deletes stop once the month they sit in is closed.
import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { billingAdjustment, billingPeriod } from "@/db/schema";
import { diffFields, type FieldSpec } from "@/domain/activity-changes";
import { formatMoney, toMoney } from "@/domain/money";
import { can } from "@/domain/permissions";
import { formatMonth, periodOf } from "@/domain/rental-billing";
import type { ActivityActor } from "@/lib/activity/actor";
import { logActivity, type Tx } from "@/lib/activity/log";
import {
  conflict,
  notFound,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import { ContractFieldError, forbidden, run } from "@/lib/contracts/common";
import { lockContract } from "@/lib/contracts/records";

/** |amount| above this is a typo (design D5). */
export const ADJUSTMENT_MAX = 10_000_000_000;
export const ADJUSTMENT_REASON_MAX = 500;

export const ADJUSTMENT_MESSAGES = {
  reason: "Bạn ghi lý do điều chỉnh để người xem biết vì sao số đổi.",
  reasonTooLong: `Lý do điều chỉnh dài tối đa ${ADJUSTMENT_REASON_MAX} ký tự.`,
  zero: "Số tiền điều chỉnh phải khác 0 ₫.",
  tooBig: `Số tiền điều chỉnh tối đa ${formatMoney(toMoney(ADJUSTMENT_MAX))}.`,
  refNotBefore: "Kỳ được điều chỉnh phải trước kỳ ghi dòng điều chỉnh.",
  refOpen: (ref: string) =>
    `Kỳ ${formatMonth(ref)} chưa chốt nên không cần dòng điều chỉnh. Bạn xem lại số của kỳ đó trên D7 rồi chốt.`,
  monthClosed: (month: string) =>
    `Kỳ ${formatMonth(month)} đã chốt nên không thêm được dòng. Bạn ghi vào kỳ sau.`,
  frozen: (month: string) =>
    `Kỳ ${formatMonth(month)} đã chốt nên dòng điều chỉnh này không sửa được.`,
  stale: "Dòng điều chỉnh vừa được người khác sửa. Bạn tải lại để xem số mới.",
  notRental: "Chỉ hợp đồng thuê mới có dòng điều chỉnh tiền thuê.",
} as const;

export interface AdjustmentBody {
  contractId?: string;
  /** The open month it is written into: "2027-02". */
  month?: string;
  /** The closed month it corrects: "2027-01". */
  refMonth?: string;
  amount?: number;
  reason?: string;
  /** Edits and deletes: when the row was last saved (409 when stale). */
  updatedAt?: string;
}

export interface SavedAdjustment {
  id: string;
  contractId: string;
  month: string;
  refMonth: string;
  amount: number;
  reason: string;
  updatedAt: string;
}

interface Values {
  refMonth: string;
  amount: number;
  reason: string;
}

const FIELDS: readonly FieldSpec<Values>[] = [
  {
    field: "refMonth",
    label: "Kỳ được điều chỉnh",
    value: (row) => formatMonth(row.refMonth),
  },
  {
    field: "amount",
    label: "Số tiền",
    value: (row) => formatMoney(toMoney(row.amount)),
  },
  { field: "reason", label: "Lý do", value: (row) => row.reason },
];

const summaryOf = (values: Values) =>
  `Điều chỉnh kỳ ${formatMonth(values.refMonth)} · ${formatMoney(toMoney(values.amount))} · ${values.reason}`;

function assertManager(actor: ActivityActor) {
  if (!can(actor.role, "billing.manage")) throw new ServiceFailure(forbidden());
}

function monthField(value: string | undefined, field: string): string {
  try {
    return periodOf(value ?? "").month;
  } catch (error: unknown) {
    if (error instanceof Error)
      throw new ContractFieldError(error.message, field);
    throw error;
  }
}

function parseValues(body: AdjustmentBody, month: string): Values {
  const refMonth = monthField(body.refMonth, "refMonth");
  if (refMonth >= month) {
    throw new ContractFieldError(ADJUSTMENT_MESSAGES.refNotBefore, "refMonth");
  }
  const amount = body.amount;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount === 0) {
    throw new ContractFieldError(ADJUSTMENT_MESSAGES.zero, "amount");
  }
  if (Math.abs(amount) > ADJUSTMENT_MAX) {
    throw new ContractFieldError(ADJUSTMENT_MESSAGES.tooBig, "amount");
  }
  const reason = (body.reason ?? "").trim();
  if (!reason)
    throw new ContractFieldError(ADJUSTMENT_MESSAGES.reason, "reason");
  if (reason.length > ADJUSTMENT_REASON_MAX) {
    throw new ContractFieldError(ADJUSTMENT_MESSAGES.reasonTooLong, "reason");
  }
  return { refMonth, amount, reason };
}

async function isClosed(tx: Tx, contractId: string, month: string) {
  const [row] = await tx
    .select({ id: billingPeriod.id })
    .from(billingPeriod)
    .where(
      and(
        eq(billingPeriod.contractId, contractId),
        eq(billingPeriod.month, `${month}-01`),
      ),
    );
  return Boolean(row);
}

async function assertMonths(
  tx: Tx,
  contractId: string,
  month: string,
  refMonth: string,
) {
  if (await isClosed(tx, contractId, month)) {
    throw new ServiceFailure(conflict(ADJUSTMENT_MESSAGES.monthClosed(month)));
  }
  if (!(await isClosed(tx, contractId, refMonth))) {
    throw new ContractFieldError(
      ADJUSTMENT_MESSAGES.refOpen(refMonth),
      "refMonth",
    );
  }
}

const saved = (
  row: typeof billingAdjustment.$inferSelect,
): SavedAdjustment => ({
  id: row.id,
  contractId: row.contractId,
  month: row.month.slice(0, 7),
  refMonth: row.refMonth.slice(0, 7),
  amount: row.amount,
  reason: row.reason,
  updatedAt: row.updatedAt.toISOString(),
});

async function lockRental(tx: Tx, contractId: string) {
  const locked = await lockContract(tx, contractId);
  if (locked.type !== "RENTAL") {
    throw new ServiceFailure(conflict(ADJUSTMENT_MESSAGES.notRental));
  }
  return locked;
}

/** Contract first, then the row (same order as the closing). */
async function lockRow(tx: Tx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ServiceFailure(notFound());
  const [peek] = await tx
    .select({ contractId: billingAdjustment.contractId })
    .from(billingAdjustment)
    .where(eq(billingAdjustment.id, id));
  if (!peek) throw new ServiceFailure(notFound());
  const locked = await lockRental(tx, peek.contractId);
  const [row] = await tx
    .select()
    .from(billingAdjustment)
    .where(eq(billingAdjustment.id, id))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return { locked, row };
}

async function assertEditable(
  tx: Tx,
  row: typeof billingAdjustment.$inferSelect,
  updatedAt: string | undefined,
) {
  const month = row.month.slice(0, 7);
  if (row.closedPeriodId || (await isClosed(tx, row.contractId, month))) {
    throw new ServiceFailure(conflict(ADJUSTMENT_MESSAGES.frozen(month)));
  }
  if (!updatedAt || new Date(updatedAt).getTime() !== row.updatedAt.getTime()) {
    throw new ServiceFailure(conflict(ADJUSTMENT_MESSAGES.stale));
  }
}

const documentOf = (id: string, contractCode: string, month: string) => ({
  type: "BILLING_ADJUSTMENT" as const,
  id,
  code: `${contractCode} · ${formatMonth(month)}`,
});

/** "Thêm dòng điều chỉnh" on D7. */
export function createAdjustment(
  db: Database,
  actor: ActivityActor,
  body: AdjustmentBody,
): Promise<ServiceResult<SavedAdjustment>> {
  return run(async () => {
    assertManager(actor);
    const month = monthField(body.month, "month");
    const values = parseValues(body, month);
    return db.transaction(async (tx) => {
      const locked = await lockRental(tx, body.contractId ?? "");
      await assertMonths(tx, locked.id, month, values.refMonth);
      const [row] = await tx
        .insert(billingAdjustment)
        .values({
          contractId: locked.id,
          month: `${month}-01`,
          refMonth: `${values.refMonth}-01`,
          amount: values.amount,
          reason: values.reason,
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning();
      if (!row) throw new Error("adjustment insert returned nothing");
      await logActivity(tx, actor, {
        action: "CREATE",
        document: documentOf(row.id, locked.code, month),
        summary: summaryOf(values),
        anomaly: values.amount < 0,
      });
      return ok(saved(row));
    });
  });
}

/** "Sửa" a line of the open month. */
export function updateAdjustment(
  db: Database,
  actor: ActivityActor,
  id: string,
  body: AdjustmentBody,
): Promise<ServiceResult<SavedAdjustment>> {
  return run(async () => {
    assertManager(actor);
    return db.transaction(async (tx) => {
      const { locked, row } = await lockRow(tx, id);
      await assertEditable(tx, row, body.updatedAt);
      const month = row.month.slice(0, 7);
      const before: Values = {
        refMonth: row.refMonth.slice(0, 7),
        amount: row.amount,
        reason: row.reason,
      };
      const values = parseValues(
        {
          refMonth: body.refMonth ?? before.refMonth,
          amount: body.amount ?? before.amount,
          reason: body.reason ?? before.reason,
        },
        month,
      );
      await assertMonths(tx, locked.id, month, values.refMonth);
      const changes = diffFields(FIELDS, before, values);
      if (changes.length === 0) return ok(saved(row));
      const [updated] = await tx
        .update(billingAdjustment)
        .set({
          refMonth: `${values.refMonth}-01`,
          amount: values.amount,
          reason: values.reason,
          updatedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(billingAdjustment.id, id))
        .returning();
      if (!updated) throw new Error("adjustment update returned nothing");
      await logActivity(tx, actor, {
        action: "UPDATE",
        document: documentOf(id, locked.code, month),
        summary: summaryOf(values),
        changes,
        anomaly: values.amount < 0,
      });
      return ok(saved(updated));
    });
  });
}

/** "Xóa" a line of the open month. */
export function deleteAdjustment(
  db: Database,
  actor: ActivityActor,
  id: string,
  body: Pick<AdjustmentBody, "updatedAt">,
): Promise<ServiceResult<{ id: string }>> {
  return run(async () => {
    assertManager(actor);
    return db.transaction(async (tx) => {
      const { locked, row } = await lockRow(tx, id);
      await assertEditable(tx, row, body.updatedAt);
      const month = row.month.slice(0, 7);
      await tx.delete(billingAdjustment).where(eq(billingAdjustment.id, id));
      await logActivity(tx, actor, {
        action: "DELETE",
        document: documentOf(id, locked.code, month),
        summary: summaryOf({
          refMonth: row.refMonth.slice(0, 7),
          amount: row.amount,
          reason: row.reason,
        }),
      });
      return ok({ id });
    });
  });
}

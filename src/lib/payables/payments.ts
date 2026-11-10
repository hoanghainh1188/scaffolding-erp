// Supplier payments (supplier-payments spec, design D3, D4): the accountant
// or the director records what was paid to a seller. "Trả tiền hàng" pays
// receipts in the fixed order (or the ones named first); what is left is an
// advance. "Ứng trước" is taken only from a seller who owes nothing
// (0.2 số 102). A payment is never changed: cancelling writes one row, its
// allocations stop counting and the advance left settles the reopened
// receipts again (0.2 số 100).
import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  supplier,
  supplierPayment,
  supplierPaymentCancellation,
} from "@/db/schema";
import {
  formatDateTime,
  isBusinessDate,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { formatMoney, toMoney, type Money } from "@/domain/money";
import { sellerLabel } from "@/domain/personal-data";
import {
  allocatePayment,
  PAYABLE_MESSAGES,
  PAYMENT_KIND_LABELS,
  PAYMENT_KINDS,
  PAYMENT_PREFIX,
  PAYMENT_TEXT_MAX,
  PayableRuleError,
  type PaymentKind,
} from "@/domain/payables";
import { can } from "@/domain/permissions";
import { PAYMENT_METHODS, type PaymentMethod } from "@/domain/receivables";
import { logActivity } from "@/lib/activity/log";
import {
  isUniqueViolation,
  notFound,
  ok,
  ServiceFailure,
  type Actor,
  type ServiceResult,
} from "@/lib/catalog/common";
import { ContractFieldError, forbidden } from "@/lib/contracts/common";
import { isUuid } from "@/lib/deliveries/records";
import { nextDocumentCode } from "@/lib/inventory/counter";

import { settleAdvances } from "./advances";
import { openPayableOf, readLedger, type SupplierLedger } from "./balances";
import {
  insertAllocations,
  lockSupplier,
  run,
  type LockedSupplier,
} from "./common";

export const PAYMENT_DOCUMENT_TYPE = "SUPPLIER_PAYMENT" as const;

export const PAYMENT_MESSAGES = {
  kind: "Bạn chọn Trả tiền hàng hoặc Ứng trước.",
  method: "Bạn chọn Tiền mặt hoặc Chuyển khoản.",
  date: "Bạn nhập ngày chi.",
  request: "Thiếu mã yêu cầu. Bạn tải lại trang rồi ghi.",
  requestReused:
    "Phiếu này đã được gửi với số liệu khác. Bạn tải lại trang rồi ghi lại.",
  reasonTooLong: `Lý do dài tối đa ${PAYMENT_TEXT_MAX} ký tự.`,
} as const;

export interface PaymentBody {
  requestId?: string;
  supplierId?: string;
  kind?: string;
  amount?: number;
  method?: string;
  paidDate?: string;
  note?: string | null;
  /** Receipts the accountant named; `seen` is what the form showed as left. */
  allocations?: { goodsReceiptId?: string; amount?: number; seen?: number }[];
}

export interface PaymentOptions {
  now?: Date;
}

export interface PlannedPart {
  goodsReceiptId: string;
  code: string;
  amount: Money;
  mode: "AUTO" | "MANUAL";
  /** What the receipt still owes after this payment. */
  left: Money;
}

export interface PaymentPlan {
  parts: PlannedPart[];
  advance: Money;
  owedBefore: Money;
  owedAfter: Money;
}

export interface SavedPayment extends PaymentPlan {
  id: string;
  code: string;
  replayed: boolean;
}

interface CleanBody {
  requestId: string;
  supplierId: string;
  kind: PaymentKind;
  amount: Money;
  method: PaymentMethod;
  paidDate: BusinessDate;
  note: string | null;
  manual: { debtKey: string; amount: Money; seen?: number }[];
}

function field(message: string, name: string): never {
  throw new ContractFieldError(message, name);
}

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function clean(body: PaymentBody, today: BusinessDate): CleanBody {
  if (!isUuid(body.requestId)) field(PAYMENT_MESSAGES.request, "requestId");
  if (!isUuid(body.supplierId)) throw new ServiceFailure(notFound());
  const kind = body.kind as PaymentKind;
  if (!PAYMENT_KINDS.includes(kind)) field(PAYMENT_MESSAGES.kind, "kind");
  if (!isAmount(body.amount)) field(PAYABLE_MESSAGES.amount, "amount");
  const method = body.method as PaymentMethod;
  if (!PAYMENT_METHODS.includes(method)) {
    field(PAYMENT_MESSAGES.method, "method");
  }
  const date = body.paidDate ?? "";
  if (!isBusinessDate(date)) field(PAYMENT_MESSAGES.date, "paidDate");
  if (date > today) field(PAYABLE_MESSAGES.paidDateFuture(today), "paidDate");
  const note = (body.note ?? "").trim();
  if (note.length > PAYMENT_TEXT_MAX)
    field(PAYABLE_MESSAGES.textTooLong, "note");
  const manual =
    kind === "ADVANCE"
      ? []
      : (body.allocations ?? []).map((part, index) => {
          if (
            !isAmount(part.amount) ||
            typeof part.goodsReceiptId !== "string"
          ) {
            field(PAYABLE_MESSAGES.amount, `allocations.${index}.amount`);
          }
          return {
            debtKey: part.goodsReceiptId,
            amount: toMoney(part.amount),
            seen: part.seen,
          };
        });
  return {
    requestId: body.requestId,
    supplierId: body.supplierId,
    kind,
    amount: toMoney(body.amount),
    method,
    paidDate: date,
    note: note || null,
    manual,
  };
}

function assertManager(actor: Actor): void {
  if (!can(actor.role, "payments.manage"))
    throw new ServiceFailure(forbidden());
}

function planOf(
  ledger: SupplierLedger,
  name: string,
  body: Pick<CleanBody, "amount" | "kind" | "manual">,
): PaymentPlan {
  const byKey = new Map(ledger.payables.map((row) => [row.key, row]));
  const result = allocatePayment({
    kind: body.kind,
    amount: body.amount,
    supplierName: name,
    openPayables: ledger.payables.map(openPayableOf),
    manual: body.manual,
    seen: new Map(
      body.manual
        .filter((part) => typeof part.seen === "number")
        .map((part) => [part.debtKey, toMoney(part.seen ?? 0)]),
    ),
  });
  const taken = new Map<string, number>();
  const parts = result.allocations.map((row) => {
    const payable = byKey.get(row.debtKey);
    const before = (payable?.remaining ?? 0) - (taken.get(row.debtKey) ?? 0);
    taken.set(row.debtKey, (taken.get(row.debtKey) ?? 0) + row.amount);
    return {
      goodsReceiptId: row.debtKey,
      code: payable?.code ?? row.debtKey,
      amount: row.amount,
      mode: row.mode,
      left: toMoney(before - row.amount),
    };
  });
  const used = parts.reduce((sum, part) => sum + part.amount, 0);
  return {
    parts,
    advance: result.advance,
    owedBefore: ledger.owed,
    owedAfter: toMoney(ledger.owed - used),
  };
}

function createSummary(
  who: LockedSupplier,
  body: CleanBody,
  plan: PaymentPlan,
): string {
  const head = `${sellerLabel(who)} · ${PAYMENT_KIND_LABELS[body.kind]} ${formatMoney(body.amount)}`;
  const parts = plan.parts.map(
    (part) => `${part.code} ${formatMoney(part.amount)}`,
  );
  if (plan.advance > 0) {
    parts.push(`giữ làm tiền ứng trước ${formatMoney(plan.advance)}`);
  }
  return parts.length ? `${head} · ${parts.join(", ")}` : head;
}

/**
 * The payment already recorded for this request id. A different payment
 * under the same id (another seller, kind or amount) is refused (409).
 */
async function replay(
  db: Pick<Database, "select">,
  input: CleanBody,
): Promise<SavedPayment | null> {
  const [row] = await db
    .select({
      id: supplierPayment.id,
      code: supplierPayment.code,
      supplierId: supplierPayment.supplierId,
      kind: supplierPayment.kind,
      amount: supplierPayment.amount,
    })
    .from(supplierPayment)
    .where(eq(supplierPayment.requestId, input.requestId));
  if (!row) return null;
  if (
    row.supplierId !== input.supplierId ||
    row.kind !== input.kind ||
    row.amount !== input.amount
  ) {
    throw new PayableRuleError(PAYMENT_MESSAGES.requestReused, 409);
  }
  const zero = toMoney(0);
  return {
    id: row.id,
    code: row.code,
    parts: [],
    advance: zero,
    owedBefore: zero,
    owedAfter: zero,
    replayed: true,
  };
}

async function supplierName(
  db: Pick<Database, "select">,
  id: string,
): Promise<string> {
  const [row] = await db
    .select({ name: supplier.name })
    .from(supplier)
    .where(eq(supplier.id, id));
  if (!row) throw new ServiceFailure(notFound());
  return row.name;
}

/** What a payment would settle, without writing anything (the D14c form). */
export function previewPayment(
  db: Database,
  actor: Actor,
  body: PaymentBody,
  options: PaymentOptions = {},
): Promise<ServiceResult<PaymentPlan>> {
  return run(async () => {
    assertManager(actor);
    const today = toBusinessDate(options.now ?? new Date());
    const input = clean(
      { ...body, requestId: body.requestId ?? crypto.randomUUID() },
      today,
    );
    const name = await supplierName(db, input.supplierId);
    const ledger = await readLedger(db, input.supplierId, today);
    return ok(planOf(ledger, name, input));
  });
}

/** "Ghi phiếu chi": one transaction, supplier locked, one activity row. */
export function recordPayment(
  db: Database,
  actor: Actor,
  body: PaymentBody,
  options: PaymentOptions = {},
): Promise<ServiceResult<SavedPayment>> {
  return run(async () => {
    assertManager(actor);
    const now = options.now ?? new Date();
    const today = toBusinessDate(now);
    const input = clean(body, today);
    const done = await replay(db, input);
    if (done) return ok(done);
    return db
      .transaction(async (tx) => {
        const who = await lockSupplier(tx, input.supplierId);
        if (who.anonymizedAt) {
          throw new PayableRuleError(PAYABLE_MESSAGES.sellerAnonymized, 409);
        }
        const ledger = await readLedger(tx, input.supplierId, today);
        const plan = planOf(ledger, who.name, input);
        const code = await nextDocumentCode(
          tx,
          PAYMENT_PREFIX,
          Number(today.slice(0, 4)),
        );
        const [saved] = await tx
          .insert(supplierPayment)
          .values({
            code,
            supplierId: input.supplierId,
            kind: input.kind,
            amount: input.amount,
            method: input.method,
            paidDate: input.paidDate,
            note: input.note,
            requestId: input.requestId,
            createdBy: actor.id,
            createdAt: now,
          })
          .returning({ id: supplierPayment.id });
        const id = saved?.id ?? "";
        await insertAllocations(
          tx,
          actor,
          who,
          plan.parts.map((part) => ({
            paymentId: id,
            goodsReceiptId: part.goodsReceiptId,
            amount: part.amount,
            mode: part.mode,
          })),
          now,
        );
        await logActivity(
          tx,
          actor,
          {
            action: "CREATE",
            document: { type: PAYMENT_DOCUMENT_TYPE, id, code },
            summary: createSummary(who, input, plan),
          },
          { now },
        );
        return ok({ ...plan, id, code, replayed: false });
      })
      .catch(async (error: unknown) => {
        // Two submits of one form at once: the second sees the first one.
        if (!isUniqueViolation(error)) throw error;
        const first = await replay(db, input);
        if (!first) throw error;
        return ok(first);
      });
  });
}

export interface CancelBody {
  reason?: string | null;
}

export interface CancelledPayment {
  id: string;
  code: string;
  reopened: { code: string; amount: Money }[];
  resettled: Money;
}

/** "Hủy": a cancellation row, the receipts reopen, the advance settles again. */
export function cancelPayment(
  db: Database,
  actor: Actor,
  id: string,
  body: CancelBody,
  options: PaymentOptions = {},
): Promise<ServiceResult<CancelledPayment>> {
  return run(async () => {
    assertManager(actor);
    if (!isUuid(id)) throw new ServiceFailure(notFound());
    const reason = (body.reason ?? "").trim();
    if (!reason) field(PAYABLE_MESSAGES.reasonRequired, "reason");
    if (reason.length > PAYMENT_TEXT_MAX) {
      field(PAYMENT_MESSAGES.reasonTooLong, "reason");
    }
    const now = options.now ?? new Date();
    const today = toBusinessDate(now);
    return db.transaction(async (tx) => {
      const [head] = await tx
        .select({
          id: supplierPayment.id,
          supplierId: supplierPayment.supplierId,
        })
        .from(supplierPayment)
        .where(eq(supplierPayment.id, id));
      if (!head) throw new ServiceFailure(notFound());
      await lockSupplier(tx, head.supplierId);
      const ledger = await readLedger(tx, head.supplierId, today);
      const row = ledger.payments.find((entry) => entry.id === id);
      if (!row) throw new ServiceFailure(notFound());
      if (row.cancelled) {
        throw new PayableRuleError(
          PAYABLE_MESSAGES.alreadyCancelled(
            row.code,
            formatDateTime(row.cancelled.at),
            row.cancelled.byName,
          ),
          409,
        );
      }
      await tx.insert(supplierPaymentCancellation).values({
        paymentId: id,
        reason,
        cancelledBy: actor.id,
        cancelledAt: now,
      });
      const codes = new Map(ledger.payables.map((p) => [p.key, p.code]));
      const reopenedBy = new Map<string, number>();
      for (const entry of ledger.allocations) {
        if (entry.paymentId !== id || !entry.live) continue;
        reopenedBy.set(
          entry.goodsReceiptId,
          (reopenedBy.get(entry.goodsReceiptId) ?? 0) + entry.amount,
        );
      }
      const reopened = [...reopenedBy].map(([key, amount]) => ({
        code: codes.get(key) ?? key,
        amount: toMoney(amount),
      }));
      const resettled = await settleAdvances(
        tx,
        head.supplierId,
        actor,
        today,
        now,
      );
      const parts = [`${row.code} · ${formatMoney(row.amount)}`];
      if (reopened.length) {
        parts.push(
          `mở lại ${reopened.map((r) => `${r.code} ${formatMoney(r.amount)}`).join(", ")}`,
        );
      }
      if (resettled > 0) {
        parts.push(`trừ lại từ tiền ứng trước ${formatMoney(resettled)}`);
      }
      parts.push(`lý do: ${reason}`);
      await logActivity(
        tx,
        actor,
        {
          action: "CANCEL",
          document: { type: PAYMENT_DOCUMENT_TYPE, id, code: row.code },
          summary: parts.join(" · "),
        },
        { now },
      );
      return ok({ id, code: row.code, reopened, resettled });
    });
  });
}

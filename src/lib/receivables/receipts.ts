// Receipts (customer-receipts spec, design D2, D3, D5): the accountant or the
// director records what a customer paid. A payment settles debts in the
// fixed order (or the ones the customer named first, 0.2 #19); what is left
// is prepayment (0.2 #82). A cash deposit belongs to one contract and waits
// for its settlement (0.2 #40, #88). A receipt is never changed: cancelling
// writes one cancellation row, its allocations stop counting, and the
// prepayment left settles the reopened debts again (0.2 #83).
import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contract,
  contractDeposit,
  contractSettlement,
  receipt,
  receiptCancellation,
} from "@/db/schema";
import {
  formatBusinessDate,
  formatDateTime,
  isBusinessDate,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { formatMoney, toMoney, type Money } from "@/domain/money";
import { can } from "@/domain/permissions";
import {
  allocate,
  PAYMENT_METHODS,
  RECEIPT_KIND_LABELS,
  RECEIPT_KINDS,
  ReceivableRuleError,
  type PaymentMethod,
  type ReceiptKind,
} from "@/domain/receivables";
import { logActivity } from "@/lib/activity/log";
import {
  isUniqueViolation,
  notFound,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import {
  ContractFieldError,
  forbidden,
  type ContractActor,
  type Tx,
} from "@/lib/contracts/common";
import { contractTermsAt } from "@/lib/contracts/terms";
import { isUuid } from "@/lib/deliveries/records";
import { nextDocumentCode } from "@/lib/inventory/counter";

import {
  openDebtOf,
  readLedger,
  type CustomerLedger,
  type DebtView,
} from "./balances";
import {
  insertAllocations,
  lockCustomer,
  run,
  type LockedCustomer,
} from "./common";
import { settleCredits } from "./credits";

export const RECEIPT_PREFIX = "PT";
export const RECEIPT_DOCUMENT_TYPE = "RECEIPT" as const;
const NOTE_MAX = 500;

export const RECEIPT_MESSAGES = {
  amount: "Số tiền phải lớn hơn 0 ₫.",
  kind: "Bạn chọn Trả nợ hoặc Nộp cọc tiền.",
  method: "Bạn chọn Tiền mặt hoặc Chuyển khoản.",
  date: "Bạn nhập ngày thu.",
  future: (today: BusinessDate) =>
    `Ngày thu không được sau hôm nay (${formatBusinessDate(today)}).`,
  note: `Ghi chú dài tối đa ${NOTE_MAX} ký tự.`,
  request: "Thiếu mã yêu cầu. Bạn tải lại trang rồi ghi.",
  requestReused:
    "Phiếu này đã được gửi với số liệu khác. Bạn tải lại trang rồi ghi lại.",
  contract: "Bạn chọn hợp đồng nhận cọc.",
  notTheirContract: "Hợp đồng này không thuộc nhà thầu đang chọn.",
  closedContract: "Hợp đồng đã thanh lý nên không nhận cọc.",
  contractNotInForce: "Chỉ nhận cọc khi hợp đồng Đã duyệt hoặc Đang thực hiện.",
  noDeposit: (code: string) => `Hợp đồng ${code} không có cọc tiền thỏa thuận.`,
  overDeposit: (code: string, room: Money, agreed: Money, received: Money) =>
    `Hợp đồng ${code} còn nhận cọc tối đa ${formatMoney(room)} (thỏa thuận ${formatMoney(agreed)}, đã nhận ${formatMoney(received)}).`,
  manualOnDeposit: "Phiếu nộp cọc không trừ vào khoản nợ nào.",
  reason: "Bạn ghi lý do hủy phiếu thu.",
  reasonTooLong: `Lý do dài tối đa ${NOTE_MAX} ký tự.`,
  alreadyCancelled: (code: string, at: Date, by: string) =>
    `Phiếu ${code} đã hủy lúc ${formatDateTime(at)} bởi ${by}.`,
  settledDeposit: (code: string, contractCode: string) =>
    `Phiếu ${code} là cọc đã cấn trừ khi thanh lý ${contractCode} nên không hủy được.`,
} as const;

export interface ReceiptBody {
  requestId?: string;
  customerId?: string;
  kind?: string;
  contractId?: string | null;
  amount?: number;
  method?: string;
  receivedDate?: string;
  note?: string | null;
  /** Debts the customer named; `seen` is what the form showed as left. */
  allocations?: { debtKey?: string; amount?: number; seen?: number }[];
}

export interface ReceiptOptions {
  now?: Date;
}

export interface PlannedLine {
  debtKey: string;
  label: string;
  amount: Money;
  mode: "AUTO" | "MANUAL";
  /** What the debt still owes after this receipt. */
  left: Money;
}

export interface ReceiptPlan {
  lines: PlannedLine[];
  prepaid: Money;
  owedBefore: Money;
  owedAfter: Money;
}

export interface SavedReceipt extends ReceiptPlan {
  id: string;
  code: string;
  replayed: boolean;
}

interface CleanBody {
  requestId: string;
  customerId: string;
  kind: ReceiptKind;
  contractId: string | null;
  amount: Money;
  method: PaymentMethod;
  receivedDate: BusinessDate;
  note: string | null;
  manual: { debtKey: string; amount: Money; seen?: number }[];
}

function field(message: string, name: string): never {
  throw new ContractFieldError(message, name);
}

function clean(body: ReceiptBody, today: BusinessDate): CleanBody {
  if (!isUuid(body.requestId)) field(RECEIPT_MESSAGES.request, "requestId");
  if (!isUuid(body.customerId)) throw new ServiceFailure(notFound());
  const kind = body.kind as ReceiptKind;
  if (!RECEIPT_KINDS.includes(kind)) field(RECEIPT_MESSAGES.kind, "kind");
  const amount = body.amount;
  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    field(RECEIPT_MESSAGES.amount, "amount");
  }
  const method = body.method as PaymentMethod;
  if (!PAYMENT_METHODS.includes(method))
    field(RECEIPT_MESSAGES.method, "method");
  const date = body.receivedDate ?? "";
  if (!isBusinessDate(date)) field(RECEIPT_MESSAGES.date, "receivedDate");
  if (date > today) field(RECEIPT_MESSAGES.future(today), "receivedDate");
  const note = (body.note ?? "").trim();
  if (note.length > NOTE_MAX) field(RECEIPT_MESSAGES.note, "note");
  let contractId: string | null = null;
  const manual = (body.allocations ?? []).map((part, index) => {
    const value = part.amount;
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      typeof part.debtKey !== "string"
    ) {
      field(RECEIPT_MESSAGES.amount, `allocations.${index}.amount`);
    }
    return {
      debtKey: part.debtKey,
      amount: toMoney(value),
      seen: part.seen,
    };
  });
  if (kind === "DEPOSIT") {
    if (!isUuid(body.contractId))
      field(RECEIPT_MESSAGES.contract, "contractId");
    if (manual.length) field(RECEIPT_MESSAGES.manualOnDeposit, "allocations");
    contractId = body.contractId;
  }
  return {
    requestId: body.requestId,
    customerId: body.customerId,
    kind,
    contractId,
    amount: toMoney(amount),
    method,
    receivedDate: date,
    note: note || null,
    manual,
  };
}

function assertManager(actor: ContractActor): void {
  if (!can(actor.role, "receipts.manage"))
    throw new ServiceFailure(forbidden());
}

/** "Kỳ 10/2026 082026/ANPHAT-MINHPHAT", "PX-2026-041". */
export function debtLabel(
  debt: Pick<DebtView, "kind" | "label" | "contractCode">,
) {
  return debt.kind === "BILLING"
    ? `${debt.label} ${debt.contractCode}`
    : debt.label;
}

function planOf(
  ledger: CustomerLedger,
  body: Pick<CleanBody, "amount" | "manual">,
): ReceiptPlan {
  const byKey = new Map(ledger.debts.map((debt) => [debt.key, debt]));
  const result = allocate({
    amount: body.amount,
    openDebts: ledger.debts.map((debt) => ({
      ...openDebtOf(debt),
      label: debtLabel(debt),
    })),
    manual: body.manual,
    seen: new Map(
      body.manual
        .filter((part) => typeof part.seen === "number")
        .map((part) => [part.debtKey, toMoney(part.seen ?? 0)]),
    ),
  });
  const taken = new Map<string, number>();
  const lines = result.allocations.map((row) => {
    const debt = byKey.get(row.debtKey);
    const before = (debt?.remaining ?? 0) - (taken.get(row.debtKey) ?? 0);
    taken.set(row.debtKey, (taken.get(row.debtKey) ?? 0) + row.amount);
    return {
      debtKey: row.debtKey,
      label: debt ? debtLabel(debt) : row.debtKey,
      amount: row.amount,
      mode: row.mode as "AUTO" | "MANUAL",
      left: toMoney(before - row.amount),
    };
  });
  const used = lines.reduce((sum, line) => sum + line.amount, 0);
  return {
    lines,
    prepaid: result.unapplied,
    owedBefore: ledger.owed,
    owedAfter: toMoney(ledger.owed - used),
  };
}

async function checkDeposit(tx: Tx, body: CleanBody): Promise<string> {
  const [row] = await tx
    .select({
      id: contract.id,
      code: contract.code,
      customerId: contract.customerId,
      status: contract.status,
    })
    .from(contract)
    .where(eq(contract.id, body.contractId ?? ""))
    .for("share");
  if (!row) throw new ServiceFailure(notFound());
  if (row.customerId !== body.customerId) {
    field(RECEIPT_MESSAGES.notTheirContract, "contractId");
  }
  if (row.status === "CLOSED")
    field(RECEIPT_MESSAGES.closedContract, "contractId");
  if (row.status !== "APPROVED" && row.status !== "ACTIVE") {
    field(RECEIPT_MESSAGES.contractNotInForce, "contractId");
  }
  return row.code;
}

/** Agreed cash deposit (revision in force today) and what was received. */
export async function depositRoom(
  tx: Pick<Database, "select">,
  contractId: string,
  today: BusinessDate,
): Promise<{ agreed: Money; received: Money }> {
  const terms = await contractTermsAt(tx, contractId, today);
  const deposits = terms
    ? await tx
        .select({ amount: contractDeposit.amount })
        .from(contractDeposit)
        .where(
          and(
            eq(contractDeposit.revisionId, terms.revisionId),
            eq(contractDeposit.kind, "CASH"),
          ),
        )
    : [];
  const receipts = await tx
    .select({
      amount: receipt.amount,
      cancelled: receiptCancellation.receiptId,
    })
    .from(receipt)
    .leftJoin(
      receiptCancellation,
      eq(receiptCancellation.receiptId, receipt.id),
    )
    .where(
      and(eq(receipt.contractId, contractId), eq(receipt.kind, "DEPOSIT")),
    );
  return {
    agreed: toMoney(deposits.reduce((sum, row) => sum + row.amount, 0)),
    received: toMoney(
      receipts
        .filter((row) => row.cancelled === null)
        .reduce((sum, row) => sum + row.amount, 0),
    ),
  };
}

function createSummary(
  who: LockedCustomer,
  body: CleanBody,
  plan: ReceiptPlan,
  contractCode: string | null,
): string {
  const head = `${who.name} · ${RECEIPT_KIND_LABELS[body.kind]} ${formatMoney(body.amount)}`;
  if (body.kind === "DEPOSIT") return `${head} · cọc ${contractCode ?? ""}`;
  const parts = plan.lines.map(
    (line) => `${line.label} ${formatMoney(line.amount)}`,
  );
  if (plan.prepaid > 0) parts.push(`trả trước ${formatMoney(plan.prepaid)}`);
  return parts.length ? `${head} · ${parts.join(", ")}` : head;
}

/**
 * The receipt already recorded for this request id. A different receipt
 * under the same id (another customer, kind or amount) is refused (409).
 */
async function replay(
  db: Pick<Database, "select">,
  input: CleanBody,
): Promise<SavedReceipt | null> {
  const [row] = await db
    .select({
      id: receipt.id,
      code: receipt.code,
      customerId: receipt.customerId,
      kind: receipt.kind,
      amount: receipt.amount,
    })
    .from(receipt)
    .where(eq(receipt.requestId, input.requestId));
  if (!row) return null;
  if (
    row.customerId !== input.customerId ||
    row.kind !== input.kind ||
    row.amount !== input.amount
  ) {
    throw new ReceivableRuleError(RECEIPT_MESSAGES.requestReused, 409);
  }
  const zero = toMoney(0);
  return {
    id: row.id,
    code: row.code,
    lines: [],
    prepaid: zero,
    owedBefore: zero,
    owedAfter: zero,
    replayed: true,
  };
}

/** What a payment would settle, without writing anything (the D14 form). */
export function previewReceipt(
  db: Database,
  actor: ContractActor,
  body: ReceiptBody,
  options: ReceiptOptions = {},
): Promise<ServiceResult<ReceiptPlan>> {
  return run(async () => {
    assertManager(actor);
    const today = toBusinessDate(options.now ?? new Date());
    const input = clean(
      { ...body, requestId: body.requestId ?? crypto.randomUUID() },
      today,
    );
    const ledger = await readLedger(db, input.customerId, today);
    if (input.kind === "DEPOSIT") {
      return ok({
        lines: [],
        prepaid: toMoney(0),
        owedBefore: ledger.owed,
        owedAfter: ledger.owed,
      });
    }
    return ok(planOf(ledger, input));
  });
}

/** "Ghi phiếu thu": one transaction, customer locked, one activity row. */
export async function recordReceipt(
  db: Database,
  actor: ContractActor,
  body: ReceiptBody,
  options: ReceiptOptions = {},
): Promise<ServiceResult<SavedReceipt>> {
  const result = await run(async () => {
    assertManager(actor);
    const now = options.now ?? new Date();
    const today = toBusinessDate(now);
    const input = clean(body, today);
    const done = await replay(db, input);
    if (done) return ok(done);
    return db
      .transaction(async (tx) => {
        let contractCode: string | null = null;
        if (input.kind === "DEPOSIT") {
          contractCode = await checkDeposit(tx, input);
        }
        const who = await lockCustomer(tx, input.customerId);
        const ledger = await readLedger(tx, input.customerId, today);
        let plan: ReceiptPlan = {
          lines: [],
          prepaid: toMoney(0),
          owedBefore: ledger.owed,
          owedAfter: ledger.owed,
        };
        if (input.kind === "DEPOSIT" && input.contractId && contractCode) {
          const room = await depositRoom(tx, input.contractId, today);
          if (room.agreed <= 0) {
            field(RECEIPT_MESSAGES.noDeposit(contractCode), "contractId");
          }
          const left = toMoney(room.agreed - room.received);
          if (input.amount > left) {
            field(
              RECEIPT_MESSAGES.overDeposit(
                contractCode,
                toMoney(Math.max(left, 0)),
                room.agreed,
                room.received,
              ),
              "amount",
            );
          }
        } else {
          plan = planOf(ledger, input);
        }
        const code = await nextDocumentCode(
          tx,
          RECEIPT_PREFIX,
          Number(today.slice(0, 4)),
        );
        const [saved] = await tx
          .insert(receipt)
          .values({
            code,
            customerId: input.customerId,
            kind: input.kind,
            contractId: input.contractId,
            amount: input.amount,
            method: input.method,
            receivedDate: input.receivedDate,
            note: input.note,
            requestId: input.requestId,
            createdBy: actor.id,
            createdAt: now,
          })
          .returning({ id: receipt.id });
        const id = saved?.id ?? "";
        await insertAllocations(
          tx,
          actor,
          who,
          plan.lines.map((line) => ({
            sourceKey: `receipt:${id}`,
            debtKey: line.debtKey,
            amount: line.amount,
            mode: line.mode,
          })),
        );
        await logActivity(
          tx,
          actor,
          {
            action: "CREATE",
            document: { type: RECEIPT_DOCUMENT_TYPE, id, code },
            summary: createSummary(who, input, plan, contractCode),
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
  return result;
}

export interface CancelBody {
  reason?: string | null;
}

export interface CancelledReceipt {
  id: string;
  code: string;
  reopened: { label: string; amount: Money }[];
  resettled: Money;
}

/** "Hủy": a cancellation row, the debts reopen, prepayment settles again. */
export function cancelReceipt(
  db: Database,
  actor: ContractActor,
  id: string,
  body: CancelBody,
  options: ReceiptOptions = {},
): Promise<ServiceResult<CancelledReceipt>> {
  return run(async () => {
    assertManager(actor);
    if (!isUuid(id)) throw new ServiceFailure(notFound());
    const reason = (body.reason ?? "").trim();
    if (!reason) field(RECEIPT_MESSAGES.reason, "reason");
    if (reason.length > NOTE_MAX)
      field(RECEIPT_MESSAGES.reasonTooLong, "reason");
    const now = options.now ?? new Date();
    const today = toBusinessDate(now);
    return db.transaction(async (tx) => {
      const [head] = await tx
        .select({
          id: receipt.id,
          code: receipt.code,
          customerId: receipt.customerId,
          amount: receipt.amount,
        })
        .from(receipt)
        .where(eq(receipt.id, id));
      if (!head) throw new ServiceFailure(notFound());
      await lockCustomer(tx, head.customerId);
      const ledger = await readLedger(tx, head.customerId, today);
      const row = ledger.receipts.find((entry) => entry.id === id);
      if (!row) throw new ServiceFailure(notFound());
      if (row.cancelled) {
        throw new ReceivableRuleError(
          RECEIPT_MESSAGES.alreadyCancelled(
            row.code,
            row.cancelled.at,
            row.cancelled.byName,
          ),
          409,
        );
      }
      const mine = ledger.allocations.filter(
        (entry) => entry.receiptId === id && entry.live,
      );
      const settled =
        row.kind === "DEPOSIT" && row.contractId
          ? await tx
              .select({ id: contractSettlement.id })
              .from(contractSettlement)
              .where(eq(contractSettlement.contractId, row.contractId))
          : [];
      if (
        settled.length > 0 ||
        mine.some((entry) => entry.settlementId !== null)
      ) {
        throw new ReceivableRuleError(
          RECEIPT_MESSAGES.settledDeposit(row.code, row.contractCode ?? ""),
          409,
        );
      }
      await tx.insert(receiptCancellation).values({
        receiptId: id,
        reason,
        cancelledBy: actor.id,
        cancelledAt: now,
      });
      const byKey = new Map(ledger.debts.map((debt) => [debt.key, debt]));
      const reopenedBy = new Map<string, number>();
      for (const entry of mine) {
        reopenedBy.set(
          entry.debtKey,
          (reopenedBy.get(entry.debtKey) ?? 0) + entry.amount,
        );
      }
      const reopened = [...reopenedBy].map(([key, amount]) => {
        const debt = byKey.get(key);
        return { label: debt ? debtLabel(debt) : key, amount: toMoney(amount) };
      });
      const resettled = await settleCredits(tx, head.customerId, actor, today);
      const parts = [`${row.code} · ${formatMoney(row.amount)}`];
      if (reopened.length) {
        parts.push(
          `mở lại ${reopened.map((r) => `${r.label} ${formatMoney(r.amount)}`).join(", ")}`,
        );
      }
      if (resettled > 0) {
        parts.push(`trừ lại từ tiền trả trước ${formatMoney(resettled)}`);
      }
      parts.push(`lý do: ${reason}`);
      await logActivity(
        tx,
        actor,
        {
          action: "CANCEL",
          document: { type: RECEIPT_DOCUMENT_TYPE, id, code: row.code },
          summary: parts.join(" · "),
        },
        { now },
      );
      return ok({ id, code: row.code, reopened, resettled });
    });
  });
}

/** Receipts of a customer for D14 (newest first) with what each settled. */
export function receiptsWithAllocations(ledger: CustomerLedger): {
  receipt: CustomerLedger["receipts"][number];
  settled: { label: string; amount: Money }[];
  prepaid: Money;
}[] {
  const byKey = new Map(ledger.debts.map((debt) => [debt.key, debt]));
  return ledger.receipts.map((row) => {
    const mine = ledger.allocations.filter(
      (entry) => entry.receiptId === row.id,
    );
    const sums = new Map<string, number>();
    for (const entry of mine) {
      sums.set(entry.debtKey, (sums.get(entry.debtKey) ?? 0) + entry.amount);
    }
    const settled = [...sums].map(([key, amount]) => {
      const debt = byKey.get(key);
      return { label: debt ? debtLabel(debt) : key, amount: toMoney(amount) };
    });
    const used = mine
      .filter((entry) => entry.live)
      .reduce((sum, entry) => sum + entry.amount, 0);
    return {
      receipt: row,
      settled,
      prepaid: toMoney(
        row.kind === "PAYMENT" && !row.cancelled ? row.amount - used : 0,
      ),
    };
  });
}

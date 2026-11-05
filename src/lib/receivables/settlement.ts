// Settling a contract (contract-settlement spec, design D4; 0.2 #40, #81,
// #85, #87): the accountant or the director closes a running contract once
// nothing is left on site, every rent month is closed and no document waits.
// The cash deposit received is set off against the contract's own debts,
// the rest is recorded as refunded, and the contract becomes CLOSED.
import { and, desc, eq, inArray, or } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  buyBackNote,
  compensationNote,
  contract,
  contractRevision,
  contractSettlement,
  customer,
  deliveryNote,
  item,
  returnNote,
  site,
  siteTransfer,
  user,
} from "@/db/schema";
import {
  formatBusinessDate,
  formatDateTime,
  isBusinessDate,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { transition, type ContractStatus } from "@/domain/contract";
import { formatMoney, toMoney, type Money } from "@/domain/money";
import { can } from "@/domain/permissions";
import {
  PAYMENT_METHODS,
  ReceivableRuleError,
  settlementPlan,
  type CreditSource,
  type PaymentMethod,
  type SettlementPlan,
} from "@/domain/receivables";
import { formatMonth, monthOf, nextMonth } from "@/domain/rental-billing";
import { logActivity } from "@/lib/activity/log";
import { openEarlierMonths, loadBillingSource } from "@/lib/billing/compute";
import {
  notFound,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import {
  ContractFieldError,
  forbidden,
  type ContractActor,
} from "@/lib/contracts/common";
import { lockContract } from "@/lib/contracts/records";
import { isUuid, onSiteByItem } from "@/lib/deliveries/records";
import { readHolidays } from "@/lib/holidays/queries";

import { openDebtOf, readLedger, type DebtView } from "./balances";
import { insertAllocations, lockCustomer, run } from "./common";
import type { Reader } from "./debts";
import { debtLabel } from "./receipts";

export const SETTLEMENT_MESSAGES = {
  notActive:
    "Chỉ hợp đồng Đang thực hiện mới thanh lý được. Hợp đồng chưa giao hàng thì hủy.",
  closed: (at: Date, by: string) =>
    `Hợp đồng đã thanh lý lúc ${formatDateTime(at)} bởi ${by}.`,
  onSite: (items: string) =>
    `Công trình còn ${items} của hợp đồng. Bạn thu hồi hết hàng rồi thanh lý.`,
  openMonth: (month: string, from: string) =>
    `Kỳ ${formatMonth(month)} chưa chốt (chốt được từ ${formatBusinessDate(from)})`,
  openAdjustment: (month: string) =>
    `Kỳ ${formatMonth(month)} có điều chỉnh chưa chốt`,
  rentNotClosed: (detail: string) =>
    `${detail}. Bạn chốt kỳ tiền thuê rồi thanh lý.`,
  pendingCompensation: (code: string) =>
    `Còn phiếu đền bù ${code} Chờ duyệt. Giám đốc duyệt hoặc từ chối trước rồi thanh lý.`,
  pendingBuyBack: (code: string) =>
    `Còn phiếu mua lại ${code} Chờ duyệt. Giám đốc duyệt hoặc từ chối trước rồi thanh lý.`,
  pendingDelivery: (code: string) =>
    `Còn phiếu xuất ${code} chưa xong. Bạn hủy hoặc ghi sổ phiếu đó trước rồi thanh lý.`,
  pendingTransfer: (code: string) =>
    `Còn phiếu chuyển công trình ${code} chưa xong. Bạn hủy hoặc ghi sổ phiếu đó trước rồi thanh lý.`,
  pendingAmendment: (code: string) =>
    `Còn phụ lục ${code} Chờ duyệt. Bạn duyệt hoặc hủy phụ lục trước rồi thanh lý.`,
  refundDetails: "Bạn nhập ngày hoàn cọc và hình thức.",
  refundFuture: (today: BusinessDate) =>
    `Ngày hoàn không được sau hôm nay (${formatBusinessDate(today)}).`,
} as const;

export type CheckKey = "ON_SITE" | "RENT_CLOSED" | "NOTHING_PENDING";

export interface SettlementCheck {
  key: CheckKey;
  ok: boolean;
  /** What D14b shows: the fact when met, the blocker when not. */
  detail: string;
  /** The refusal of the command when not met. */
  refusal: string | null;
}

export interface SettlementView {
  contract: {
    id: string;
    code: string;
    type: "RENTAL" | "SALE";
    status: ContractStatus;
    customerId: string;
    customerName: string;
    siteName: string | null;
  };
  checks: SettlementCheck[];
  ready: boolean;
  debts: DebtView[];
  plan: SettlementPlan;
  settled: {
    settledDate: string;
    refundAmount: Money;
    refundDate: string | null;
    refundMethod: PaymentMethod | null;
    byName: string;
    at: Date;
  } | null;
}

const numberFormat = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 3,
});

async function onSiteCheck(
  db: Reader,
  contractId: string,
): Promise<SettlementCheck> {
  const left = [...(await onSiteByItem(db, contractId))].filter(
    ([, milli]) => milli > 0,
  );
  if (left.length > 0) {
    const codes = await db
      .select({ id: item.id, code: item.code })
      .from(item)
      .where(
        inArray(
          item.id,
          left.map(([id]) => id),
        ),
      );
    const codeOf = new Map(codes.map((row) => [row.id, row.code]));
    const text = left
      .map(
        ([id, milli]) =>
          `${numberFormat.format(milli / 1000)} ${codeOf.get(id) ?? ""}`,
      )
      .join(", ");
    return {
      key: "ON_SITE",
      ok: false,
      detail: `Hàng ở công trình: còn ${text}`,
      refusal: SETTLEMENT_MESSAGES.onSite(text),
    };
  }
  const [last] = await db
    .select({ code: returnNote.code, day: returnNote.businessDate })
    .from(returnNote)
    .where(eq(returnNote.contractId, contractId))
    .orderBy(desc(returnNote.businessDate), desc(returnNote.code))
    .limit(1);
  return {
    key: "ON_SITE",
    ok: true,
    detail: last
      ? `Hàng ở công trình: 0 · Trả hết ${formatBusinessDate(last.day)} (${last.code})`
      : "Hàng ở công trình: 0",
    refusal: null,
  };
}

async function rentCheck(
  db: Reader,
  contractId: string,
  today: BusinessDate,
): Promise<SettlementCheck> {
  const [source, holidays] = await Promise.all([
    loadBillingSource(db, contractId),
    readHolidays(db),
  ]);
  const closedMonths = [...source.closed.values()].sort((a, b) =>
    a.month.localeCompare(b.month),
  );
  const pendingAdjustment = source.adjustments.find(
    (entry) => !source.closed.has(entry.month),
  );
  if (pendingAdjustment) {
    const detail = SETTLEMENT_MESSAGES.openAdjustment(pendingAdjustment.month);
    return {
      key: "RENT_CLOSED",
      ok: false,
      detail,
      refusal: SETTLEMENT_MESSAGES.rentNotClosed(detail),
    };
  }
  const open =
    source.terms.length === 0
      ? []
      : openEarlierMonths(source, nextMonth(monthOf(today)), today, holidays);
  const first = open[0];
  if (first) {
    const detail = SETTLEMENT_MESSAGES.openMonth(
      first,
      `${nextMonth(first)}-01`,
    );
    return {
      key: "RENT_CLOSED",
      ok: false,
      detail,
      refusal: SETTLEMENT_MESSAGES.rentNotClosed(detail),
    };
  }
  const last = closedMonths.at(-1);
  return {
    key: "RENT_CLOSED",
    ok: true,
    detail: last
      ? `Kỳ tiền thuê cuối đã chốt · Kỳ ${formatMonth(last.month)} chốt ${formatBusinessDate(toBusinessDate(last.closedAt))}`
      : "Không có kỳ tiền thuê nào cần chốt",
    refusal: null,
  };
}

async function pendingCheck(
  db: Reader,
  contractId: string,
  type: "RENTAL" | "SALE",
): Promise<SettlementCheck> {
  const first = async (
    rows: Promise<{ code: string }[]>,
    message: (code: string) => string,
  ) => {
    const [row] = await rows;
    return row ? message(row.code) : null;
  };
  const refusals = await Promise.all([
    type === "RENTAL"
      ? first(
          db
            .select({ code: compensationNote.code })
            .from(compensationNote)
            .where(
              and(
                eq(compensationNote.contractId, contractId),
                eq(compensationNote.status, "PENDING"),
              ),
            )
            .limit(1),
          SETTLEMENT_MESSAGES.pendingCompensation,
        )
      : null,
    type === "RENTAL"
      ? first(
          db
            .select({ code: buyBackNote.code })
            .from(buyBackNote)
            .where(
              and(
                eq(buyBackNote.contractId, contractId),
                eq(buyBackNote.status, "PENDING"),
              ),
            )
            .limit(1),
          SETTLEMENT_MESSAGES.pendingBuyBack,
        )
      : null,
    first(
      db
        .select({ code: deliveryNote.code })
        .from(deliveryNote)
        .where(
          and(
            eq(deliveryNote.contractId, contractId),
            inArray(deliveryNote.status, ["PLANNED", "PICKING"]),
          ),
        )
        .limit(1),
      SETTLEMENT_MESSAGES.pendingDelivery,
    ),
    type === "RENTAL"
      ? first(
          db
            .select({ code: siteTransfer.code })
            .from(siteTransfer)
            .where(
              and(
                or(
                  eq(siteTransfer.fromContractId, contractId),
                  eq(siteTransfer.toContractId, contractId),
                ),
                inArray(siteTransfer.status, ["DRAFT", "SENT"]),
              ),
            )
            .limit(1),
          SETTLEMENT_MESSAGES.pendingTransfer,
        )
      : null,
    first(
      db
        .select({ code: contractRevision.code })
        .from(contractRevision)
        .where(
          and(
            eq(contractRevision.contractId, contractId),
            eq(contractRevision.kind, "AMENDMENT"),
            inArray(contractRevision.status, ["DRAFT", "PENDING"]),
          ),
        )
        .limit(1),
      SETTLEMENT_MESSAGES.pendingAmendment,
    ),
  ]);
  const refusal = refusals.find((entry) => entry !== null) ?? null;
  return {
    key: "NOTHING_PENDING",
    ok: refusal === null,
    detail:
      refusal === null
        ? type === "RENTAL"
          ? "Không còn phiếu chờ · Không có đền bù, mua lại Chờ duyệt; không có phiếu xuất, chuyển chưa xong"
          : "Không còn phiếu chờ · Không có phiếu xuất chưa xong, phụ lục chờ duyệt"
        : refusal,
    refusal,
  };
}

/** Every condition of D14b, read with the same reader the command uses. */
export async function settlementChecks(
  db: Reader,
  contractId: string,
  type: "RENTAL" | "SALE",
  today: BusinessDate,
): Promise<SettlementCheck[]> {
  const pending = await pendingCheck(db, contractId, type);
  if (type === "SALE") return [pending];
  const [onSite, rent] = await Promise.all([
    onSiteCheck(db, contractId),
    rentCheck(db, contractId, today),
  ]);
  return [onSite, rent, pending];
}

/** Deposit receipts of the contract as sources (older first). */
function depositSources(
  ledger: Awaited<ReturnType<typeof readLedger>>,
  contractId: string,
): CreditSource[] {
  const view = ledger.deposits.get(contractId);
  if (!view) return [];
  return view.receipts.map((row) => ({
    key: `receipt:${row.id}`,
    date: row.receivedDate,
    code: row.code,
    available: row.amount,
  }));
}

/** D14b: the contract, its conditions, its debts and the set-off. */
export async function settlementView(
  db: Database,
  contractId: string,
  today: BusinessDate,
): Promise<SettlementView | null> {
  if (!isUuid(contractId)) return null;
  const [head] = await db
    .select({
      id: contract.id,
      code: contract.code,
      type: contract.type,
      status: contract.status,
      customerId: contract.customerId,
    })
    .from(contract)
    .where(eq(contract.id, contractId));
  if (!head) return null;
  const [names] = await db
    .select({ customerName: customer.name, siteName: site.name })
    .from(contract)
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(eq(contract.id, contractId));
  const type = head.type as "RENTAL" | "SALE";
  const [checks, ledger, settled] = await Promise.all([
    settlementChecks(db, contractId, type, today),
    readLedger(db, head.customerId, today),
    db
      .select({
        settledDate: contractSettlement.settledDate,
        refundAmount: contractSettlement.refundAmount,
        refundDate: contractSettlement.refundDate,
        refundMethod: contractSettlement.refundMethod,
        byName: user.name,
        at: contractSettlement.settledAt,
      })
      .from(contractSettlement)
      .innerJoin(user, eq(user.id, contractSettlement.settledBy))
      .where(eq(contractSettlement.contractId, contractId)),
  ]);
  const debts = ledger.debts.filter((debt) => debt.contractId === contractId);
  const plan = settlementPlan({
    deposits: settled[0] ? [] : depositSources(ledger, contractId),
    contractDebts: debts.filter((d) => d.remaining > 0).map(openDebtOf),
  });
  const done = settled[0];
  return {
    contract: {
      id: head.id,
      code: head.code,
      type,
      status: head.status as ContractStatus,
      customerId: head.customerId,
      customerName: names?.customerName ?? "",
      siteName: names?.siteName ?? null,
    },
    checks,
    ready: head.status === "ACTIVE" && checks.every((check) => check.ok),
    debts,
    plan,
    settled: done
      ? {
          ...done,
          refundAmount: toMoney(done.refundAmount),
          refundMethod: done.refundMethod as PaymentMethod | null,
        }
      : null,
  };
}

export interface SettleBody {
  /** The refund D14b showed (409 when it changed). */
  expectedRefund?: number;
  refundDate?: string | null;
  refundMethod?: string | null;
}

export interface SettledContract {
  contractId: string;
  code: string;
  deposit: Money;
  offset: Money;
  refund: Money;
  stillOwed: Money;
}

/** "Thanh lý và ghi cấn trừ cọc": one transaction, one activity row. */
export function settleContract(
  db: Database,
  actor: ContractActor,
  contractId: string,
  body: SettleBody,
  options: { now?: Date } = {},
): Promise<ServiceResult<SettledContract>> {
  return run(async () => {
    if (!can(actor.role, "contracts.close")) {
      throw new ServiceFailure(forbidden());
    }
    if (!isUuid(contractId)) throw new ServiceFailure(notFound());
    const now = options.now ?? new Date();
    const today = toBusinessDate(now);
    return db.transaction(async (tx) => {
      const locked = await lockContract(tx, contractId);
      if (locked.status === "CLOSED") {
        const [done] = await tx
          .select({ at: contractSettlement.settledAt, by: user.name })
          .from(contractSettlement)
          .innerJoin(user, eq(user.id, contractSettlement.settledBy))
          .where(eq(contractSettlement.contractId, locked.id));
        throw new ReceivableRuleError(
          SETTLEMENT_MESSAGES.closed(done?.at ?? now, done?.by ?? ""),
          409,
        );
      }
      if (locked.status !== "ACTIVE") {
        throw new ReceivableRuleError(SETTLEMENT_MESSAGES.notActive, 409);
      }
      const next = transition(
        { status: locked.status, hasDeliveries: true },
        "CLOSE",
      );
      const checks = await settlementChecks(
        tx,
        locked.id,
        locked.type as "RENTAL" | "SALE",
        today,
      );
      const refusal = checks.find((check) => !check.ok)?.refusal;
      if (refusal) throw new ReceivableRuleError(refusal, 409);
      const owner = await lockCustomer(tx, locked.customerId);
      const ledger = await readLedger(tx, locked.customerId, today);
      const plan = settlementPlan({
        deposits: depositSources(ledger, locked.id),
        contractDebts: ledger.debts
          .filter((debt) => debt.contractId === locked.id)
          .filter((debt) => debt.remaining > 0)
          .map((debt) => ({ ...openDebtOf(debt), label: debtLabel(debt) })),
        expectedRefund:
          typeof body.expectedRefund === "number"
            ? toMoney(body.expectedRefund)
            : undefined,
      });
      let refundDate: string | null = null;
      let refundMethod: PaymentMethod | null = null;
      if (plan.refund > 0) {
        const day = body.refundDate ?? "";
        const method = body.refundMethod as PaymentMethod;
        if (!isBusinessDate(day) || !PAYMENT_METHODS.includes(method)) {
          throw new ContractFieldError(
            SETTLEMENT_MESSAGES.refundDetails,
            "refundDate",
          );
        }
        if (day > today) {
          throw new ContractFieldError(
            SETTLEMENT_MESSAGES.refundFuture(today),
            "refundDate",
          );
        }
        refundDate = day;
        refundMethod = method;
      }
      const [row] = await tx
        .insert(contractSettlement)
        .values({
          contractId: locked.id,
          settledDate: today,
          refundAmount: plan.refund,
          refundDate,
          refundMethod,
          settledBy: actor.id,
          settledAt: now,
        })
        .returning({ id: contractSettlement.id });
      await insertAllocations(
        tx,
        actor,
        owner,
        plan.allocations.map((entry) => ({
          ...entry,
          mode: "DEPOSIT" as const,
          settlementId: row?.id ?? "",
        })),
      );
      await tx
        .update(contract)
        .set({ status: next, updatedAt: now })
        .where(eq(contract.id, locked.id));
      await logActivity(
        tx,
        actor,
        {
          action: "SETTLE",
          document: { type: "CONTRACT", id: locked.id, code: locked.code },
          summary: `${locked.code} · cọc ${formatMoney(plan.deposit)} · cấn trừ ${formatMoney(plan.offset)} · hoàn lại ${formatMoney(plan.refund)}`,
        },
        { now },
      );
      return ok({
        contractId: locked.id,
        code: locked.code,
        deposit: plan.deposit,
        offset: plan.offset,
        refund: plan.refund,
        stillOwed: plan.stillOwed,
      });
    });
  });
}

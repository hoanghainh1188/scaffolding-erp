// What D14 shows of one customer (receivables spec "Các khoản của một nhà
// thầu", "Cọc và bảo lãnh trên D14", customer-receipts "Danh sách phiếu thu")
// and the guarantee banner over every customer.
import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contract,
  contractDeposit,
  contractRevision,
  contractSettlement,
  customer,
  receipt,
  receiptCancellation,
  site,
} from "@/db/schema";
import {
  daysBetween,
  formatBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { revisionAt } from "@/domain/contract-revision";
import { guaranteeWarnings, GUARANTEE_WARNING_DAYS } from "@/domain/guarantee";
import { toMoney, type Money } from "@/domain/money";

import { readLedger, type DebtView, type ReceiptRow } from "./balances";
import type { Reader } from "./debts";
import { receiptsWithAllocations } from "./receipts";
import { isUuid } from "@/lib/deliveries/records";

export interface GuaranteeView {
  bankName: string;
  guaranteeNumber: string;
  amount: Money;
  expiryDate: string;
  warning: string | null;
  daysLeft: number;
}

export interface ContractDepositView {
  contractId: string;
  contractCode: string;
  status: string;
  siteName: string | null;
  agreed: Money;
  received: Money;
  receipts: ReceiptRow[];
  /** "Đã nhận đủ", "Còn thiếu x ₫", "Chưa nhận", "" when none agreed. */
  state: "FULL" | "SHORT" | "NONE" | "NO_DEPOSIT";
  guarantees: GuaranteeView[];
}

export interface CustomerDetail {
  customer: {
    id: string;
    code: string;
    name: string;
    paymentTermsDays: number;
  };
  debts: DebtView[];
  owed: Money;
  prepaid: Money;
  contractCount: number;
  deposits: ContractDepositView[];
  receipts: ReturnType<typeof receiptsWithAllocations>;
}

interface RevisionRow {
  id: string;
  contractId: string;
  number: number;
  status: string;
  effectiveFrom: string;
  endDate: string | null;
}

/** The revision in force today of each running contract. */
async function revisionsToday(
  db: Reader,
  contractIds: readonly string[],
  today: BusinessDate,
): Promise<Map<string, RevisionRow>> {
  if (contractIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: contractRevision.id,
      contractId: contractRevision.contractId,
      number: contractRevision.number,
      status: contractRevision.status,
      effectiveFrom: contractRevision.effectiveFrom,
      endDate: contractRevision.endDate,
    })
    .from(contractRevision)
    .where(inArray(contractRevision.contractId, [...contractIds]));
  const result = new Map<string, RevisionRow>();
  for (const id of contractIds) {
    const found = revisionAt(
      rows.filter((row) => row.contractId === id),
      today,
    );
    if (found) result.set(id, found);
  }
  return result;
}

async function depositsOf(db: Reader, revisionIds: readonly string[]) {
  if (revisionIds.length === 0) return [];
  return db
    .select()
    .from(contractDeposit)
    .where(inArray(contractDeposit.revisionId, [...revisionIds]));
}

function guaranteeView(
  row: Awaited<ReturnType<typeof depositsOf>>[number],
  today: BusinessDate,
  endDate: string | null,
): GuaranteeView {
  const expiry = (row.expiryDate ?? "") as BusinessDate;
  const warnings = guaranteeWarnings({
    guaranteeNumber: row.guaranteeNumber ?? "",
    expiryDate: expiry,
    today,
    contractEndDate: (endDate as BusinessDate | null) ?? null,
  });
  return {
    bankName: row.bankName ?? "",
    guaranteeNumber: row.guaranteeNumber ?? "",
    amount: toMoney(row.amount),
    expiryDate: expiry,
    warning: warnings[0]?.message ?? null,
    daysLeft: daysBetween(today, expiry),
  };
}

/** D14, one customer: debts, deposits and guarantees, receipts. */
export async function customerDetail(
  db: Database,
  customerId: string,
  today: BusinessDate,
): Promise<CustomerDetail | null> {
  if (!isUuid(customerId)) return null;
  const [who] = await db
    .select({
      id: customer.id,
      code: customer.code,
      name: customer.name,
      paymentTermsDays: customer.paymentTermsDays,
    })
    .from(customer)
    .where(eq(customer.id, customerId));
  if (!who) return null;
  const [ledger, contracts] = await Promise.all([
    readLedger(db, customerId, today),
    db
      .select({
        id: contract.id,
        code: contract.code,
        status: contract.status,
        siteName: site.name,
      })
      .from(contract)
      .leftJoin(site, eq(site.id, contract.siteId))
      .where(
        and(
          eq(contract.customerId, customerId),
          inArray(contract.status, ["APPROVED", "ACTIVE"]),
        ),
      )
      .orderBy(contract.code),
  ]);
  const revisions = await revisionsToday(
    db,
    contracts.map((row) => row.id),
    today,
  );
  const deposits = await depositsOf(
    db,
    [...revisions.values()].map((row) => row.id),
  );
  const views: ContractDepositView[] = contracts.map((row) => {
    const revision = revisions.get(row.id);
    const mine = deposits.filter((entry) => entry.revisionId === revision?.id);
    const agreed = toMoney(
      mine
        .filter((entry) => entry.kind === "CASH")
        .reduce((sum, entry) => sum + entry.amount, 0),
    );
    const received = ledger.deposits.get(row.id);
    const got = received?.received ?? toMoney(0);
    return {
      contractId: row.id,
      contractCode: row.code,
      status: row.status,
      siteName: row.siteName,
      agreed,
      received: got,
      receipts: received?.receipts ?? [],
      state:
        agreed <= 0
          ? "NO_DEPOSIT"
          : got >= agreed
            ? "FULL"
            : got > 0
              ? "SHORT"
              : "NONE",
      guarantees: mine
        .filter((entry) => entry.kind === "GUARANTEE")
        .map((entry) => guaranteeView(entry, today, revision?.endDate ?? null)),
    };
  });
  return {
    customer: who,
    debts: ledger.debts,
    owed: ledger.owed,
    prepaid: ledger.prepaid,
    contractCount: new Set([
      ...ledger.debts.map((debt) => debt.contractId),
      ...contracts.map((row) => row.id),
    ]).size,
    deposits: views,
    receipts: receiptsWithAllocations(ledger),
  };
}

export interface GuaranteeAlert {
  contractId: string;
  contractCode: string;
  customerId: string;
  guaranteeNumber: string;
  expiryDate: string;
  daysLeft: number;
  message: string;
}

/** Guarantees of running contracts ending within 30 days (D14 banner). */
export async function guaranteeAlerts(
  db: Reader,
  today: BusinessDate,
): Promise<GuaranteeAlert[]> {
  const running = await db
    .select({
      id: contract.id,
      code: contract.code,
      customerId: contract.customerId,
    })
    .from(contract)
    .where(inArray(contract.status, ["APPROVED", "ACTIVE"]));
  const revisions = await revisionsToday(
    db,
    running.map((row) => row.id),
    today,
  );
  const deposits = await depositsOf(
    db,
    [...revisions.values()].map((row) => row.id),
  );
  const alerts: GuaranteeAlert[] = [];
  for (const row of running) {
    const revision = revisions.get(row.id);
    for (const entry of deposits) {
      if (entry.revisionId !== revision?.id || entry.kind !== "GUARANTEE") {
        continue;
      }
      const expiry = (entry.expiryDate ?? "") as BusinessDate;
      const left = daysBetween(today, expiry);
      if (left < 0 || left > GUARANTEE_WARNING_DAYS) continue;
      alerts.push({
        contractId: row.id,
        contractCode: row.code,
        customerId: row.customerId,
        guaranteeNumber: entry.guaranteeNumber ?? "",
        expiryDate: expiry,
        daysLeft: left,
        message: `Bảo lãnh sắp hết hạn: chứng thư ${entry.guaranteeNumber ?? ""} của ${row.code} hết hạn ${formatBusinessDate(expiry)} (còn ${left} ngày). Nhắc khách gia hạn.`,
      });
    }
  }
  return alerts.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}

export interface ContractMoneyStatus {
  received: Money;
  receiptCodes: string[];
  settlement: {
    settledDate: string;
    refundAmount: Money;
    refundDate: string | null;
  } | null;
}

/** D5 "Tiền cọc": cash deposit received, and the settlement if any. */
export async function contractMoneyStatus(
  db: Reader,
  contractId: string,
): Promise<ContractMoneyStatus> {
  const [receipts, settled] = await Promise.all([
    db
      .select({
        code: receipt.code,
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
      )
      .orderBy(receipt.receivedDate, receipt.code),
    db
      .select({
        settledDate: contractSettlement.settledDate,
        refundAmount: contractSettlement.refundAmount,
        refundDate: contractSettlement.refundDate,
      })
      .from(contractSettlement)
      .where(eq(contractSettlement.contractId, contractId)),
  ]);
  const live = receipts.filter((row) => row.cancelled === null);
  const done = settled[0];
  return {
    received: toMoney(live.reduce((sum, row) => sum + row.amount, 0)),
    receiptCodes: live.map((row) => row.code),
    settlement: done
      ? { ...done, refundAmount: toMoney(done.refundAmount) }
      : null,
  };
}

// Debts and balances (receivables tasks 3.1–3.3; spec receivables "Bốn loại
// khoản nợ", "VAT của hàng bán theo ngày giao", "Hạn trả của từng khoản",
// "Quá hạn tính theo ngày Việt Nam", "Số nợ quá hạn của nhà thầu", "Màn D14
// theo nhà thầu", "Lọc, tìm và phân trang D14").
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  customer,
  receipt,
  receiptAllocation,
  receiptCancellation,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { toSearchText } from "@/domain/search-text";
import { approveContract, submitContract } from "@/lib/contracts/approval";
import { overdueDebt } from "@/lib/contracts/overdue";
import { createContract } from "@/lib/contracts/service";
import { createTestContext } from "@/test/auth";
import { d5Rental } from "@/test/contracts";
import {
  approvedCompensation,
  closedPeriod,
  deliveredSale,
  requestId,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";
import { returnOf } from "@/test/returns";

import { customerBalances, readLedger } from "./balances";
import { readDebts } from "./debts";

const ctx = createTestContext();
afterAll(ctx.close);

const day = (value: string) => value as BusinessDate;
const NOV_5 = day("2026-11-05");
const APPROVE_NOW = new Date("2026-11-06T03:00:00Z");

let fx: ReceivableFixture;
beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
});

let seq = 0;
async function payment(
  customerId: string,
  amount: number,
  receivedDate = "2026-11-01",
): Promise<string> {
  seq += 1;
  const [row] = await ctx.db
    .insert(receipt)
    .values({
      code: `PT-2026-${String(seq).padStart(3, "0")}`,
      customerId,
      kind: "PAYMENT",
      amount,
      method: "TRANSFER",
      receivedDate,
      requestId: requestId(),
      createdBy: fx.accountant.id,
    })
    .returning({ id: receipt.id });
  return row?.id ?? "";
}

describe("readDebts", () => {
  it("reads a closed period, an approved compensation and a sale with VAT", async () => {
    const oct = await closedPeriod(ctx, fx, "2026-10", 22_800_000, {
      vat: 1_688_889,
    });
    const comp = await approvedCompensation(ctx, fx, APPROVE_NOW);
    const sale = await deliveredSale(ctx, fx, {
      customerId: fx.customerId,
      vatEnabled: true,
      vatRate: "8",
      paymentTermsDays: 15,
    });
    const { debts, credits } = await readDebts(ctx.db, {
      customerIds: [fx.customerId],
    });
    expect(credits).toEqual([]);
    const byKind = Object.fromEntries(debts.map((row) => [row.kind, row]));
    expect(byKind.BILLING).toMatchObject({
      id: oct.id,
      label: "Kỳ 10/2026",
      total: 22_800_000,
      vat: 1_688_889,
      dueDate: "2026-11-15",
    });
    expect(byKind.COMPENSATION).toMatchObject({
      id: comp.id,
      total: comp.amountDue,
      compensation: comp.amountDue,
      vat: 0,
      vatApplies: false,
      issuedDate: "2026-11-06",
      dueDate: comp.dueDate,
    });
    // 1.250,5 kg × 14.000 ₫ = 17.507.000 ₫, VAT 8 % = 1.400.560 ₫.
    expect(byKind.SALE).toMatchObject({
      id: sale.noteId,
      label: sale.code,
      sale: 17_507_000,
      freight: 0,
      vat: 1_400_560,
      total: 18_907_560,
      issuedDate: "2026-11-03",
      dueDate: "2026-11-18",
    });
    // The rental delivery of the fixture is no debt of its own.
    expect(debts).toHaveLength(3);
  });

  it("leaves out pending notes and keeps a negative period as a credit", async () => {
    await approvedCompensation(ctx, fx, APPROVE_NOW);
    // A second return leaves a pending note: no debt yet.
    const pending = await returnOf(ctx, fx, { "GG-K17": [0, 0, 0, 1] });
    expect(pending.ok).toBe(true);
    const credit = await closedPeriod(ctx, fx, "2027-03", -50_000);
    const { debts, credits } = await readDebts(ctx.db, {
      customerIds: [fx.customerId],
    });
    expect(debts.map((row) => row.kind)).toEqual(["COMPENSATION"]);
    expect(credits).toMatchObject([
      { id: credit.id, amount: 50_000, label: "Kỳ 03/2027" },
    ]);
  });

  it("adds no VAT to a sale when the revision has none", async () => {
    await deliveredSale(ctx, fx, { customerId: fx.customerId });
    const { debts } = await readDebts(ctx.db, {
      customerIds: [fx.customerId],
    });
    expect(debts[0]).toMatchObject({ vat: 0, total: 17_507_000 });
  });
});

describe("ledgers", () => {
  it("subtracts live allocations and ignores cancelled receipts", async () => {
    const oct = await closedPeriod(ctx, fx, "2026-10", 22_800_000);
    const paid = await payment(fx.customerId, 4_250_000);
    const cancelled = await payment(fx.customerId, 1_000_000);
    await ctx.db.insert(receiptAllocation).values([
      {
        receiptId: paid,
        billingPeriodId: oct.id,
        amount: 4_250_000,
        mode: "AUTO",
        createdBy: fx.accountant.id,
      },
      {
        receiptId: cancelled,
        billingPeriodId: oct.id,
        amount: 1_000_000,
        mode: "AUTO",
        createdBy: fx.accountant.id,
      },
    ]);
    await ctx.db.insert(receiptCancellation).values({
      receiptId: cancelled,
      reason: "Ghi nhầm",
      cancelledBy: fx.accountant.id,
    });
    const ledger = await readLedger(ctx.db, fx.customerId, NOV_5);
    expect(ledger.debts[0]).toMatchObject({
      paid: 4_250_000,
      remaining: 18_550_000,
    });
    expect(ledger.owed).toBe(18_550_000);
    expect(ledger.prepaid).toBe(0);
  });

  it("counts what a payment did not use as prepayment", async () => {
    await payment(fx.customerId, 5_000_000);
    const ledger = await readLedger(ctx.db, fx.customerId, NOV_5);
    expect(ledger.prepaid).toBe(5_000_000);
    expect(ledger.credits).toHaveLength(1);
  });
});

describe("overdueDebt", () => {
  it("is 0 on the due day and overdue from 0 h the next day", async () => {
    // Kỳ 10/2026 due 06/11/2026 (6 days of terms).
    await closedPeriod(ctx, fx, "2026-10", 4_250_000, { terms: 6 });
    expect(await overdueDebt(ctx.db, fx.customerId, day("2026-11-06"))).toEqual(
      { amount: 0, days: 0 },
    );
    expect(await overdueDebt(ctx.db, fx.customerId, day("2026-11-07"))).toEqual(
      { amount: 4_250_000, days: 1 },
    );
  });

  it("gives the real number on contract approval", async () => {
    // Due 15/02/2026: overdue whatever day the test runs.
    await closedPeriod(ctx, fx, "2026-01", 21_500_000);
    const saved = await createContract(ctx.db, fx.sales, d5Rental(fx));
    if (!saved.ok) throw new Error(saved.error);
    await submitContract(ctx.db, fx.sales, saved.data.id);
    const refused = await approveContract(
      ctx.db,
      fx.director,
      saved.data.id,
      null,
    );
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.error).toContain(
      "Nhà thầu đang nợ quá hạn 21.500.000 ₫",
    );
    const approved = await approveContract(
      ctx.db,
      fx.director,
      saved.data.id,
      "Minh Phát hẹn trả trước 10/11.",
    );
    expect(approved.ok).toBe(true);
  });
});

describe("customerBalances", () => {
  it("sums the tiles and filters by overdue, prepaid and search", async () => {
    await closedPeriod(ctx, fx, "2026-10", 22_800_000, { terms: 6 });
    const hung = fx.customer("NT-0002");
    await payment(hung, 5_000_000);
    const page = await customerBalances(ctx.db, day("2026-11-08"), {
      filter: "owing",
    });
    expect(page.totals).toMatchObject({
      owed: 22_800_000,
      owingCount: 1,
      overdue: 22_800_000,
      overdueCount: 1,
      longestOverdueDays: 2,
      prepaid: 5_000_000,
    });
    expect(page.counts).toEqual({ owing: 1, overdue: 1, prepaid: 1, all: 2 });
    expect(page.rows.map((row) => row.status.label)).toEqual([
      "Quá hạn 2 ngày",
    ]);
    const prepaid = await customerBalances(ctx.db, NOV_5, {
      filter: "prepaid",
    });
    expect(prepaid.rows).toMatchObject([
      { id: hung, owed: 0, prepaid: 5_000_000, status: { label: "Trả trước" } },
    ]);
    const search = await customerBalances(ctx.db, NOV_5, {
      filter: "all",
      q: "minh phat",
    });
    expect(search.rows.map((row) => row.id)).toEqual([fx.customerId]);
  });

  it("pages 50 customers and keeps the tiles on all of them", async () => {
    const rows = Array.from({ length: 130 }, (_, index) => {
      const name = `Nhà thầu thử ${String(index).padStart(3, "0")}`;
      return {
        code: `NT-9${String(index).padStart(3, "0")}`,
        kind: "COMPANY",
        name,
        searchText: toSearchText(name),
      };
    });
    const ids = await ctx.db
      .insert(customer)
      .values(rows)
      .returning({ id: customer.id });
    for (const { id } of ids) await payment(id, 1_000);
    const first = await customerBalances(ctx.db, NOV_5, { filter: "prepaid" });
    expect(first.rows).toHaveLength(50);
    expect(first.pageCount).toBe(3);
    expect(first.totals.prepaid).toBe(130_000);
    const last = await customerBalances(ctx.db, NOV_5, {
      filter: "prepaid",
      page: 3,
    });
    expect(last.rows).toHaveLength(30);
    expect(last.all).toHaveLength(130);
  });
});

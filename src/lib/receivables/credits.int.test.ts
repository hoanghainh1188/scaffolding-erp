// A prepayment settles every new debt in the command that creates it
// (receivables task 4.4, design D3; specs rental-billing "Chốt kỳ trừ tiền
// trả trước", compensations / buy-backs "Duyệt phiếu … trừ tiền trả trước",
// deliveries "Ghi sổ xuất bán trừ tiền trả trước"). After each command a
// customer with prepayment owes nothing.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { closeBillingPeriod } from "@/lib/billing/close";
import { approveBuyBack, createBuyBack } from "@/lib/buy-backs/service";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { DEC_2, shownTotal } from "@/test/billing";
import {
  approvedCompensation,
  deliveredSale,
  requestId,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";

import { readLedger } from "./balances";
import { recordReceipt } from "./receipts";

const ctx = createTestContext();
afterAll(ctx.close);

const NOV_5 = new Date("2026-11-05T03:00:00Z");
const NOV_6 = new Date("2026-11-06T03:00:00Z");

let fx: ReceivableFixture;
beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
});

async function prepay(amount: number) {
  const saved = await recordReceipt(
    ctx.db,
    fx.accountant,
    {
      requestId: requestId(),
      customerId: fx.customerId,
      kind: "PAYMENT",
      amount,
      method: "TRANSFER",
      receivedDate: "2026-11-01",
    },
    { now: NOV_5 },
  );
  if (!saved.ok) throw new Error(saved.error);
}

const ledgerOn = (day: string) =>
  readLedger(ctx.db, fx.customerId, day as BusinessDate);

/** A customer with prepayment owes nothing (design D3). */
async function expectInvariant(day: string) {
  const book = await ledgerOn(day);
  if (book.prepaid > 0) expect(book.owed).toBe(0);
  return book;
}

const lastSummary = async (action: string) =>
  (await activityRows(ctx.db)).filter((row) => row.action === action).at(-1)
    ?.summary ?? "";

describe("settling new debts from the prepayment", () => {
  it("settles a closed period and says so in the Chốt kỳ row", async () => {
    await prepay(5_000_000);
    const total = await shownTotal(
      ctx,
      fx.deal.id,
      "2026-11",
      "2026-12-02" as BusinessDate,
    );
    const closed = await closeBillingPeriod(
      ctx.db,
      fx.accountant,
      fx.deal.id,
      "2026-11",
      { expectedTotal: total },
      { now: DEC_2 },
    );
    expect(closed.ok).toBe(true);
    const book = await expectInvariant("2026-12-02");
    const period = book.debts.find((debt) => debt.kind === "BILLING");
    expect(period).toMatchObject({
      total,
      paid: 5_000_000,
      remaining: total - 5_000_000,
    });
    expect(await lastSummary("CLOSE_PERIOD")).toMatch(
      /· trừ tiền trả trước 5\.000\.000 ₫$/,
    );
  });

  it("takes nothing when the closing is refused", async () => {
    await prepay(5_000_000);
    const refused = await closeBillingPeriod(
      ctx.db,
      fx.accountant,
      fx.deal.id,
      "2026-11",
      { expectedTotal: 1 },
      { now: DEC_2 },
    );
    expect(refused).toMatchObject({ ok: false, status: 409 });
    expect((await ledgerOn("2026-12-02")).prepaid).toBe(5_000_000);
  });

  it("settles an approved compensation", async () => {
    await prepay(50_000_000);
    const comp = await approvedCompensation(ctx, fx, NOV_6);
    const book = await expectInvariant("2026-11-06");
    expect(book.debts[0]).toMatchObject({
      kind: "COMPENSATION",
      total: comp.amountDue,
      remaining: 0,
      status: { label: "Đã thu đủ" },
    });
    expect(book.prepaid).toBe(50_000_000 - comp.amountDue);
    expect(await lastSummary("APPROVE")).toContain("· trừ tiền trả trước");
  });

  it("settles a posted sale but not a rental delivery", async () => {
    await prepay(20_000_000);
    const before = await ledgerOn("2026-11-03");
    expect(before.debts).toEqual([]);
    await deliveredSale(ctx, fx, { customerId: fx.customerId });
    const book = await expectInvariant("2026-11-03");
    expect(book.debts).toMatchObject([
      { kind: "SALE", total: 17_507_000, remaining: 0 },
    ]);
    expect(book.prepaid).toBe(20_000_000 - 17_507_000);
    expect(await lastSummary("POST")).toMatch(
      /· trừ tiền trả trước 17\.507\.000 ₫$/,
    );
  });

  it("settles an approved buy-back", async () => {
    await prepay(2_000_000);
    const made = await createBuyBack(
      ctx.db,
      fx.sales,
      {
        contractId: fx.deal.id,
        reason: "Khách giữ lại ở công trình",
        lines: [
          { itemId: fx.item("GG-CH"), quantity: "10", unitPrice: 600_000 },
        ],
      },
      { now: NOV_5 },
    );
    if (!made.ok) throw new Error(made.error);
    const approved = await approveBuyBack(
      ctx.db,
      fx.director,
      made.data.id,
      {},
      { now: NOV_5 },
    );
    expect(approved.ok).toBe(true);
    const book = await expectInvariant("2026-11-05");
    expect(book.debts).toMatchObject([
      { kind: "BUY_BACK", total: 6_000_000, paid: 2_000_000 },
    ]);
    expect(book.prepaid).toBe(0);
  });
});

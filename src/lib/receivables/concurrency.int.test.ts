// Commands of one customer run one after another (receivables task 4.5,
// design D5; spec customer-receipts "Không trừ trùng khi ghi cùng lúc"):
// two connections race and nothing is settled twice, nothing deadlocks.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "@/db/client";
import type { BusinessDate } from "@/domain/business-date";
import { closeBillingPeriod } from "@/lib/billing/close";
import { createTestContext } from "@/test/auth";
import { DEC_2, shownTotal } from "@/test/billing";
import {
  closedPeriod,
  requestId,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";

import { readLedger, type CustomerLedger } from "./balances";
import { cancelReceipt, recordReceipt } from "./receipts";
import { settleContract } from "./settlement";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

const NOV_5 = new Date("2026-11-05T03:00:00Z");

let fx: ReceivableFixture;
beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
});

function pay(db: Database, amount: number, now = NOV_5) {
  return recordReceipt(
    db,
    fx.accountant,
    {
      requestId: requestId(),
      customerId: fx.customerId,
      kind: "PAYMENT",
      amount,
      method: "TRANSFER",
      receivedDate: now.toISOString().slice(0, 10),
    },
    { now },
  );
}

/** No debt took more than it owed, no receipt gave more than it had. */
function expectConsistent(book: CustomerLedger) {
  for (const debt of book.debts)
    expect(debt.paid).toBeLessThanOrEqual(debt.total);
  for (const row of book.receipts) {
    const given = book.allocations
      .filter((entry) => entry.receiptId === row.id && entry.live)
      .reduce((sum, entry) => sum + entry.amount, 0);
    expect(given).toBeLessThanOrEqual(row.amount);
  }
  if (book.prepaid > 0) expect(book.owed).toBe(0);
}

const ledger = (day: string) =>
  readLedger(ctx.db, fx.customerId, day as BusinessDate);

describe("racing commands of one customer", () => {
  it("settles a debt once for two receipts at the same time", async () => {
    await closedPeriod(ctx, fx, "2026-10", 4_250_000);
    const results = await Promise.all([
      pay(ctx.db, 4_250_000),
      pay(other.db, 4_250_000),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    const book = await ledger("2026-11-05");
    expect(book.debts[0]).toMatchObject({ paid: 4_250_000, remaining: 0 });
    expect(book.prepaid).toBe(4_250_000);
    expectConsistent(book);
  });

  it("keeps the numbers when a receipt races a closing", async () => {
    await pay(ctx.db, 5_000_000);
    const total = await shownTotal(
      ctx,
      fx.deal.id,
      "2026-11",
      "2026-12-02" as BusinessDate,
    );
    const [closed, paid] = await Promise.all([
      closeBillingPeriod(
        ctx.db,
        fx.accountant,
        fx.deal.id,
        "2026-11",
        { expectedTotal: total },
        { now: DEC_2 },
      ),
      pay(other.db, total, DEC_2),
    ]);
    expect(closed.ok && paid.ok).toBe(true);
    const book = await ledger("2026-12-02");
    expect(book.debts[0]).toMatchObject({ paid: total, remaining: 0 });
    expect(book.prepaid).toBe(5_000_000);
    expectConsistent(book);
  });

  it("keeps the numbers when a cancel races a receipt", async () => {
    await closedPeriod(ctx, fx, "2026-10", 3_000_000);
    const wrong = await pay(ctx.db, 3_000_000);
    if (!wrong.ok) throw new Error(wrong.error);
    const [cancelled, paid] = await Promise.all([
      cancelReceipt(ctx.db, fx.accountant, wrong.data.id, {
        reason: "Ghi nhầm",
      }),
      pay(other.db, 3_000_000),
    ]);
    expect(cancelled.ok && paid.ok).toBe(true);
    const book = await ledger("2026-11-05");
    expect(book.debts[0]).toMatchObject({ paid: 3_000_000, remaining: 0 });
    expect(book.prepaid).toBe(0);
    expectConsistent(book);
  });

  it("keeps the numbers when a settlement races a receipt", async () => {
    // Everything back from the site, November closed: the contract can close.
    const { settleReadyContract } = await import("@/test/settlement");
    const ready = await settleReadyContract(ctx, fx);
    const [settled, paid] = await Promise.all([
      settleContract(
        ctx.db,
        fx.accountant,
        fx.deal.id,
        {
          refundDate: ready.today,
          refundMethod: "TRANSFER",
        },
        { now: ready.now },
      ),
      pay(other.db, 1_000_000, ready.now),
    ]);
    expect(settled.ok && paid.ok).toBe(true);
    const book = await ledger(ready.today);
    expectConsistent(book);
  });
});

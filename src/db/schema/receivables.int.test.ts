// Receivables tables (receivables tasks 1.2, design D2): receipts, their
// allocations and cancellations only grow; an allocation has one source and
// one debt; a receipt is cancelled once and a cancelled one takes nothing.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import { setupContractFixture, type ContractFixture } from "@/test/contracts";
import { approvedRental } from "@/test/deliveries";

import { billingPeriod } from "./billing";
import { contractRevision } from "./contracts";
import { receipt, receiptAllocation, receiptCancellation } from "./receivables";

const ctx = createTestContext();
const { db } = ctx;

afterAll(ctx.close);

let fx: ContractFixture;
let contractId = "";
let periodId = "";

beforeEach(async () => {
  fx = await setupContractFixture(ctx);
  const deal = await approvedRental(ctx, fx);
  contractId = deal.id;
  const [rev] = await db
    .select({ id: contractRevision.id })
    .from(contractRevision)
    .where(eq(contractRevision.contractId, contractId));
  const [period] = await db
    .insert(billingPeriod)
    .values({
      contractId,
      month: "2026-11-01",
      periodEnd: "2026-11-30",
      revisionId: rev?.id ?? "",
      rentAmount: 2_400_000,
      adjustmentAmount: 0,
      freightAmount: 0,
      vatAmount: 0,
      totalAmount: 2_400_000,
      paymentTermsDays: 15,
      dueDate: "2026-12-15",
      holidayDays: 0,
      lineCount: 1,
      closedBy: fx.accountant.id,
      closedAt: new Date(),
    })
    .returning({ id: billingPeriod.id });
  periodId = period?.id ?? "";
});

let seq = 0;

async function payment(amount = 1_000_000): Promise<string> {
  seq += 1;
  const [row] = await db
    .insert(receipt)
    .values({
      code: `PT-2026-${String(seq).padStart(3, "0")}`,
      customerId: fx.customer("NT-0001"),
      kind: "PAYMENT",
      amount,
      method: "TRANSFER",
      receivedDate: "2026-12-01",
      requestId: crypto.randomUUID(),
      createdBy: fx.accountant.id,
    })
    .returning({ id: receipt.id });
  return row?.id ?? "";
}

async function errorOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  return "";
}

async function errorCode(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? "";
  }
  return "";
}

describe("receipt", () => {
  it("cannot be changed or deleted by the app role", async () => {
    const id = await payment();
    expect(
      await errorCode(() =>
        db.update(receipt).set({ amount: 0 }).where(eq(receipt.id, id)),
      ),
    ).toBe("42501");
    expect(
      await errorCode(() => db.execute(sql`delete from receipt_allocation`)),
    ).toBe("42501");
  });

  it("refuses an update even from the owner", async () => {
    const id = await payment();
    expect(
      await errorOf(() =>
        getAdminDatabase()
          .update(receipt)
          .set({ note: "sửa" })
          .where(eq(receipt.id, id)),
      ),
    ).toContain("Phiếu thu chỉ ghi thêm");
  });

  it("needs a contract for a deposit and none for a payment", async () => {
    expect(
      await errorOf(() =>
        db.insert(receipt).values({
          code: "PT-2026-900",
          customerId: fx.customer("NT-0001"),
          kind: "DEPOSIT",
          amount: 1,
          method: "CASH",
          receivedDate: "2026-12-01",
          requestId: crypto.randomUUID(),
          createdBy: fx.accountant.id,
        }),
      ),
    ).toContain("receipt_kind_check");
  });
});

describe("receipt_allocation", () => {
  const base = (receiptId: string) => ({
    receiptId,
    amount: 500_000,
    mode: "AUTO",
    createdBy: fx.accountant.id,
  });

  it("goes to exactly one debt", async () => {
    const id = await payment();
    expect(
      await errorOf(() => db.insert(receiptAllocation).values(base(id))),
    ).toContain("receipt_allocation_debt_check");
    await db
      .insert(receiptAllocation)
      .values({ ...base(id), billingPeriodId: periodId });
    expect(await db.select().from(receiptAllocation)).toHaveLength(1);
  });

  it("has exactly one source", async () => {
    const id = await payment();
    expect(
      await errorOf(() =>
        db.insert(receiptAllocation).values({
          ...base(id),
          creditPeriodId: periodId,
          billingPeriodId: periodId,
          mode: "PREPAYMENT",
        }),
      ),
    ).toContain("receipt_allocation_source_check");
  });

  it("takes nothing from a cancelled receipt", async () => {
    const id = await payment();
    await db.insert(receiptCancellation).values({
      receiptId: id,
      reason: "Ghi nhầm nhà thầu",
      cancelledBy: fx.accountant.id,
    });
    expect(
      await errorOf(() =>
        db
          .insert(receiptAllocation)
          .values({ ...base(id), billingPeriodId: periodId }),
      ),
    ).toContain("Phiếu thu đã hủy, không trừ thêm được");
  });
});

describe("receipt_cancellation", () => {
  it("cancels a receipt once", async () => {
    const id = await payment();
    const row = {
      receiptId: id,
      reason: "Ghi nhầm nhà thầu",
      cancelledBy: fx.accountant.id,
    };
    await db.insert(receiptCancellation).values(row);
    expect(
      await errorOf(() => db.insert(receiptCancellation).values(row)),
    ).toContain("receipt_cancellation_pkey");
  });
});

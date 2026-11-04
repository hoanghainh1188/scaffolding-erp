// Billing tables (rental-billing tasks 1.2, design D4, D5, D11): a closed
// period only grows within its own transaction, holidays never overlap and
// an adjustment freezes with the period it was written into.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import { setupContractFixture, type ContractFixture } from "@/test/contracts";
import { approvedRental } from "@/test/deliveries";

import { contractRevision } from "./contracts";
import {
  billingAdjustment,
  billingPeriod,
  billingPeriodLine,
  rentalHoliday,
} from "./billing";

const ctx = createTestContext();
const { db } = ctx;

afterAll(ctx.close);

let fx: ContractFixture;
let contractId = "";
let revisionId = "";

beforeEach(async () => {
  fx = await setupContractFixture(ctx);
  const deal = await approvedRental(ctx, fx);
  contractId = deal.id;
  const [rev] = await db
    .select({ id: contractRevision.id })
    .from(contractRevision)
    .where(eq(contractRevision.contractId, contractId));
  revisionId = rev?.id ?? "";
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function closePeriod(tx: Tx | typeof db, month = "2026-11-01") {
  const end = month === "2026-11-01" ? "2026-11-30" : "2026-12-31";
  const due = month === "2026-11-01" ? "2026-12-30" : "2027-01-30";
  const [row] = await tx
    .insert(billingPeriod)
    .values({
      contractId,
      month,
      periodEnd: end,
      revisionId,
      rentAmount: 2_400_000,
      adjustmentAmount: 0,
      freightAmount: 0,
      vatAmount: 0,
      totalAmount: 2_400_000,
      paymentTermsDays: 30,
      dueDate: due,
      holidayDays: 0,
      lineCount: 1,
      closedBy: fx.accountant.id,
      closedAt: new Date(),
    })
    .returning({ id: billingPeriod.id });
  return row?.id ?? "";
}

const rentLine = (periodId: string) => ({
  periodId,
  lineNo: 1,
  kind: "RENT",
  itemId: fx.item("GG-K17"),
  itemCode: "GG-K17",
  itemName: "Khung giàn giáo 1,7m",
  quantity: "100",
  fromDate: "2026-11-11",
  toDate: "2026-11-30",
  calendarDays: 20,
  holidayDays: 0,
  chargedDays: 20,
  dailyPrice: 1200,
  amount: 2_400_000,
});

async function errorOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  return "";
}

describe("billing_period", () => {
  it("takes its lines in the transaction that created it", async () => {
    await db.transaction(async (tx) => {
      const id = await closePeriod(tx);
      await tx.insert(billingPeriodLine).values(rentLine(id));
    });
    const lines = await db.select().from(billingPeriodLine);
    expect(lines).toHaveLength(1);
  });

  it("refuses a line from another transaction", async () => {
    const id = await closePeriod(db);
    expect(
      await errorOf(() => db.insert(billingPeriodLine).values(rentLine(id))),
    ).toContain("Kỳ tiền thuê đã chốt, không thêm dòng được");
  });

  it("refuses an update even from the owner", async () => {
    const id = await closePeriod(db);
    expect(
      await errorOf(() =>
        getAdminDatabase()
          .update(billingPeriod)
          .set({ totalAmount: 0 })
          .where(eq(billingPeriod.id, id)),
      ),
    ).toContain("Kỳ tiền thuê đã chốt, không sửa hay xóa được");
  });

  it("closes one month of a contract once", async () => {
    await closePeriod(db);
    expect(await errorOf(() => closePeriod(db))).toContain(
      "billing_period_contract_month_unique",
    );
  });

  it("keeps the due date at the period end plus the payment terms", async () => {
    expect(
      await errorOf(() =>
        db.insert(billingPeriod).values({
          contractId,
          month: "2026-11-01",
          periodEnd: "2026-11-30",
          revisionId,
          rentAmount: 0,
          adjustmentAmount: 0,
          freightAmount: 0,
          vatAmount: 0,
          totalAmount: 0,
          paymentTermsDays: 30,
          dueDate: "2026-12-31",
          holidayDays: 0,
          lineCount: 0,
          closedBy: fx.accountant.id,
          closedAt: new Date(),
        }),
      ),
    ).toContain("billing_period_due_check");
  });
});

describe("rental_holiday", () => {
  const holiday = (name: string, startDate: string, endDate: string) => ({
    name,
    startDate,
    endDate,
    createdBy: fx.director.id,
    updatedBy: fx.director.id,
  });

  it("refuses two holidays sharing a day", async () => {
    await db
      .insert(rentalHoliday)
      .values(holiday("Tết Nguyên đán", "2027-02-05", "2027-02-13"));
    expect(
      await errorOf(() =>
        db
          .insert(rentalHoliday)
          .values(holiday("Nghỉ bù", "2027-02-13", "2027-02-14")),
      ),
    ).toContain("rental_holiday_no_overlap");
  });

  it("refuses a range longer than 31 days", async () => {
    expect(
      await errorOf(() =>
        db
          .insert(rentalHoliday)
          .values(holiday("Dài", "2027-02-01", "2027-03-15")),
      ),
    ).toContain("rental_holiday_range_check");
  });
});

describe("billing_adjustment", () => {
  const adjustment = (month: string) => ({
    contractId,
    month,
    refMonth: "2026-11-01",
    amount: 93_000,
    reason: "Kỳ 11 thiếu 10 GG-CH × 31 ngày",
    createdBy: fx.accountant.id,
    updatedBy: fx.accountant.id,
  });

  it("cannot be written into a closed month", async () => {
    await closePeriod(db, "2026-12-01");
    expect(
      await errorOf(() =>
        db.insert(billingAdjustment).values(adjustment("2026-12-01")),
      ),
    ).toContain("Kỳ đã chốt, không ghi dòng điều chỉnh vào kỳ này được");
  });

  it("freezes once the closing transaction takes it", async () => {
    const [row] = await db
      .insert(billingAdjustment)
      .values(adjustment("2026-12-01"))
      .returning({ id: billingAdjustment.id });
    const id = row?.id ?? "";
    await db.transaction(async (tx) => {
      const periodId = await closePeriod(tx, "2026-12-01");
      await tx
        .update(billingAdjustment)
        .set({ closedPeriodId: periodId })
        .where(eq(billingAdjustment.id, id));
    });
    expect(
      await errorOf(() =>
        db
          .update(billingAdjustment)
          .set({ amount: 95_000 })
          .where(eq(billingAdjustment.id, id)),
      ),
    ).toContain("Kỳ đã chốt, dòng điều chỉnh không sửa hay xóa được");
    expect(
      await errorOf(() =>
        db.delete(billingAdjustment).where(eq(billingAdjustment.id, id)),
      ),
    ).toContain("Kỳ đã chốt, dòng điều chỉnh không sửa hay xóa được");
  });

  it("is frozen only by the closing transaction", async () => {
    const periodId = await closePeriod(db, "2026-11-01");
    const [row] = await db
      .insert(billingAdjustment)
      .values(adjustment("2026-12-01"))
      .returning({ id: billingAdjustment.id });
    expect(
      await errorOf(() =>
        db
          .update(billingAdjustment)
          .set({ closedPeriodId: periodId })
          .where(eq(billingAdjustment.id, row?.id ?? "")),
      ),
    ).toContain("Chỉ lần chốt kỳ mới khóa được dòng điều chỉnh");
  });

  it("refuses an amount of 0 ₫", async () => {
    expect(
      await errorOf(() =>
        db
          .insert(billingAdjustment)
          .values({ ...adjustment("2026-12-01"), amount: 0 }),
      ),
    ).toContain("billing_adjustment_amount_check");
  });

  it("can still be edited while its month is open", async () => {
    const [row] = await db
      .insert(billingAdjustment)
      .values(adjustment("2026-12-01"))
      .returning({ id: billingAdjustment.id });
    await db
      .update(billingAdjustment)
      .set({ amount: -50_000, updatedAt: sql`now()` })
      .where(eq(billingAdjustment.id, row?.id ?? ""));
    const [after] = await db
      .select({ amount: billingAdjustment.amount })
      .from(billingAdjustment);
    expect(after?.amount).toBe(-50_000);
  });
});

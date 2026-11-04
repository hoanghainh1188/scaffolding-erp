// Closing a period (rental-billing tasks 3.3, 4.3, 0.2 #22, #78).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { billingPeriod, billingPeriodLine, item } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { createHoliday, deleteHoliday } from "@/lib/holidays/service";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { closeMonth, DEC_2, DEC_2_DATE, NOVEMBER_TOTAL } from "@/test/billing";
import { planned } from "@/test/deliveries";
import { deliverMore } from "@/test/returns";
import { setupSiteFixture, type SiteFixture } from "@/test/site-operations";

import { createAdjustment } from "./adjustments";
import { closeBillingPeriod } from "./close";
import { contractStatement } from "./queries";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

let fx: SiteFixture;
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

const close = (
  expectedTotal: number,
  now = DEC_2,
  month = "2026-11",
  actor = fx.accountant,
) =>
  closeBillingPeriod(
    ctx.db,
    actor,
    fx.from.id,
    month,
    { expectedTotal },
    { now },
  );

describe("closeBillingPeriod", () => {
  it("copies the statement, the amounts and the due date; one log row", async () => {
    const before = (await activityRows(ctx.db)).length;
    const result = await close(NOVEMBER_TOTAL);
    expect(result).toMatchObject({
      ok: true,
      data: {
        month: "2026-11",
        totalAmount: NOVEMBER_TOTAL,
        dueDate: "2026-12-30",
        lineCount: 3,
      },
    });
    const [row] = await ctx.db.select().from(billingPeriod);
    expect(row).toMatchObject({
      rentAmount: NOVEMBER_TOTAL,
      adjustmentAmount: 0,
      freightAmount: 0,
      vatAmount: 0,
      totalAmount: NOVEMBER_TOTAL,
      periodEnd: "2026-11-30",
      dueDate: "2026-12-30",
      closedBy: fx.accountant.id,
    });
    const rows = (await activityRows(ctx.db)).slice(before);
    expect(
      rows.map((entry) => [entry.action, entry.documentType, entry.summary]),
    ).toEqual([
      [
        "CLOSE_PERIOD",
        "BILLING_PERIOD",
        `${fx.from.code} · kỳ 11/2026 · 3 dòng · phải thu 7.452.000 ₫`,
      ],
    ]);
  });

  it("reads a closed period back from its copy, even after a rename", async () => {
    expect((await close(NOVEMBER_TOTAL)).ok).toBe(true);
    await ctx.db
      .update(item)
      .set({ name: "Khung giàn giáo 1,7 m loại A" })
      .where(eq(item.id, fx.item("GG-K17")));
    const view = await contractStatement(
      ctx.db,
      fx.from.id,
      "2026-11",
      DEC_2_DATE,
    );
    expect(view?.closed?.byName).toBe("Thu Hà");
    expect(
      view?.statement.lines.find((line) => line.itemCode === "GG-K17")
        ?.itemName,
    ).toBe("Khung giàn giáo 1,7m");
    expect(view?.statement.totalAmount).toBe(NOVEMBER_TOTAL);
    expect(view?.closeBlock).toMatch(
      /^Kỳ 11\/2026 đã được chốt lúc \d{2}:\d{2} bởi Thu Hà\.$/,
    );
  });

  it("refuses a month that is not over", async () => {
    expect(
      await close(NOVEMBER_TOTAL, new Date("2026-11-30T10:00:00Z")),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Kỳ 11/2026 chưa hết. Bạn chốt từ ngày 01/12/2026.",
    });
  });

  it("refuses a month after one still open", async () => {
    const jan = new Date("2027-01-03T02:00:00Z");
    const total =
      (
        await contractStatement(
          ctx.db,
          fx.from.id,
          "2026-12",
          "2027-01-03" as BusinessDate,
        )
      )?.statement.totalAmount ?? 0;
    expect(await close(total, jan, "2026-12")).toEqual({
      ok: false,
      status: 409,
      error:
        "Kỳ 11/2026 của hợp đồng này chưa chốt. Bạn chốt kỳ 11/2026 trước rồi chốt kỳ 12/2026.",
    });
  });

  it("refuses a month with nothing to bill", async () => {
    expect(await close(0, DEC_2, "2026-10")).toEqual({
      ok: false,
      status: 409,
      error:
        "Kỳ 10/2026 của hợp đồng này không có tiền thuê, cước hay điều chỉnh nên không cần chốt.",
    });
  });

  it("answers 409 when the amount changed since the user looked", async () => {
    expect(await close(NOVEMBER_TOTAL - 1)).toEqual({
      ok: false,
      status: 409,
      error:
        "Số phải thu đã đổi từ 7.451.999 ₫ thành 7.452.000 ₫ từ lúc bạn mở. Bạn xem lại rồi chốt.",
    });
    expect(await ctx.db.select().from(billingPeriod)).toEqual([]);
  });

  it("is refused to sales", async () => {
    expect(
      await close(NOVEMBER_TOTAL, DEC_2, "2026-11", fx.sales),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("does not wait for a batch still being picked; it bills in its own month", async () => {
    const note = await planned(ctx, fx, {
      contractId: fx.from.id,
      lines: [{ itemId: fx.item("GG-CH"), quantity: "10" }],
    });
    const view = await contractStatement(
      ctx.db,
      fx.from.id,
      "2026-11",
      DEC_2_DATE,
    );
    expect(view?.pending.map((entry) => entry.code)).toContain(note.code);
    expect((await close(NOVEMBER_TOTAL)).ok).toBe(true);
    await deliverMore(
      ctx,
      fx,
      fx.from.id,
      [["GG-CH", "GOOD", 10]],
      new Date("2026-12-03T02:00:00Z"),
    );
    const nov = await contractStatement(
      ctx.db,
      fx.from.id,
      "2026-11",
      "2026-12-05" as BusinessDate,
    );
    expect(nov?.statement.totalAmount).toBe(NOVEMBER_TOTAL);
    const dec = await contractStatement(
      ctx.db,
      fx.from.id,
      "2026-12",
      "2026-12-05" as BusinessDate,
    );
    expect(
      dec?.statement.lines.some(
        (line) =>
          line.fromDate === "2026-12-04" && line.quantityMilli === 10_000,
      ),
    ).toBe(true);
  });

  it("freezes the adjustments of the month and stores them", async () => {
    expect((await close(NOVEMBER_TOTAL)).ok).toBe(true);
    const adjustment = await createAdjustment(ctx.db, fx.accountant, {
      contractId: fx.from.id,
      month: "2026-12",
      refMonth: "2026-11",
      amount: 93_000,
      reason: "Kỳ 11 thiếu",
    });
    expect(adjustment.ok).toBe(true);
    const jan = new Date("2027-01-03T02:00:00Z");
    const result = await closeMonth(ctx, fx, "2026-12", jan);
    expect(result.ok).toBe(true);
    const lines = await ctx.db.select().from(billingPeriodLine);
    expect(
      lines
        .filter((line) => line.kind === "ADJUSTMENT")
        .map((line) => [line.amount, line.note]),
    ).toEqual([[93_000, "Kỳ 11 thiếu"]]);
  });

  it("closes once when two people close at the same time", async () => {
    const [a, b] = await Promise.all([
      close(NOVEMBER_TOTAL),
      closeBillingPeriod(
        other.db,
        fx.director,
        fx.from.id,
        "2026-11",
        { expectedTotal: NOVEMBER_TOTAL },
        { now: DEC_2 },
      ),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const loser = a.ok ? b : a;
    expect(loser).toMatchObject({ ok: false, status: 409 });
    if (!loser.ok)
      expect(loser.error).toMatch(
        /^Kỳ 11\/2026 đã được chốt lúc \d{2}:\d{2} bởi /,
      );
    expect(await ctx.db.select().from(billingPeriod)).toHaveLength(1);
  });

  it("never closes on a holiday table that changes at the same time", async () => {
    const holiday = await createHoliday(ctx.db, fx.director, {
      name: "Nghỉ thử",
      startDate: "2026-11-20",
      endDate: "2026-11-21",
    });
    if (!holiday.ok) throw new Error(holiday.error);
    const withHoliday =
      (await contractStatement(ctx.db, fx.from.id, "2026-11", DEC_2_DATE))
        ?.statement.totalAmount ?? 0;
    const [closed, removed] = await Promise.all([
      close(withHoliday),
      deleteHoliday(other.db, fx.director, holiday.data.id, {
        updatedAt: holiday.data.updatedAt,
      }),
    ]);
    const [period] = await ctx.db.select().from(billingPeriod);
    if (removed.ok) {
      // The deletion went first: the closing saw another amount and stopped.
      expect(closed.ok).toBe(false);
      expect(period).toBeUndefined();
    } else {
      expect(closed.ok).toBe(true);
      expect(period?.holidayDays).toBe(2);
    }
  });
});

// Revenue book from real documents (dashboard-basic task 3.2, spec
// sales-revenue): rent by day adds up to D7 (running month, a past month
// not closed, a closed month), an adjustment keeps its day across closing,
// sales count on the delivery day, compensation stays apart.
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { billingAdjustment, billingPeriod } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { createAdjustment } from "@/lib/billing/adjustments";
import { contractStatement } from "@/lib/billing/queries";
import { deliveredAmounts } from "@/lib/deliveries/amounts";
import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import { closeMonth } from "@/test/billing";
import { planned } from "@/test/deliveries";
import {
  approvedCompensation,
  deliveredSale,
  setupReceivableFixture,
} from "@/test/receivables";
import { setupSiteFixture } from "@/test/site-operations";

import { lastMonths, revenueBook, type RevenueBook } from "./revenue";

const ctx = createTestContext();
afterAll(ctx.close);

const d = (value: string) => value as BusinessDate;

const rentOf = (book: RevenueBook, contractId: string, month: string) =>
  book.entries
    .filter(
      (entry) =>
        entry.contractId === contractId && entry.date.startsWith(`${month}-`),
    )
    .reduce((sum, entry) => sum + entry.rent, 0);

const byDay = (book: RevenueBook, contractId: string) =>
  new Map(
    book.entries
      .filter((entry) => entry.contractId === contractId)
      .map((entry) => [entry.date, entry.rent]),
  );

async function beforeVat(contractId: string, month: string, today: string) {
  const view = await contractStatement(ctx.db, contractId, month, d(today));
  return view?.statement.beforeVat ?? 0;
}

describe("lastMonths", () => {
  it("counts back across a year", () => {
    expect(lastMonths(d("2027-02-10"), 4)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});

describe("rent", () => {
  it("adds up to D7 before VAT in the running month", async () => {
    const fx = await setupSiteFixture(ctx);
    const book = await revenueBook(ctx.db, ["2026-11"], d("2026-11-06"));
    expect(rentOf(book, fx.from.id, "2026-11")).toBe(
      await beforeVat(fx.from.id, "2026-11", "2026-11-06"),
    );
    expect(book.openMonths.has("2026-11")).toBe(true);
    expect(book.entries.every((entry) => entry.date <= "2026-11-06")).toBe(
      true,
    );
  });

  it("counts a past month not closed to its end", async () => {
    const fx = await setupSiteFixture(ctx);
    const book = await revenueBook(
      ctx.db,
      ["2026-11", "2026-12"],
      d("2026-12-05"),
    );
    const november = await beforeVat(fx.from.id, "2026-11", "2026-12-05");
    expect(rentOf(book, fx.from.id, "2026-11")).toBe(november);
    expect(byDay(book, fx.from.id).has(d("2026-11-30"))).toBe(true);
    expect(book.openMonths).toEqual(new Set(["2026-11", "2026-12"]));
  });

  it("reads a closed month from its snapshot", async () => {
    const fx = await setupSiteFixture(ctx);
    const closed = await closeMonth(ctx, fx, "2026-11");
    expect(closed.ok).toBe(true);
    const [period] = await ctx.db
      .select()
      .from(billingPeriod)
      .where(eq(billingPeriod.contractId, fx.from.id));
    const book = await revenueBook(ctx.db, ["2026-11"], d("2026-12-02"));
    expect(rentOf(book, fx.from.id, "2026-11")).toBe(
      (period?.totalAmount ?? 0) - (period?.vatAmount ?? 0),
    );
    expect(book.openMonths.has("2026-11")).toBe(
      // the other contract of the fixture has no rent in November
      false,
    );
    expect(book.mismatches).toEqual([]);
  });

  it("keeps an adjustment on its day before and after closing", async () => {
    const fx = await setupSiteFixture(ctx);
    expect((await closeMonth(ctx, fx, "2026-11")).ok).toBe(true);
    const saved = await createAdjustment(ctx.db, fx.accountant, {
      contractId: fx.from.id,
      month: "2026-12",
      refMonth: "2026-11",
      amount: -200_000,
      reason: "Kỳ 11 tính thừa",
    });
    expect(saved.ok).toBe(true);
    // Written 04/12/2026 09:00 in Vietnam.
    await getAdminDatabase()
      .update(billingAdjustment)
      .set({ createdAt: new Date("2026-12-04T02:00:00Z") })
      .where(eq(billingAdjustment.contractId, fx.from.id));
    const open = await revenueBook(ctx.db, ["2026-12"], d("2026-12-20"));
    const later = await revenueBook(ctx.db, ["2026-12"], d("2026-12-28"));
    expect(
      (await closeMonth(ctx, fx, "2026-12", new Date("2027-01-02T02:00:00Z")))
        .ok,
    ).toBe(true);
    const closed = await revenueBook(ctx.db, ["2026-12"], d("2027-01-02"));
    const daily = byDay(closed, fx.from.id);
    const rentOnly = byDay(open, fx.from.id).get(d("2026-12-05")) ?? 0;
    expect(daily.get(d("2026-12-04"))).toBe(rentOnly - 200_000);
    for (const [date, amount] of byDay(open, fx.from.id)) {
      expect(daily.get(date)).toBe(amount);
      expect(byDay(later, fx.from.id).get(date)).toBe(amount);
    }
    expect(byDay(open, fx.from.id).get(d("2026-12-20"))).toBe(rentOnly);
  });
});

describe("sale and the separate amounts", () => {
  it("counts posted sales on the delivery day, not planned ones", async () => {
    const fx = await setupReceivableFixture(ctx);
    const sale = await deliveredSale(
      ctx,
      fx,
      {},
      new Date("2026-11-05T03:00:00Z"),
    );
    await planned(ctx, fx, {
      contractId: sale.contractId,
      lines: [
        {
          itemId: fx.item("GG-K17"),
          condition: "GOOD",
          pricingUnit: "KG",
          quantity: "100",
        },
      ],
    });
    const [note] = await deliveredAmounts(ctx.db, sale.contractId);
    const book = await revenueBook(ctx.db, ["2026-11"], d("2026-11-06"));
    const sales = book.entries.filter((entry) => entry.sale !== 0);
    expect(sales).toEqual([
      {
        date: note?.businessDate,
        contractId: sale.contractId,
        customerId: expect.any(String),
        rent: 0,
        sale: (note?.saleTotal ?? 0) + (note?.freight ?? 0),
      },
    ]);
  });

  it("keeps approved compensation out of rent and sale", async () => {
    const fx = await setupReceivableFixture(ctx);
    const before = await revenueBook(ctx.db, ["2026-11"], d("2026-11-06"));
    const note = await approvedCompensation(
      ctx,
      fx,
      new Date("2026-11-05T03:00:00Z"),
    );
    const after = await revenueBook(ctx.db, ["2026-11"], d("2026-11-06"));
    const total = (book: RevenueBook) =>
      book.entries.reduce((sum, entry) => sum + entry.rent + entry.sale, 0);
    expect(after.separate).toEqual([
      {
        date: "2026-11-05",
        customerId: fx.customerId,
        kind: "COMPENSATION",
        amount: note.amountDue,
      },
    ]);
    expect(before.separate).toEqual([]);
    // The return of the lost goods changes rent, never by the compensation.
    expect(total(after)).not.toBe(total(before) + note.amountDue);
  });
});

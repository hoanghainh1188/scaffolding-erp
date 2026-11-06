// D1 as a whole (dashboard-basic tasks 3.10, 3.11): what each role gets
// from the server, the month card equal to its days, and opening D1
// writes nothing.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import type { ContractUser } from "@/domain/permissions";
import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import {
  approvedCompensation,
  closedPeriod,
  deliveredSale,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";

import { bookMonths, dashboardFor } from "./summary";

const ctx = createTestContext();
afterAll(ctx.close);

const TODAY = "2026-11-06" as BusinessDate;
const as = (
  role: ContractUser["role"],
  contractScope: ContractUser["contractScope"] = "ALL",
): ContractUser => ({ role, contractScope });
let fx: ReceivableFixture;

beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
  await closedPeriod(ctx, fx, "2026-09", 12_400_000, { terms: 1 });
  await deliveredSale(ctx, fx, {}, new Date("2026-11-05T03:00:00Z"));
  await approvedCompensation(ctx, fx, new Date("2026-11-05T04:00:00Z"));
});

describe("bookMonths", () => {
  it("covers the chart and January", () => {
    expect(bookMonths(TODAY)).toEqual(
      Array.from(
        { length: 11 },
        (_, i) => `2026-${String(i + 1).padStart(2, "0")}`,
      ),
    );
    expect(bookMonths("2027-02-10" as BusinessDate)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});

describe("dashboardFor", () => {
  it("gives the director and the accountant every block", async () => {
    for (const role of ["DIRECTOR", "ACCOUNTANT"] as const) {
      const data = await dashboardFor(ctx.db, as(role), TODAY);
      expect(Object.keys(data).sort()).toEqual([
        "approvals",
        "onSite",
        "overdue",
        "revenue",
        "risks",
        "stock",
        "top",
      ]);
      expect(data.overdue?.amount).toBe(12_400_000);
    }
  });

  it("never sends sales a money block", async () => {
    const data = await dashboardFor(ctx.db, as("SALES"), TODAY);
    expect(Object.keys(data).sort()).toEqual([
      "approvals",
      "onSite",
      "risks",
      "stock",
    ]);
    const text = JSON.stringify(data);
    expect(text).not.toContain("12400000");
    expect(text).not.toMatch(/"(overdue|revenue|top|money)"/);
    const saleOnly = await dashboardFor(ctx.db, as("SALES", "SALE"), TODAY);
    expect(saleOnly.risks).toBeUndefined();
    expect(saleOnly.onSite).toEqual(data.onSite);
  });

  it("adds the days of this month up to the month card", async () => {
    const data = await dashboardFor(ctx.db, as("DIRECTOR"), TODAY);
    const revenue = data.revenue;
    expect(revenue?.days.map((day) => day.date)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
    const rent = revenue?.days.reduce((sum, day) => sum + day.rent, 0);
    const sale = revenue?.days.reduce((sum, day) => sum + day.sale, 0);
    expect(revenue?.month).toMatchObject({
      month: "2026-11",
      rent,
      sale,
      provisional: true,
    });
    expect(sale).toBeGreaterThan(0);
    expect(revenue?.months).toHaveLength(6);
    expect(revenue?.separate).toBeGreaterThan(0);
    expect(revenue?.month.total).toBe((rent ?? 0) + (sale ?? 0));
  });

  it("writes nothing", async () => {
    const admin = getAdminDatabase();
    const count = async () => {
      const [row] = await admin.execute<{ ledger: number; log: number }>(
        sql`select (select count(*)::int from inventory_ledger) as ledger, (select count(*)::int from activity_log) as log`,
      );
      return row;
    };
    const before = await count();
    await dashboardFor(ctx.db, as("DIRECTOR"), TODAY);
    await dashboardFor(ctx.db, as("SALES"), TODAY);
    expect(await count()).toEqual(before);
  });
});

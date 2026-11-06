// D1 at its edges (dashboard-basic, spec dashboard): a database with no
// contract yet, a pending amendment, a site without a province, and a rental
// approved but not delivered yet.
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { site } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { ContractUser } from "@/domain/permissions";
import {
  createAmendment,
  submitAmendment,
  updateAmendment,
} from "@/lib/contracts/amendments";
import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import { d5Rental, setupContractFixture } from "@/test/contracts";
import { approvedContract } from "@/test/deliveries";
import { setupReceivableFixture } from "@/test/receivables";

import { pendingApprovals } from "./approvals";
import { siteLookup } from "./lookup";
import { revenueBook } from "./revenue";
import { riskySites } from "./risk";
import { onSiteSummary } from "./stock";
import { dashboardFor } from "./summary";
import { topRows } from "./top";

const ctx = createTestContext();
afterAll(ctx.close);

const TODAY = "2026-11-06" as BusinessDate;
const DIRECTOR: ContractUser = { role: "DIRECTOR", contractScope: "ALL" };

describe("a database with no contract", () => {
  it("shows empty blocks, not errors", async () => {
    await setupContractFixture(ctx);
    const book = await revenueBook(ctx.db, ["2026-11"], TODAY);
    expect(book.entries).toEqual([]);
    expect(book.openMonths.size).toBe(0);
    expect(await riskySites(ctx.db, DIRECTOR, TODAY)).toEqual([]);
    expect(await siteLookup(ctx.db, DIRECTOR, "duong noi", TODAY)).toEqual([]);
    expect(await pendingApprovals(ctx.db, DIRECTOR)).toEqual([]);
    expect((await onSiteSummary(ctx.db)).total).toMatchObject({
      siteCount: 0,
      piecesMilli: 0,
      kgMilli: 0,
    });
    expect(
      await topRows(ctx.db, book, "2026-01-01" as BusinessDate, TODAY),
    ).toEqual({ byRevenue: [], byKg: [] });
    const data = await dashboardFor(ctx.db, DIRECTOR, TODAY);
    expect(data.revenue?.month).toMatchObject({ total: 0, provisional: true });
    expect(data.revenue?.separate).toBe(0);
  });
});

describe("with the delivered D5 rental", () => {
  it("lists a pending amendment with its reason and link", async () => {
    const fx = await setupReceivableFixture(ctx);
    const draft = await createAmendment(ctx.db, fx.sales, fx.deal.id, {
      today: TODAY,
    });
    if (!draft.ok) throw new Error(draft.error);
    const saved = await updateAmendment(
      ctx.db,
      fx.sales,
      fx.deal.id,
      draft.data.number,
      {
        ...d5Rental(fx),
        lines: [
          { itemId: fx.item("PK-KU"), quantity: "400" },
          { itemId: fx.item("GG-K17"), quantity: "0", price: 1_500 },
        ],
        effectiveFrom: "2026-12-01",
        reason: "Khách đổi giá theo thỏa thuận mới",
        updatedAt: draft.data.updatedAt,
      },
    );
    if (!saved.ok) throw new Error(saved.error);
    const sent = await submitAmendment(
      ctx.db,
      fx.sales,
      fx.deal.id,
      draft.data.number,
    );
    if (!sent.ok) throw new Error(sent.error);
    const [row] = await pendingApprovals(ctx.db, DIRECTOR);
    expect(row).toMatchObject({
      kind: "AMENDMENT",
      label: "Phụ lục",
      summary: "Khách đổi giá theo thỏa thuận mới",
      href: `/sales/contracts/${fx.deal.id}/amendments/${draft.data.number}`,
    });
  });

  it("puts a site without a province under Chưa rõ", async () => {
    const fx = await setupReceivableFixture(ctx);
    await getAdminDatabase()
      .update(site)
      .set({ province: null })
      .where(eq(site.id, fx.site("Trường THCS Dương Nội")));
    const summary = await onSiteSummary(ctx.db);
    expect(summary.regions.at(-1)).toMatchObject({
      label: "Chưa rõ",
      siteCount: 1,
      piecesMilli: 440_000,
    });
    const [found] = await siteLookup(ctx.db, DIRECTOR, "duong noi", TODAY);
    expect(found).toMatchObject({ provinceName: null, regionLabel: null });
  });

  it("shows a rental approved but not delivered with nothing held", async () => {
    const fx = await setupReceivableFixture(ctx);
    const waiting = await approvedContract(ctx, fx, {
      ...d5Rental(fx),
      siteId: fx.site("Chung cư An Phú – Block B"),
    });
    const sites = await siteLookup(ctx.db, DIRECTOR, "an phu", TODAY);
    const entry = sites
      .flatMap((row) => row.contracts)
      .find((row) => row.id === waiting.id);
    expect(entry).toMatchObject({
      status: "APPROVED",
      onSite: { piecesMilli: 0, kgMilli: 0 },
      money: { rentThisMonth: 0, owed: 0 },
    });
    const book = await revenueBook(ctx.db, ["2026-11"], TODAY);
    expect(book.entries.some((row) => row.contractId === waiting.id)).toBe(
      false,
    );
  });
});

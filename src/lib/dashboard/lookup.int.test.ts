// Site lookup (dashboard-basic task 3.9, 0.2 #91, #97): found by code, name
// or customer without accents; goods for everyone, money only with
// receivables.view and equal to D7, D14 and the deposits of D5.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { site } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { ContractUser } from "@/domain/permissions";
import { contractStatement } from "@/lib/billing/queries";
import { createTestContext } from "@/test/auth";
import {
  closedPeriod,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";

import { siteLookup } from "./lookup";

const ctx = createTestContext();
afterAll(ctx.close);

const TODAY = "2026-11-06" as BusinessDate;
const DIRECTOR: ContractUser = { role: "DIRECTOR", contractScope: "ALL" };
let fx: ReceivableFixture;
let siteCode = "";

beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
  const [row] = await ctx.db
    .select({ code: site.code })
    .from(site)
    .where(eq(site.id, fx.site("Trường THCS Dương Nội")));
  siteCode = row?.code ?? "";
});

describe("siteLookup", () => {
  it("finds the site by code with goods and money as D7, D14 and D5", async () => {
    await closedPeriod(ctx, fx, "2026-10", 1_000_000, { terms: 15 });
    const [found] = await siteLookup(ctx.db, DIRECTOR, siteCode, TODAY);
    expect(found).toMatchObject({
      code: siteCode,
      name: "Trường THCS Dương Nội",
      provinceName: "Hà Nội",
      regionLabel: "Miền Bắc",
      onSite: { piecesMilli: 440_000 },
    });
    const [deal] = found?.contracts ?? [];
    const view = await contractStatement(ctx.db, fx.deal.id, "2026-11", TODAY);
    expect(deal).toMatchObject({
      id: fx.deal.id,
      signedDate: "2026-10-28",
      status: "ACTIVE",
      onSite: { piecesMilli: 440_000 },
      money: {
        rentThisMonth: view?.statement.beforeVat,
        rentAsOf: TODAY,
        owed: 1_000_000,
        overdue: { amount: 0, days: 0 },
        depositAgreed: 50_000_000,
        depositReceived: 0,
      },
    });
    expect(deal?.onSite.kgMilli).toBe(found?.onSite.kgMilli);
  });

  it("finds by customer name without accents", async () => {
    const sites = await siteLookup(
      ctx.db,
      { role: "ACCOUNTANT", contractScope: "ALL" },
      "minh phat",
      TODAY,
    );
    expect(sites.map((row) => row.name)).toContain("Trường THCS Dương Nội");
    expect(sites[0]?.contracts[0]?.money).toBeDefined();
  });

  it("sends sales the goods and no money", async () => {
    await closedPeriod(ctx, fx, "2026-10", 1_000_000, { terms: 15 });
    const sites = await siteLookup(
      ctx.db,
      { role: "SALES", contractScope: "ALL" },
      "duong noi",
      TODAY,
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]?.contracts[0]?.onSite.piecesMilli).toBe(440_000);
    expect(sites[0]?.contracts[0]).not.toHaveProperty("money");
    expect(JSON.stringify(sites)).not.toMatch(/1000000|50000000|rent/);
  });

  it("finds nothing for sales outside their scope", async () => {
    expect(
      await siteLookup(
        ctx.db,
        { role: "SALES", contractScope: "SALE" },
        siteCode,
        TODAY,
      ),
    ).toEqual([]);
  });

  it("does not search one character", async () => {
    expect(await siteLookup(ctx.db, DIRECTOR, " C ", TODAY)).toEqual([]);
  });
});

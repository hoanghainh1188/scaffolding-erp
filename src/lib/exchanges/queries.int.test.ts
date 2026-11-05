// What D6d reads (site-operations design D6, D10): items of the contract
// with Mới + Tốt by yard to give, items on site to take back, the yards,
// the freight default and the next batch number.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { createTestContext } from "@/test/auth";
import {
  setupSiteFixture,
  SITE_NOW,
  type SiteFixture,
} from "@/test/site-operations";

import { exchangeForm } from "./queries";
import { createExchange } from "./service";

const ctx = createTestContext();
afterAll(() => ctx.close());

let fx: SiteFixture;
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

const K = 1000;
const TODAY = "2026-11-05" as BusinessDate;

describe("exchangeForm", () => {
  it("gives the contract's items with yard stock and takes what is on site", async () => {
    const form = await exchangeForm(ctx.db, fx.from.id, TODAY);
    expect(form?.contract).toEqual({
      id: fx.from.id,
      code: fx.from.code,
      siteName: "Chung cư An Phú – Block B",
    });
    const codes = form?.give.map((row) => row.code) ?? [];
    expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b, "vi")));
    const kus = form?.give.find((row) => row.code === "PK-KU");
    // 1.000 PK-KU Mới at BAI-01 in the opening stock.
    expect((kus?.yardStock[fx.yard] ?? 0) / K).toBe(1000);
    expect(kus?.dailyPrice).toBeGreaterThan(0);
    // Chờ sửa and Phế liệu stay out: GG-M16 has 640 Tốt (+20, +10 others)
    // minus 60 sent to the site.
    const m16 = form?.give.find((row) => row.code === "GG-M16");
    expect((m16?.yardStock[fx.yard] ?? 0) / K).toBe(580);
    expect(form?.take.map((row) => [row.code, row.onSiteMilli / K])).toEqual([
      ["GG-CH", 260],
      ["GG-K17", 120],
      ["GG-M16", 60],
    ]);
    expect(form?.yards.map((yard) => yard.id)).toContain(fx.yard);
    expect(form?.nextBatchNo).toBeGreaterThan(1);
  });

  it("counts the exchange batch in the next batch number", async () => {
    const before = await exchangeForm(ctx.db, fx.from.id, TODAY);
    const made = await createExchange(
      ctx.db,
      fx.sales,
      {
        contractId: fx.from.id,
        lines: [{ itemId: fx.item("PK-KU"), quantity: "100" }],
        expected: [{ itemId: fx.item("GG-CH"), quantity: "100" }],
        overContractConfirmed: true,
      },
      { now: SITE_NOW },
    );
    expect(made.ok).toBe(true);
    const after = await exchangeForm(ctx.db, fx.from.id, TODAY);
    expect(after?.nextBatchNo).toBe((before?.nextBatchNo ?? 0) + 1);
  });

  it("is null for a rental not yet running and for an unknown id", async () => {
    expect(await exchangeForm(ctx.db, fx.to.id, TODAY)).toBeNull();
    expect(
      await exchangeForm(ctx.db, "00000000-0000-4000-8000-000000000000", TODAY),
    ).toBeNull();
  });
});

// What D6c and D6 read about buy-back notes (site-operations design D10):
// the note with its lines and names, the timeline rows, and the form of a
// running rental (what is on site with the contract's lost and daily prices).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { createTestContext } from "@/test/auth";
import {
  setupSiteFixture,
  SITE_NOW,
  type SiteFixture,
} from "@/test/site-operations";

import { buyBackForm, buyBackView, contractBuyBacks } from "./queries";
import {
  approveBuyBack,
  createBuyBack,
  rejectBuyBack,
  type BuyBackBody,
} from "./service";

const ctx = createTestContext();
afterAll(() => ctx.close());

let fx: SiteFixture;
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

const K = 1000;
const TODAY = "2026-11-05" as BusinessDate;
const LATER = new Date("2026-11-06T03:00:00Z");

const body = (counts: Record<string, number>): BuyBackBody => ({
  contractId: fx.from.id,
  reason: "Ty ren đã đổ bê tông",
  lines: Object.entries(counts).map(([code, count]) => ({
    itemId: fx.item(code),
    quantity: String(count),
  })),
});

async function made(counts: Record<string, number>, now = SITE_NOW) {
  const saved = await createBuyBack(ctx.db, fx.sales, body(counts), { now });
  if (!saved.ok) throw new Error(saved.error);
  return saved.data;
}

describe("buyBackView", () => {
  it("reads a pending note by id and by code, lines in order", async () => {
    const note = await made({ "GG-M16": 5, "GG-CH": 20 });
    const byId = await buyBackView(ctx.db, note.id);
    expect(byId).toMatchObject({
      code: "MLA-2026-001",
      status: "PENDING",
      contractId: fx.from.id,
      contractCode: fx.from.code,
      siteName: "Chung cư An Phú – Block B",
      reason: "Ty ren đã đổ bê tông",
      amountDue: null,
      approvedByName: null,
    });
    expect(byId?.createdByName).not.toBe("");
    expect(
      byId?.lines.map((line) => [
        line.itemCode,
        line.milli / K,
        line.unitPrice,
      ]),
    ).toEqual([
      ["GG-M16", 5, 280_000],
      ["GG-CH", 20, 80_000],
    ]);
    expect(await buyBackView(ctx.db, "MLA-2026-001")).toEqual(byId);
  });

  it("names the approver once approved", async () => {
    const note = await made({ "GG-CH": 20 });
    await approveBuyBack(ctx.db, fx.director, note.id, {}, { now: LATER });
    const view = await buyBackView(ctx.db, note.id);
    expect(view).toMatchObject({
      status: "APPROVED",
      amountDue: 1_600_000,
      approvedDate: "2026-11-06",
    });
    expect(view?.approvedByName).not.toBeNull();
  });

  it("is null for an unknown id or code", async () => {
    expect(
      await buyBackView(ctx.db, "00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
    expect(await buyBackView(ctx.db, "MLA-2026-999")).toBeNull();
  });
});

describe("contractBuyBacks", () => {
  it("lists the contract's notes newest first, dated by approval", async () => {
    const first = await made({ "GG-CH": 20 });
    const second = await made(
      { "GG-M16": 5 },
      new Date("2026-11-05T09:00:00Z"),
    );
    await approveBuyBack(ctx.db, fx.director, first.id, {}, { now: LATER });
    await rejectBuyBack(ctx.db, fx.director, second.id, {
      reason: "Lấy ra được",
    });
    const rows = await contractBuyBacks(ctx.db, fx.from.id);
    expect(
      rows.map((row) => [row.code, row.status, row.date, row.total]),
    ).toEqual([
      [second.code, "REJECTED", "2026-11-05", 5 * 280_000],
      [first.code, "APPROVED", "2026-11-06", 20 * 80_000],
    ]);
    expect(rows[1]?.text).toContain("20");
  });

  it("is empty for a contract without buy-backs", async () => {
    expect(await contractBuyBacks(ctx.db, fx.to.id)).toEqual([]);
  });
});

describe("buyBackForm", () => {
  it("lists what is on site with lost and daily prices, by code", async () => {
    const form = await buyBackForm(ctx.db, fx.from.id, TODAY);
    expect(form?.contract).toMatchObject({
      id: fx.from.id,
      code: fx.from.code,
      siteName: "Chung cư An Phú – Block B",
    });
    expect(
      form?.items.map((row) => [row.code, row.onSiteMilli / K, row.lostPrice]),
    ).toEqual([
      ["GG-CH", 260, 80_000],
      ["GG-K17", 120, expect.any(Number)],
      ["GG-M16", 60, 280_000],
    ]);
    for (const row of form?.items ?? []) {
      expect(row.dailyPrice).toBeGreaterThan(0);
    }
    expect(form?.paymentTermsDays).toBe(30);
  });

  it("is null for a rental not yet running and for an unknown id", async () => {
    expect(await buyBackForm(ctx.db, fx.to.id, TODAY)).toBeNull();
    expect(
      await buyBackForm(ctx.db, "00000000-0000-4000-8000-000000000000", TODAY),
    ).toBeNull();
  });
});

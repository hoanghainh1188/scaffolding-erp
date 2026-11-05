// What D6b, D6, M9 and M7 read about site transfers (site-operations design
// D10): one transfer with both places, the list by contract or status, the
// D6b form with its targets, and the posted transfers by day.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { createTestContext } from "@/test/auth";
import {
  draftTransfer,
  movedNow,
  setupSiteFixture,
  SITE_NOW,
  type SiteFixture,
} from "@/test/site-operations";

import {
  listTransfers,
  mobileTransfer,
  transferForm,
  transferView,
  transfersByDay,
} from "./queries";

const ctx = createTestContext();
afterAll(() => ctx.close());

let fx: SiteFixture;
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

const K = 1000;
const TODAY = "2026-11-05" as BusinessDate;
const NEXT_DAY = new Date("2026-11-06T03:00:00Z");
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

describe("transferView", () => {
  it("reads a draft by id and code with both places, nothing moved", async () => {
    const draft = await draftTransfer(ctx, fx, { "GG-CH": 50, "GG-M16": 10 });
    const view = await transferView(ctx.db, draft.id);
    expect(view).toMatchObject({
      code: draft.code,
      status: "DRAFT",
      from: {
        contractId: fx.from.id,
        contractCode: fx.from.code,
        siteName: "Chung cư An Phú – Block B",
      },
      to: {
        contractId: fx.to.id,
        contractCode: fx.to.code,
        siteName: "Trường THCS Dương Nội",
      },
      vehiclePlate: "29C-456.78",
      businessDate: null,
      postedByName: null,
      postedAt: null,
    });
    expect(
      view?.lines.map((line) => [line.itemCode, line.planned, line.moved]),
    ).toEqual([
      ["GG-CH", "50", null],
      ["GG-M16", "10", null],
    ]);
    expect(await mobileTransfer(ctx.db, draft.code)).toEqual(view);
  });

  it("shows what moved, the day and who posted", async () => {
    const posted = await movedNow(ctx, fx, { "GG-CH": 50 });
    const view = await transferView(ctx.db, posted.code);
    expect(view).toMatchObject({
      status: "POSTED",
      businessDate: "2026-11-05",
      sameCustomer: true,
    });
    expect(view?.postedByName).not.toBeNull();
    expect(view?.lines[0]).toMatchObject({ planned: "50", moved: "50" });
  });

  it("is null for an unknown id or code", async () => {
    expect(await transferView(ctx.db, UNKNOWN)).toBeNull();
    expect(await transferView(ctx.db, "CCT-2026-999")).toBeNull();
  });
});

describe("listTransfers", () => {
  it("filters by either contract and by status, newest first", async () => {
    const posted = await movedNow(ctx, fx, { "GG-CH": 50 });
    const draft = await draftTransfer(ctx, fx, { "GG-M16": 10 }, {}, NEXT_DAY);
    const both = await listTransfers(ctx.db, { contractId: fx.to.id });
    expect(both.map((row) => row.code)).toEqual([draft.code, posted.code]);
    expect(both[1]).toMatchObject({
      fromSite: "Chung cư An Phú – Block B",
      toSite: "Trường THCS Dương Nội",
      lines: [{ unit: "PIECE", milli: 50 * K }],
    });
    expect(
      (await listTransfers(ctx.db, { contractId: fx.from.id })).length,
    ).toBe(2);
    expect(
      (await listTransfers(ctx.db, { statuses: ["DRAFT"] })).map(
        (row) => row.code,
      ),
    ).toEqual([draft.code]);
  });

  it("is empty when nothing matches", async () => {
    expect(await listTransfers(ctx.db, { contractId: UNKNOWN })).toEqual([]);
  });
});

describe("transferForm", () => {
  it("splits the source stock by condition and lists the other rentals", async () => {
    const form = await transferForm(ctx.db, fx.sales, fx.from.id, TODAY);
    expect(form?.from).toMatchObject({
      id: fx.from.id,
      siteName: "Chung cư An Phú – Block B",
    });
    expect(
      form?.items.map((row) => [row.code, row.newMilli / K, row.goodMilli / K]),
    ).toEqual([
      ["GG-CH", 0, 260],
      ["GG-K17", 20, 100],
      ["GG-M16", 0, 60],
    ]);
    expect(form?.targets.map((target) => target.id)).toEqual([fx.to.id]);
    expect(form?.targets[0]).toMatchObject({
      siteName: "Trường THCS Dương Nội",
      status: "APPROVED",
    });
  });

  it("offers no target to a user who may not manage rentals", async () => {
    const seller = await fx.seller("thuyvy", "SALE");
    const form = await transferForm(ctx.db, seller, fx.from.id, TODAY);
    expect(form?.items.length).toBe(3);
    expect(form?.targets).toEqual([]);
  });

  it("is null when the source is not running or unknown", async () => {
    expect(await transferForm(ctx.db, fx.sales, fx.to.id, TODAY)).toBeNull();
    expect(await transferForm(ctx.db, fx.sales, UNKNOWN, TODAY)).toBeNull();
    expect(await transferForm(ctx.db, fx.sales, "x", TODAY)).toBeNull();
  });
});

describe("transfersByDay", () => {
  it("groups posted transfers by day, latest days first, with more", async () => {
    const first = await movedNow(ctx, fx, { "GG-CH": 10 }, {}, SITE_NOW);
    const second = await movedNow(ctx, fx, { "GG-CH": 20 }, {}, NEXT_DAY);
    await draftTransfer(ctx, fx, { "GG-M16": 5 });
    const latest = await transfersByDay(ctx.db, { days: 1 });
    expect(latest.hasMore).toBe(true);
    expect(latest.days).toHaveLength(1);
    expect(latest.days[0]?.date).toBe("2026-11-06");
    expect(latest.days[0]?.transfers).toEqual([
      expect.objectContaining({
        code: second.code,
        route: "Chung cư An Phú – Block B → Trường THCS Dương Nội",
      }),
    ]);
    const older = await transfersByDay(ctx.db, {
      before: "2026-11-06" as BusinessDate,
    });
    expect(older.hasMore).toBe(false);
    expect(older.days.map((day) => day.date)).toEqual(["2026-11-05"]);
    expect(older.days[0]?.transfers.map((row) => row.code)).toEqual([
      first.code,
    ]);
  });

  it("is empty before any transfer was posted", async () => {
    expect(await transfersByDay(ctx.db)).toEqual({ days: [], hasMore: false });
  });
});

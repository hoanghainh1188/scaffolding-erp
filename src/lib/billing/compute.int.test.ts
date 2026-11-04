// Rent read from real documents (rental-billing tasks 3.1–3.3): delivery,
// return with lost goods, a same-customer site transfer, a pending
// buy-back, a late phone draft, and the D7 list of a month.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { createBuyBack } from "@/lib/buy-backs/service";
import { siteLedgerLines } from "@/lib/deliveries/site-ledger";
import { createTestContext } from "@/test/auth";
import { d5Rental } from "@/test/contracts";
import { approvedContract, approvedKgSale } from "@/test/deliveries";
import { deliverMore, returnOf, type Counts } from "@/test/returns";
import {
  movedNow,
  setupSiteFixture,
  type SiteFixture,
} from "@/test/site-operations";

import { loadBillingSource, statementOf } from "./compute";
import { periodList } from "./queries";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: SiteFixture;
const DEC_2 = "2026-12-02" as BusinessDate;

beforeEach(async () => {
  // An Phú – Block B received 120 GG-K17, 260 GG-CH, 60 GG-M16 on 03/11/2026.
  fx = await setupSiteFixture(ctx);
});

function returnFrom(
  deal: { id: string; code: string },
  lines: Record<string, Counts>,
  now: Date,
  body = {},
) {
  return returnOf(ctx, { ...fx, deal, siteLocation: "" }, lines, { now, body });
}

async function november(contractId: string, today = DEC_2) {
  const source = await loadBillingSource(ctx.db, contractId);
  return statementOf(source, "2026-11", today, []);
}

const summary = (lines: Awaited<ReturnType<typeof november>>["lines"]) =>
  lines.map((line) => [
    line.itemCode,
    line.kind,
    line.quantityMilli / 1000,
    line.fromDate,
    line.toDate,
    line.chargedDays,
    line.amount,
    line.out?.kind ?? null,
  ]);

describe("siteLedgerLines", () => {
  it("lists the dated lines of the contract with their documents", async () => {
    const lines = await siteLedgerLines(ctx.db, fx.from.id);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.businessDate === "2026-11-03")).toBe(
      true,
    );
    expect(lines.every((line) => line.documentType === "DELIVERY_NOTE")).toBe(
      true,
    );
    expect(lines[0]?.documentCode).toMatch(/^PX-2026-/);
    expect(await siteLedgerLines(ctx.db, fx.to.id)).toEqual([]);
  });

  it("keeps two contracts of one site apart", async () => {
    const second = await approvedContract(ctx, fx, {
      ...d5Rental(fx),
      siteId: fx.site("Chung cư An Phú – Block B"),
    });
    await deliverMore(ctx, fx, second.id, [["GG-K17", "GOOD", 40]]);
    const own = await siteLedgerLines(ctx.db, second.id);
    expect(own.map((line) => [line.movement, line.milli / 1000])).toEqual([
      ["DELIVERY_IN", 40],
    ]);
    const first = await november(fx.from.id);
    expect(
      first.lines.find((line) => line.itemCode === "GG-K17")?.quantityMilli,
    ).toBe(120_000);
    const other = await november(second.id);
    expect(
      other.lines.map((line) => [line.itemCode, line.quantityMilli / 1000]),
    ).toEqual([["GG-K17", 40]]);
  });
});

describe("rent from the ledger", () => {
  it("bills the delivered goods from the day after, Mới and Tốt together", async () => {
    const s = await november(fx.from.id);
    expect(summary(s.lines)).toEqual([
      ["GG-CH", "RENT", 260, "2026-11-04", "2026-11-30", 27, 2_106_000, null],
      ["GG-K17", "RENT", 120, "2026-11-04", "2026-11-30", 27, 3_888_000, null],
      ["GG-M16", "RENT", 60, "2026-11-04", "2026-11-30", 27, 1_458_000, null],
    ]);
    expect(s.lines[0]?.inDoc?.code).toMatch(/^PX-2026-/);
  });

  it("stops returned and lost goods on the return day; only returns top up", async () => {
    const posted = await returnFrom(
      fx.from,
      { "GG-K17": [28, 0, 0, 2] },
      new Date("2026-11-05T02:40:00Z"),
    );
    expect(posted.ok).toBe(true);
    const s = await november(fx.from.id);
    expect(
      summary(s.lines.filter((line) => line.itemCode === "GG-K17")),
    ).toEqual([
      ["GG-K17", "RENT", 28, "2026-11-04", "2026-11-05", 2, 67_200, "RETURN"],
      ["GG-K17", "RENT", 2, "2026-11-04", "2026-11-05", 2, 4_800, "LOSS"],
      ["GG-K17", "MINIMUM", 28, null, null, 43, 1_444_800, "RETURN"],
      ["GG-K17", "RENT", 90, "2026-11-04", "2026-11-30", 27, 2_916_000, null],
    ]);
  });

  it("carries the first delivery date across a same-customer transfer", async () => {
    await movedNow(ctx, fx, { "GG-CH": 50 });
    const source = await november(fx.from.id);
    expect(
      summary(source.lines.filter((line) => line.itemCode === "GG-CH")),
    ).toEqual([
      ["GG-CH", "RENT", 50, "2026-11-04", "2026-11-05", 2, 30_000, "TRANSFER"],
      ["GG-CH", "RENT", 210, "2026-11-04", "2026-11-30", 27, 1_701_000, null],
    ]);
    const returned = await returnFrom(
      fx.to,
      { "GG-CH": [50, 0, 0, 0] },
      new Date("2026-11-20T03:00:00Z"),
    );
    expect(returned.ok).toBe(true);
    const target = await november(fx.to.id);
    // 15 days at Dương Nội; the chain started 03/11: 17 days, top-up 28.
    expect(summary(target.lines)).toEqual([
      ["GG-CH", "RENT", 50, "2026-11-06", "2026-11-20", 15, 225_000, "RETURN"],
      ["GG-CH", "MINIMUM", 50, null, null, 28, 420_000, "RETURN"],
    ]);
    expect(target.lines[1]).toMatchObject({ rentedDays: 17, minimumDays: 45 });
    expect(target.lines[0]?.originDate).toBe("2026-11-03");
  });

  it("keeps billing goods of a pending buy-back", async () => {
    const saved = await createBuyBack(
      ctx.db,
      fx.sales,
      {
        contractId: fx.from.id,
        reason: "Khách mua lại 10 mâm",
        lines: [
          { itemId: fx.item("GG-M16"), quantity: "10", unitPrice: 280_000 },
        ],
      },
      { now: new Date("2026-11-10T03:00:00Z") },
    );
    expect(saved.ok).toBe(true);
    const s = await november(fx.from.id);
    expect(
      summary(s.lines.filter((line) => line.itemCode === "GG-M16")),
    ).toEqual([
      ["GG-M16", "RENT", 60, "2026-11-04", "2026-11-30", 27, 1_458_000, null],
    ]);
  });

  it("dates a late phone draft by the day it reached the server", async () => {
    const posted = await returnFrom(
      fx.from,
      { "GG-M16": [60, 0, 0, 0] },
      new Date("2026-12-01T00:10:00Z"),
      { savedOnDeviceAt: "2026-11-30T16:50:00Z" },
    );
    expect(posted.ok).toBe(true);
    const nov = await november(fx.from.id, "2026-12-05" as BusinessDate);
    expect(
      nov.lines.find(
        (line) => line.itemCode === "GG-M16" && line.kind === "RENT",
      ),
    ).toMatchObject({ toDate: "2026-11-30", chargedDays: 27 });
    const source = await loadBillingSource(ctx.db, fx.from.id);
    const dec = statementOf(
      source,
      "2026-12",
      "2026-12-05" as BusinessDate,
      [],
    );
    expect(
      dec.lines
        .filter((line) => line.itemCode === "GG-M16")
        .map((line) => [
          line.kind,
          line.fromDate,
          line.toDate,
          line.chargedDays,
        ]),
    ).toEqual([
      ["RENT", "2026-12-01", "2026-12-01", 1],
      // 28 days from 03/11 to 01/12: topped up in December.
      ["MINIMUM", null, null, 17],
    ]);
  });
});

describe("periodList", () => {
  it("lists running rental contracts with rent, not sales or empty ones", async () => {
    await approvedKgSale(ctx, fx);
    const list = await periodList(ctx.db, "2026-11", DEC_2);
    expect(list.contracts.map((entry) => [entry.code, entry.closed])).toEqual([
      [fx.from.code, false],
    ]);
    expect(list.contracts[0]?.totalAmount).toBe(
      2_106_000 + 3_888_000 + 1_458_000,
    );
    expect(list.closedCount).toBe(0);
    const october = await periodList(ctx.db, "2026-10", DEC_2);
    expect(october.contracts).toEqual([]);
  });
});

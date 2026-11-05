// What D7 reads (rental-billing design D4, D6, D12): a closed period is read
// back from its copy and shows what was shown when it was closed (returned,
// lost and minimum lines, adjustments); the documents still waiting; the
// month list with stored totals.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { createBuyBack } from "@/lib/buy-backs/service";
import { createContract } from "@/lib/contracts/service";
import { createTestContext } from "@/test/auth";
import { closeMonth, DEC_2_DATE } from "@/test/billing";
import { d5Rental } from "@/test/contracts";
import { approvedKgSale } from "@/test/deliveries";
import { returnOf, type Counts } from "@/test/returns";
import {
  draftTransfer,
  setupSiteFixture,
  SITE_NOW,
  type SiteFixture,
} from "@/test/site-operations";

import { createAdjustment } from "./adjustments";
import { contractStatement, periodList } from "./queries";

const ctx = createTestContext();
afterAll(() => ctx.close());

let fx: SiteFixture;
beforeEach(async () => {
  // An Phú – Block B received 120 GG-K17, 260 GG-CH, 60 GG-M16 on 03/11/2026.
  fx = await setupSiteFixture(ctx);
});

const NOV_10 = new Date("2026-11-10T03:00:00Z");
const JAN_3 = new Date("2027-01-03T02:00:00Z");
const JAN_3_DATE = "2027-01-03" as BusinessDate;

async function returned(lines: Record<string, Counts>, now = NOV_10) {
  const result = await returnOf(
    ctx,
    { ...fx, deal: fx.from, siteLocation: fx.fromLocation },
    lines,
    { now },
  );
  if (!result.ok) throw new Error(result.error);
}

const statement = (month: string, today = DEC_2_DATE) =>
  contractStatement(ctx.db, fx.from.id, month, today);

describe("a closed period read back", () => {
  it("shows the same lines, labels and total as when it was closed", async () => {
    // 20 GG-CH back Tốt and 5 lost on 10/11: returned lines, one minimum
    // line for the 20 returned early, none for the lost ones.
    await returned({ "GG-CH": [20, 0, 0, 5] });
    const live = await statement("2026-11");
    if (!live) throw new Error("no statement");
    expect(live.closed).toBeNull();
    const kinds = live.statement.lines.map((line) => line.kind);
    expect(kinds).toContain("MINIMUM");
    expect(live.statement.lines.some((line) => line.out !== null)).toBe(true);

    const closed = await closeMonth(ctx, fx, "2026-11");
    expect(closed.ok).toBe(true);
    const stored = await statement("2026-11");
    expect(stored?.closed?.byName).not.toBe("");
    expect(stored?.pending).toEqual([]);
    expect(stored?.closedMonths).toEqual(["2026-11"]);
    expect(stored?.statement.totalAmount).toBe(live.statement.totalAmount);
    expect(
      stored?.statement.lines.map((line) => ({
        kind: line.kind,
        itemCode: line.itemCode,
        quantityMilli: line.quantityMilli,
        fromDate: line.fromDate,
        toDate: line.toDate,
        chargedDays: line.chargedDays,
        amount: line.amount,
        minimumDays: line.minimumDays,
        out: line.out?.kind ?? null,
      })),
    ).toEqual(
      live.statement.lines.map((line) => ({
        kind: line.kind,
        itemCode: line.itemCode,
        quantityMilli: line.quantityMilli,
        fromDate: line.fromDate,
        toDate: line.toDate,
        chargedDays: line.chargedDays,
        amount: line.amount,
        minimumDays: line.minimumDays,
        out: line.out?.kind ?? null,
      })),
    );
  });

  it("keeps the adjustment with its reason and author", async () => {
    expect((await closeMonth(ctx, fx, "2026-11")).ok).toBe(true);
    const adjustment = await createAdjustment(ctx.db, fx.accountant, {
      contractId: fx.from.id,
      month: "2026-12",
      refMonth: "2026-11",
      amount: 93_000,
      reason: "Kỳ 11 thiếu",
    });
    if (!adjustment.ok) throw new Error(adjustment.error);
    const live = await statement("2026-12", JAN_3_DATE);
    expect((await closeMonth(ctx, fx, "2026-12", JAN_3)).ok).toBe(true);
    const stored = await statement("2026-12", JAN_3_DATE);
    expect(stored?.statement.totalAmount).toBe(live?.statement.totalAmount);
    const adjustments = (stored?.statement.lines ?? [])
      .map((line) => line.adjustment)
      .filter((value) => value !== null);
    expect(adjustments).toEqual([
      expect.objectContaining({
        refMonth: "2026-11",
        amount: 93_000,
        reason: "Kỳ 11 thiếu",
      }),
    ]);
    expect(adjustments[0]?.createdByName).not.toBe("");
    expect(stored?.statement.adjustmentAmount).toBe(93_000);
    expect(stored?.closedMonths).toEqual(["2026-12", "2026-11"]);
  });

  it("lists the stored total in the month list, counted as closed", async () => {
    const before = await periodList(ctx.db, "2026-11", DEC_2_DATE);
    const open = before.contracts.find((row) => row.id === fx.from.id);
    expect(open?.closed).toBe(false);
    expect(before.closedCount).toBe(0);
    expect((await closeMonth(ctx, fx, "2026-11")).ok).toBe(true);
    const after = await periodList(ctx.db, "2026-11", DEC_2_DATE);
    expect(after.contracts.find((row) => row.id === fx.from.id)).toMatchObject({
      closed: true,
      totalAmount: open?.totalAmount,
    });
    expect(after.closedCount).toBe(1);
  });
});

describe("documents still waiting", () => {
  it("lists a draft transfer and a pending buy-back of the contract", async () => {
    const transfer = await draftTransfer(ctx, fx, { "GG-CH": 10 });
    const buyBack = await createBuyBack(
      ctx.db,
      fx.sales,
      {
        contractId: fx.from.id,
        reason: "Đổ bê tông",
        lines: [{ itemId: fx.item("GG-M16"), quantity: "2" }],
      },
      { now: SITE_NOW },
    );
    if (!buyBack.ok) throw new Error(buyBack.error);
    const view = await statement("2026-11");
    expect(view?.pending).toEqual(
      [
        {
          code: transfer.code,
          label: expect.any(String),
          when: "khi xác nhận chuyển",
        },
        {
          code: buyBack.data.code,
          label: expect.any(String),
          when: "khi Giám đốc duyệt",
        },
      ].sort((a, b) => a.code.localeCompare(b.code)),
    );
    // The receiving contract sees the transfer too.
    const target = await contractStatement(
      ctx.db,
      fx.to.id,
      "2026-11",
      DEC_2_DATE,
    );
    expect(target?.pending.map((row) => row.code)).toEqual([transfer.code]);
  });
});

describe("contractStatement", () => {
  it("is null for a rental with no approved version yet", async () => {
    const draft = await createContract(ctx.db, fx.sales, d5Rental(fx));
    if (!draft.ok) throw new Error(draft.error);
    expect(
      await contractStatement(ctx.db, draft.data.id, "2026-11", DEC_2_DATE),
    ).toBeNull();
  });

  it("is null for a sale and for an unknown contract", async () => {
    const sale = await approvedKgSale(ctx, fx);
    expect(
      await contractStatement(ctx.db, sale.id, "2026-11", DEC_2_DATE),
    ).toBeNull();
    expect(
      await contractStatement(
        ctx.db,
        "00000000-0000-4000-8000-000000000000",
        "2026-11",
        DEC_2_DATE,
      ),
    ).toBeNull();
  });
});

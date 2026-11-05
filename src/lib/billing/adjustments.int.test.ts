// Adjustments of a closed period (rental-billing task 4.2, 0.2 #22, #80).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { closeMonth } from "@/test/billing";
import { approvedKgSale } from "@/test/deliveries";
import { setupSiteFixture, type SiteFixture } from "@/test/site-operations";

import {
  ADJUSTMENT_MAX,
  ADJUSTMENT_MESSAGES,
  ADJUSTMENT_REASON_MAX,
  createAdjustment,
  deleteAdjustment,
  updateAdjustment,
  type AdjustmentBody,
} from "./adjustments";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: SiteFixture;
const JAN_3 = new Date("2027-01-03T02:00:00Z");

beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

const body = (extra: Partial<AdjustmentBody> = {}): AdjustmentBody => ({
  contractId: fx.from.id,
  month: "2026-12",
  refMonth: "2026-11",
  amount: 93_000,
  reason: "Kỳ 11 thiếu 10 GG-CH × 31 ngày (giao 31/10 chưa ghi)",
  ...extra,
});

async function closedNovember() {
  const result = await closeMonth(ctx, fx, "2026-11");
  if (!result.ok) throw new Error(result.error);
}

describe("createAdjustment", () => {
  it("writes a correction of a closed month into an open one, one log row", async () => {
    await closedNovember();
    const before = (await activityRows(ctx.db)).length;
    const saved = await createAdjustment(ctx.db, fx.accountant, body());
    expect(saved).toMatchObject({
      ok: true,
      data: { month: "2026-12", refMonth: "2026-11", amount: 93_000 },
    });
    const rows = (await activityRows(ctx.db)).slice(before);
    expect(
      rows.map((row) => [
        row.action,
        row.documentType,
        row.documentCode,
        row.summary,
        row.flags,
      ]),
    ).toEqual([
      [
        "CREATE",
        "BILLING_ADJUSTMENT",
        `${fx.from.code} · 12/2026`,
        "Điều chỉnh kỳ 11/2026 · 93.000 ₫ · Kỳ 11 thiếu 10 GG-CH × 31 ngày (giao 31/10 chưa ghi)",
        expect.not.arrayContaining(["ANOMALY"]),
      ],
    ]);
  });

  it("flags a negative amount for the director", async () => {
    await closedNovember();
    const saved = await createAdjustment(
      ctx.db,
      fx.accountant,
      body({ amount: -50_000, reason: "Kỳ 11 tính thừa 1 ngày nghỉ" }),
    );
    expect(saved.ok).toBe(true);
    expect((await activityRows(ctx.db)).at(-1)?.flags).toContain("ANOMALY");
  });

  it("needs a reason and an amount other than 0 ₫", async () => {
    await closedNovember();
    expect(
      await createAdjustment(ctx.db, fx.accountant, body({ reason: " " })),
    ).toEqual({
      ok: false,
      status: 422,
      field: "reason",
      error: ADJUSTMENT_MESSAGES.reason,
    });
    expect(
      await createAdjustment(ctx.db, fx.accountant, body({ amount: 0 })),
    ).toEqual({
      ok: false,
      status: 422,
      field: "amount",
      error: "Số tiền điều chỉnh phải khác 0 ₫.",
    });
  });

  it("refuses a correction of a month not closed", async () => {
    expect(await createAdjustment(ctx.db, fx.accountant, body())).toEqual({
      ok: false,
      status: 422,
      field: "refMonth",
      error:
        "Kỳ 11/2026 chưa chốt nên không cần dòng điều chỉnh. Bạn xem lại số của kỳ đó trên D7 rồi chốt.",
    });
  });

  it("refuses to write into a closed month", async () => {
    await closedNovember();
    expect(
      await createAdjustment(
        ctx.db,
        fx.accountant,
        body({ month: "2026-11", refMonth: "2026-10" }),
      ),
    ).toMatchObject({
      ok: false,
      status: 409,
      error: "Kỳ 11/2026 đã chốt nên không thêm được dòng. Bạn ghi vào kỳ sau.",
    });
  });

  it("is refused to sales", async () => {
    await closedNovember();
    expect(await createAdjustment(ctx.db, fx.sales, body())).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe("updateAdjustment and deleteAdjustment", () => {
  it("edits while the month is open, answers 409 when stale", async () => {
    await closedNovember();
    const saved = await createAdjustment(ctx.db, fx.accountant, body());
    if (!saved.ok) throw new Error(saved.error);
    const edited = await updateAdjustment(
      ctx.db,
      fx.accountant,
      saved.data.id,
      {
        amount: 95_000,
        updatedAt: saved.data.updatedAt,
      },
    );
    expect(edited).toMatchObject({ ok: true, data: { amount: 95_000 } });
    expect(
      await updateAdjustment(ctx.db, fx.director, saved.data.id, {
        amount: 90_000,
        updatedAt: saved.data.updatedAt,
      }),
    ).toEqual({ ok: false, status: 409, error: ADJUSTMENT_MESSAGES.stale });
  });

  it("freezes once its month is closed", async () => {
    await closedNovember();
    const saved = await createAdjustment(ctx.db, fx.accountant, body());
    if (!saved.ok) throw new Error(saved.error);
    const closed = await closeMonth(ctx, fx, "2026-12", JAN_3);
    expect(closed.ok).toBe(true);
    const frozen = {
      ok: false,
      status: 409,
      error: "Kỳ 12/2026 đã chốt nên dòng điều chỉnh này không sửa được.",
    };
    expect(
      await updateAdjustment(ctx.db, fx.accountant, saved.data.id, {
        amount: 95_000,
        updatedAt: saved.data.updatedAt,
      }),
    ).toEqual(frozen);
    expect(
      await deleteAdjustment(ctx.db, fx.accountant, saved.data.id, {
        updatedAt: saved.data.updatedAt,
      }),
    ).toEqual(frozen);
  });

  it("deletes with one log row", async () => {
    await closedNovember();
    const saved = await createAdjustment(ctx.db, fx.accountant, body());
    if (!saved.ok) throw new Error(saved.error);
    const before = (await activityRows(ctx.db)).length;
    expect(
      (
        await deleteAdjustment(ctx.db, fx.accountant, saved.data.id, {
          updatedAt: saved.data.updatedAt,
        })
      ).ok,
    ).toBe(true);
    expect(
      (await activityRows(ctx.db)).slice(before).map((row) => row.action),
    ).toEqual(["DELETE"]);
  });
});

describe("adjustment checks", () => {
  const invalid = (field: string, error: string) => ({
    ok: false,
    status: 422,
    field,
    error,
  });

  it("refuses a month that is not a month", async () => {
    const result = await createAdjustment(
      ctx.db,
      fx.accountant,
      body({ month: "2026-13" }),
    );
    expect(result).toMatchObject({ ok: false, status: 422, field: "month" });
  });

  it("needs the corrected month before the month of the line", async () => {
    expect(
      await createAdjustment(
        ctx.db,
        fx.accountant,
        body({ refMonth: "2026-12" }),
      ),
    ).toEqual(invalid("refMonth", ADJUSTMENT_MESSAGES.refNotBefore));
  });

  it("refuses amounts that are not whole đồng or too big", async () => {
    expect(
      await createAdjustment(ctx.db, fx.accountant, body({ amount: 1.5 })),
    ).toEqual(invalid("amount", ADJUSTMENT_MESSAGES.zero));
    expect(
      await createAdjustment(
        ctx.db,
        fx.accountant,
        body({ amount: -(ADJUSTMENT_MAX + 1) }),
      ),
    ).toEqual(invalid("amount", ADJUSTMENT_MESSAGES.tooBig));
  });

  it("refuses a reason over the limit", async () => {
    expect(
      await createAdjustment(
        ctx.db,
        fx.accountant,
        body({ reason: "x".repeat(ADJUSTMENT_REASON_MAX + 1) }),
      ),
    ).toEqual(invalid("reason", ADJUSTMENT_MESSAGES.reasonTooLong));
  });

  it("is for rentals only", async () => {
    const sale = await approvedKgSale(ctx, fx);
    expect(
      await createAdjustment(
        ctx.db,
        fx.accountant,
        body({ contractId: sale.id }),
      ),
    ).toEqual({ ok: false, status: 409, error: ADJUSTMENT_MESSAGES.notRental });
  });

  it("answers 404 for a line that does not exist", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    for (const id of [missing, "not-an-id"]) {
      expect(
        await updateAdjustment(ctx.db, fx.accountant, id, { amount: 1 }),
      ).toMatchObject({ ok: false, status: 404 });
      expect(
        await deleteAdjustment(ctx.db, fx.accountant, id, {}),
      ).toMatchObject({ ok: false, status: 404 });
    }
  });

  it("writes nothing when an edit changes nothing", async () => {
    await closedNovember();
    const saved = await createAdjustment(ctx.db, fx.accountant, body());
    if (!saved.ok) throw new Error(saved.error);
    const before = (await activityRows(ctx.db)).length;
    const same = await updateAdjustment(ctx.db, fx.accountant, saved.data.id, {
      updatedAt: saved.data.updatedAt,
    });
    expect(same).toEqual({ ok: true, data: saved.data });
    expect((await activityRows(ctx.db)).length).toBe(before);
  });

  it("is refused to sales on edit and delete", async () => {
    await closedNovember();
    const saved = await createAdjustment(ctx.db, fx.accountant, body());
    if (!saved.ok) throw new Error(saved.error);
    const stamp = { updatedAt: saved.data.updatedAt };
    expect(
      await updateAdjustment(ctx.db, fx.sales, saved.data.id, stamp),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      await deleteAdjustment(ctx.db, fx.sales, saved.data.id, stamp),
    ).toMatchObject({ ok: false, status: 403 });
  });
});

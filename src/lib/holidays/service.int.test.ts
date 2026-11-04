// Holidays (rental-billing tasks 4.1, spec rental-holidays): only the
// director writes them, a row never overlaps another, rows of a closed
// period are frozen, a stale edit answers 409, every write logs one row.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { closeMonth } from "@/test/billing";
import { setupSiteFixture, type SiteFixture } from "@/test/site-operations";

import { holidaysOfYear } from "./queries";
import {
  createHoliday,
  deleteHoliday,
  HOLIDAY_SERVICE_MESSAGES,
  updateHoliday,
} from "./service";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: SiteFixture;
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

const tet = {
  name: "Tết Nguyên đán",
  startDate: "2027-02-05",
  endDate: "2027-02-13",
};

async function created(body = tet) {
  const result = await createHoliday(ctx.db, fx.director, body);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

describe("createHoliday", () => {
  it("saves Tết and logs one row", async () => {
    const before = (await activityRows(ctx.db)).length;
    const saved = await created();
    expect(saved).toMatchObject({
      name: "Tết Nguyên đán",
      startDate: "2027-02-05",
    });
    const rows = (await activityRows(ctx.db)).slice(before);
    expect(
      rows.map((row) => [row.action, row.documentType, row.summary]),
    ).toEqual([
      [
        "CREATE",
        "RENTAL_HOLIDAY",
        "Tết Nguyên đán · 05/02/2027 – 13/02/2027 · 9 ngày",
      ],
    ]);
    expect((await holidaysOfYear(ctx.db, 2027)).map((row) => row.name)).toEqual(
      ["Tết Nguyên đán"],
    );
  });

  it("refuses an overlap with the shared day", async () => {
    await created();
    expect(
      await createHoliday(ctx.db, fx.director, {
        name: "Nghỉ bù",
        startDate: "2027-02-13",
        endDate: "2027-02-14",
      }),
    ).toEqual({
      ok: false,
      status: 422,
      field: "startDate",
      error:
        'Ngày 13/02/2027 đã nằm trong "Tết Nguyên đán". Bạn sửa dòng đó hoặc chọn ngày khác.',
    });
  });

  it("refuses an end before the start and a range over 31 days", async () => {
    expect(
      await createHoliday(ctx.db, fx.director, {
        ...tet,
        startDate: "2027-02-13",
        endDate: "2027-02-05",
      }),
    ).toMatchObject({
      ok: false,
      status: 422,
      error: "Ngày kết thúc phải từ ngày bắt đầu trở đi.",
    });
    expect(
      await createHoliday(ctx.db, fx.director, {
        ...tet,
        startDate: "2027-02-01",
        endDate: "2027-03-15",
      }),
    ).toMatchObject({ ok: false, status: 422 });
  });

  it("is the director's: the accountant gets 403 and nothing is logged", async () => {
    const before = (await activityRows(ctx.db)).length;
    expect(await createHoliday(ctx.db, fx.accountant, tet)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await activityRows(ctx.db)).toHaveLength(before);
  });
});

describe("closed periods freeze their holidays (0.2 #22)", () => {
  it("refuses to change a holiday inside a closed period", async () => {
    const saved = await created({
      name: "Nghỉ thử",
      startDate: "2026-11-20",
      endDate: "2026-11-21",
    });
    const closed = await closeMonth(ctx, fx, "2026-11");
    expect(closed.ok).toBe(true);
    const message = HOLIDAY_SERVICE_MESSAGES.closed("2026-11", fx.from.code);
    expect(
      await updateHoliday(ctx.db, fx.director, saved.id, {
        name: "Nghỉ thử",
        startDate: "2026-11-19",
        endDate: "2026-11-21",
        updatedAt: saved.updatedAt,
      }),
    ).toEqual({ ok: false, status: 409, error: message });
    expect(
      await deleteHoliday(ctx.db, fx.director, saved.id, {
        updatedAt: saved.updatedAt,
      }),
    ).toEqual({ ok: false, status: 409, error: message });
    expect(
      await createHoliday(ctx.db, fx.director, {
        name: "Sớm",
        startDate: "2026-11-25",
        endDate: "2026-11-25",
      }),
    ).toEqual({ ok: false, status: 409, error: message });
  });

  it("takes a holiday after the latest closed period", async () => {
    expect((await closeMonth(ctx, fx, "2026-11")).ok).toBe(true);
    expect(
      (
        await createHoliday(ctx.db, fx.director, {
          name: "Giỗ Tổ Hùng Vương",
          startDate: "2027-04-16",
          endDate: "2027-04-16",
        })
      ).ok,
    ).toBe(true);
  });
});

describe("updateHoliday and deleteHoliday", () => {
  it("logs the changed dates", async () => {
    const saved = await created();
    const result = await updateHoliday(ctx.db, fx.director, saved.id, {
      name: "Tết Nguyên đán",
      startDate: "2027-02-06",
      endDate: "2027-02-14",
      updatedAt: saved.updatedAt,
    });
    expect(result.ok).toBe(true);
    const last = (await activityRows(ctx.db)).at(-1);
    expect(last?.action).toBe("UPDATE");
    expect(last?.changes).toEqual([
      {
        field: "startDate",
        label: "Từ ngày",
        before: "05/02/2027",
        after: "06/02/2027",
      },
      {
        field: "endDate",
        label: "Đến ngày",
        before: "13/02/2027",
        after: "14/02/2027",
      },
    ]);
  });

  it("answers 409 to a stale edit", async () => {
    const saved = await created();
    expect(
      await updateHoliday(ctx.db, fx.director, saved.id, {
        ...tet,
        endDate: "2027-02-12",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: HOLIDAY_SERVICE_MESSAGES.stale,
    });
  });

  it("deletes and logs one row", async () => {
    const saved = await created();
    const before = (await activityRows(ctx.db)).length;
    expect(
      (
        await deleteHoliday(ctx.db, fx.director, saved.id, {
          updatedAt: saved.updatedAt,
        })
      ).ok,
    ).toBe(true);
    const rows = (await activityRows(ctx.db)).slice(before);
    expect(rows.map((row) => row.action)).toEqual(["DELETE"]);
    expect(await holidaysOfYear(ctx.db, 2027)).toEqual([]);
  });
});

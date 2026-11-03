// D8 commands (compensations spec "Dòng chưa có giá đền", "Giảm trừ khi
// duyệt", "Trạng thái phiếu đền bù", "Duyệt khi nhà thầu đang nợ quá hạn",
// "Số liệu phiếu đã duyệt cho công nợ", "Duyệt cùng lúc chỉ một lần",
// "Quyền với phiếu đền bù", "Nhật ký phiếu đền bù"; tasks 3.5, 3.7, 3.8).
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "@/db/client";
import { compensationNote, compensationNoteLine } from "@/db/schema";
import { activityRows } from "@/test/activity";
import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import {
  returnOf,
  setupReturnFixture,
  type ReturnFixture,
} from "@/test/returns";
import { setScrapPrice } from "@/lib/receiving/scrap-price";

import {
  compensationDetail,
  compensationList,
  contractCompensations,
} from "./queries";
import {
  approveCompensation,
  rejectCompensation,
  updateCompensation,
} from "./service";

const debt = { amount: 0, days: 0 };
vi.mock("@/lib/contracts/overdue", () => ({
  overdueDebt: async () => ({ amount: debt.amount, days: debt.days }),
}));

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

/** Approval day: Friday 06/11/2026 in Vietnam. */
const APPROVE_NOW = new Date("2026-11-06T03:00:00Z");

let fx: ReturnFixture;
let noteId = "";
let version = "";
beforeEach(async () => {
  debt.amount = 0;
  debt.days = 0;
  fx = await setupReturnFixture(ctx);
  await setScrapPrice(ctx.db, fx.director, { pricePerKg: 7_500 });
  // 15 Chờ sửa × 60.000 + 3 Phế liệu × 350.000 + 2 Mất × 350.000
  // + 5 GG-CH Chờ sửa × 15.000 = 2.725.000 ₫.
  const posted = await returnOf(ctx, fx, {
    "GG-K17": [80, 15, 3, 2],
    "GG-CH": [0, 5, 0, 0],
  });
  if (!posted.ok) throw new Error(posted.error);
  const [note] = await ctx.db.select().from(compensationNote);
  noteId = note?.id ?? "";
  version = note?.updatedAt.toISOString() ?? "";
});

/** Activity rows of compensation notes only. */
const logs = async () =>
  (await activityRows(ctx.db)).filter(
    (entry) => entry.documentType === "COMPENSATION_NOTE",
  );

async function row() {
  const [note] = await ctx.db
    .select()
    .from(compensationNote)
    .where(eq(compensationNote.id, noteId));
  return note;
}

const approve = (body: Parameters<typeof approveCompensation>[3] = {}) =>
  approveCompensation(
    ctx.db,
    fx.director,
    noteId,
    { updatedAt: version, ...body },
    { now: APPROVE_NOW },
  );

async function clearPrice(code: string, kind: string) {
  // As if the contract had no price: past the trigger, as the owner.
  await getAdminDatabase().transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx
      .update(compensationNoteLine)
      .set({ unitPrice: null, contractPrice: null })
      .where(
        and(
          eq(compensationNoteLine.noteId, noteId),
          eq(compensationNoteLine.itemId, fx.item(code)),
          eq(compensationNoteLine.kind, kind),
        ),
      );
  });
}

describe("approveCompensation", () => {
  it("stores the amount due, the approval day and the due date", async () => {
    const result = await approve({
      discountAmount: 225_000,
      discountReason: "Khách quen, bớt phần chéo cong",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { status: "APPROVED", amountDue: 2_500_000, dueDate: "2026-12-06" },
    });
    expect(await row()).toMatchObject({
      status: "APPROVED",
      amountDue: 2_500_000,
      approvedDate: "2026-11-06",
      dueDate: "2026-12-06",
      discountAmount: 225_000,
      approvedBy: fx.director.id,
    });
    const [log] = (await logs()).filter((entry) => entry.action === "APPROVE");
    expect(log).toMatchObject({
      summary: "2.500.000 ₫ (giảm 225.000 ₫: Khách quen, bớt phần chéo cong)",
      flags: expect.arrayContaining(["ANOMALY"]),
    });
  });

  it("refuses a discount without its reason, or above the total", async () => {
    expect(await approve({ discountAmount: 225_000 })).toMatchObject({
      ok: false,
      error: "Bạn cần ghi lý do giảm trừ.",
    });
    expect(
      await approve({ discountAmount: 3_000_000, discountReason: "x" }),
    ).toMatchObject({
      ok: false,
      error: "Số tiền giảm (3.000.000 ₫) lớn hơn tiền đền bù (2.725.000 ₫).",
    });
    expect((await row())?.status).toBe("PENDING");
  });

  it("refuses a line without a price, then takes the typed price", async () => {
    await clearPrice("GG-CH", "DAMAGED");
    expect(await approve()).toMatchObject({
      ok: false,
      error:
        "GG-CH Chờ sửa chưa có giá đền trong hợp đồng. Nhập đơn giá trước khi duyệt.",
    });
    const saved = await updateCompensation(ctx.db, fx.director, noteId, {
      updatedAt: version,
      prices: [
        { itemId: fx.item("GG-CH"), kind: "DAMAGED", unitPrice: 20_000 },
      ],
    });
    expect(saved.ok).toBe(true);
    const updates = (await logs()).filter((entry) => entry.action === "UPDATE");
    expect(updates[0]?.summary).toBe("đơn giá GG-CH Chờ sửa: trống → 20.000 ₫");
    const done = await approveCompensation(ctx.db, fx.director, noteId, {
      updatedAt: saved.ok ? saved.data.updatedAt : "",
    });
    expect(done).toMatchObject({ ok: true, data: { amountDue: 2_750_000 } });
  });

  it("refuses to change a price the contract already set", async () => {
    expect(
      await updateCompensation(ctx.db, fx.director, noteId, {
        updatedAt: version,
        prices: [{ itemId: fx.item("GG-K17"), kind: "LOST", unitPrice: 1 }],
      }),
    ).toMatchObject({
      ok: false,
      error: "GG-K17 Mất đã có giá trong hợp đồng. Muốn bớt thì dùng giảm trừ.",
    });
  });

  it("asks for a reason while the customer is overdue", async () => {
    debt.amount = 96_000_000;
    debt.days = 7;
    expect(await approve()).toMatchObject({
      ok: false,
      error:
        "Nhà thầu đang nợ quá hạn 96.000.000 ₫ (7 ngày). Bạn cần ghi lý do duyệt.",
    });
    const done = await approve({ approvalReason: "Khách hứa trả tuần sau" });
    expect(done.ok).toBe(true);
    expect((await row())?.approvalReason).toBe("Khách hứa trả tuần sau");
  });

  it("is final: a second edit or approval answers 409", async () => {
    await approve();
    expect(await approve()).toMatchObject({
      ok: false,
      status: 409,
      error: "Phiếu đền bù đã duyệt, không sửa được nữa.",
    });
    expect(
      await updateCompensation(ctx.db, fx.director, noteId, {
        updatedAt: version,
        discountAmount: 1,
        discountReason: "x",
      }),
    ).toMatchObject({ ok: false, status: 409 });
  });

  it("answers 409 to a stale screen", async () => {
    const first = await updateCompensation(ctx.db, fx.director, noteId, {
      updatedAt: version,
      discountAmount: 25_000,
      discountReason: "Bớt lẻ",
    });
    expect(first.ok).toBe(true);
    expect(
      await updateCompensation(ctx.db, fx.director, noteId, {
        updatedAt: version,
        discountAmount: 50_000,
        discountReason: "Bớt lẻ",
      }),
    ).toMatchObject({
      ok: false,
      status: 409,
      error: "Phiếu vừa được sửa ở nơi khác. Tải lại để xem bản mới.",
    });
  });

  it("approves once when two tabs approve at the same time", async () => {
    const results = await Promise.all([
      approve(),
      approveCompensation(other.db, fx.director, noteId, {
        updatedAt: version,
      }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      (await logs()).filter((entry) => entry.action === "APPROVE"),
    ).toHaveLength(1);
  });

  it("is for the director only", async () => {
    expect(
      await approveCompensation(ctx.db, fx.accountant, noteId, {
        updatedAt: version,
      }),
    ).toMatchObject({ ok: false, status: 403 });
    expect((await row())?.status).toBe("PENDING");
  });

  it("writes nothing for a save that changes nothing", async () => {
    await updateCompensation(ctx.db, fx.director, noteId, {
      updatedAt: version,
    });
    expect(
      (await logs()).filter((entry) => entry.action === "UPDATE"),
    ).toHaveLength(0);
  });
});

describe("rejectCompensation", () => {
  it("needs a reason and leaves nothing owed", async () => {
    expect(
      await rejectCompensation(ctx.db, fx.director, noteId, {
        updatedAt: version,
        reason: "  ",
      }),
    ).toMatchObject({ ok: false, error: "Bạn cần ghi lý do từ chối." });
    const done = await rejectCompensation(ctx.db, fx.director, noteId, {
      updatedAt: version,
      reason: "Hàng hỏng do bãi xếp, không phải lỗi khách",
    });
    expect(done).toMatchObject({ ok: true, data: { status: "REJECTED" } });
    expect(await row()).toMatchObject({ status: "REJECTED", amountDue: null });
    const [log] = (await logs()).filter((entry) => entry.action === "REJECT");
    expect(log?.summary).toBe(
      'Không thu 2.725.000 ₫ · Lý do: "Hàng hỏng do bãi xếp, không phải lỗi khách"',
    );
  });
});

describe("compensation reads", () => {
  it("lists pending notes for the accountant, not for the storekeeper", async () => {
    const list = await compensationList(ctx.db, fx.accountant, "PENDING");
    expect(list).toMatchObject({
      ok: true,
      data: [
        {
          code: "ĐB-2026-001",
          returnCode: "PTH-2026-001",
          amount: 2_725_000,
          status: "PENDING",
        },
      ],
    });
    expect(
      await compensationList(ctx.db, fx.warehouse, "PENDING"),
    ).toMatchObject({ ok: false, status: 403 });
    await approve();
    expect(
      await compensationList(ctx.db, fx.accountant, "PENDING"),
    ).toMatchObject({ ok: true, data: [] });
    expect(await contractCompensations(ctx.db, fx.deal.id)).toHaveLength(1);
  });

  it("gives D8 its lines and lets only the director approve", async () => {
    const view = await compensationDetail(ctx.db, fx.accountant, "ĐB-2026-001");
    expect(view).toMatchObject({
      ok: true,
      data: {
        total: 2_725_000,
        canApprove: false,
        paymentTermsDays: 30,
        returnNote: { code: "PTH-2026-001", vehiclePlate: "29C-456.78" },
      },
    });
    const director = await compensationDetail(ctx.db, fx.director, noteId);
    expect(director.ok && director.data.canApprove).toBe(true);
    expect(
      director.ok &&
        director.data.lines.map((line) => [line.itemCode, line.kind]),
    ).toEqual([
      ["GG-CH", "DAMAGED"],
      ["GG-K17", "DAMAGED"],
      ["GG-K17", "SCRAPPED"],
      ["GG-K17", "LOST"],
    ]);
  });
});

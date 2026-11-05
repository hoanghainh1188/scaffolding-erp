// Receipts (receivables tasks 4.1–4.3; spec customer-receipts): earliest due
// first, named debts, overpayment kept as prepayment, deposits, cancelling
// with its reason, and one activity row per command.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { receiptAllocation } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import {
  closedPeriod,
  requestId,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";

import { readLedger } from "./balances";
import { settleCredits } from "./credits";
import { cancelReceipt, previewReceipt, recordReceipt } from "./receipts";

const ctx = createTestContext();
afterAll(ctx.close);

/** 05/11/2026 10:00 in Vietnam. */
const NOV_5 = new Date("2026-11-05T03:00:00Z");
const TODAY = "2026-11-05" as BusinessDate;

let fx: ReceivableFixture;
beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
});

const pay = (amount: number, extra: Record<string, unknown> = {}) =>
  recordReceipt(
    ctx.db,
    fx.accountant,
    {
      requestId: requestId(),
      customerId: fx.customerId,
      kind: "PAYMENT",
      amount,
      method: "TRANSFER",
      receivedDate: "2026-11-05",
      ...extra,
    },
    { now: NOV_5 },
  );

async function mustPay(amount: number, extra: Record<string, unknown> = {}) {
  const saved = await pay(amount, extra);
  if (!saved.ok) throw new Error(saved.error);
  return saved.data;
}

const ledger = () => readLedger(ctx.db, fx.customerId, TODAY);

const left = async () =>
  Object.fromEntries(
    (await ledger()).debts.map((debt) => [debt.label, debt.remaining]),
  );

/** Three periods: Kỳ 08 (due 15/09), Kỳ 09 (due 15/10), Kỳ 10 (due 15/11). */
async function threePeriods() {
  const aug = await closedPeriod(ctx, fx, "2026-08", 24_600_000);
  const sep = await closedPeriod(ctx, fx, "2026-09", 23_100_000);
  const oct = await closedPeriod(ctx, fx, "2026-10", 22_800_000);
  return { aug, sep, oct };
}

describe("recording a payment", () => {
  it("settles the earliest due first and gives the next code", async () => {
    await threePeriods();
    const first = await mustPay(30_000_000);
    expect(first.code).toBe("PT-2026-001");
    expect(first.lines.map((line) => [line.label, line.amount])).toEqual([
      ["Kỳ 08/2026 " + fx.deal.code, 24_600_000],
      ["Kỳ 09/2026 " + fx.deal.code, 5_400_000],
    ]);
    expect(first.owedAfter).toBe(70_500_000 - 30_000_000);
    expect(await left()).toEqual({
      "Kỳ 08/2026": 0,
      "Kỳ 09/2026": 17_700_000,
      "Kỳ 10/2026": 22_800_000,
    });
    expect((await mustPay(1)).code).toBe("PT-2026-002");
  });

  it("pays the named debt first, then spreads the rest", async () => {
    const { oct } = await threePeriods();
    const saved = await mustPay(25_000_000, {
      allocations: [{ debtKey: `BILLING:${oct.id}`, amount: 22_800_000 }],
    });
    expect(saved.lines.map((line) => [line.mode, line.amount])).toEqual([
      ["MANUAL", 22_800_000],
      ["AUTO", 2_200_000],
    ]);
    expect((await left())["Kỳ 10/2026"]).toBe(0);
  });

  it("refuses naming more than is left, with nothing written", async () => {
    const { oct } = await threePeriods();
    const refused = await pay(30_000_000, {
      allocations: [{ debtKey: `BILLING:${oct.id}`, amount: 30_000_000 }],
    });
    expect(refused).toMatchObject({
      ok: false,
      status: 422,
      error: `Kỳ 10/2026 ${fx.deal.code} chỉ còn 22.800.000 ₫.`,
    });
    expect(await ctx.db.select().from(receiptAllocation)).toEqual([]);
    expect(await activityRows(ctx.db)).toSatisfy(
      (rows: { documentType: string | null }[]) =>
        rows.every((row) => row.documentType !== "RECEIPT"),
    );
  });

  it("answers 409 when another receipt settled the named debt meanwhile", async () => {
    const { aug } = await threePeriods();
    await mustPay(24_600_000);
    const raced = await pay(24_600_000, {
      allocations: [
        { debtKey: `BILLING:${aug.id}`, amount: 24_600_000, seen: 24_600_000 },
      ],
    });
    expect(raced).toMatchObject({
      ok: false,
      status: 409,
      error: `Kỳ 08/2026 ${fx.deal.code} đã được trừ đủ bởi phiếu khác. Bạn xem lại rồi ghi.`,
    });
  });

  it("keeps an overpayment as prepayment", async () => {
    await closedPeriod(ctx, fx, "2026-10", 12_000_000);
    const saved = await mustPay(17_000_000);
    expect(saved.prepaid).toBe(5_000_000);
    expect((await ledger()).prepaid).toBe(5_000_000);
  });

  it("validates the form", async () => {
    expect(await pay(0)).toMatchObject({
      status: 422,
      error: "Số tiền phải lớn hơn 0 ₫.",
    });
    expect(await pay(1_000, { receivedDate: "2026-11-06" })).toMatchObject({
      status: 422,
      field: "receivedDate",
      error: "Ngày thu không được sau hôm nay (05/11/2026).",
    });
    expect(
      await recordReceipt(ctx.db, fx.sales, {
        requestId: requestId(),
        customerId: fx.customerId,
        kind: "PAYMENT",
        amount: 1,
        method: "CASH",
        receivedDate: "2026-11-05",
      }),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("makes one receipt for two submits of one form", async () => {
    const id = requestId();
    const [a, b] = await Promise.all([
      pay(1_000, { requestId: id }),
      pay(1_000, { requestId: id }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect((await ledger()).receipts).toHaveLength(1);
    const again = await mustPay(1_000, { requestId: id });
    expect(again.replayed).toBe(true);
    expect(await pay(2_000, { requestId: id })).toMatchObject({
      ok: false,
      status: 409,
      error:
        "Phiếu này đã được gửi với số liệu khác. Bạn tải lại trang rồi ghi lại.",
    });
  });

  it("logs one Tạo row with what was settled", async () => {
    await closedPeriod(ctx, fx, "2026-10", 12_000_000);
    await mustPay(17_000_000);
    const rows = (await activityRows(ctx.db)).filter(
      (row) => row.documentType === "RECEIPT",
    );
    expect(
      rows.map((row) => [row.action, row.documentCode, row.summary]),
    ).toEqual([
      [
        "CREATE",
        "PT-2026-001",
        `Cty TNHH Xây dựng Minh Phát · Trả nợ 17.000.000 ₫ · Kỳ 10/2026 ${fx.deal.code} 12.000.000 ₫, trả trước 5.000.000 ₫`,
      ],
    ]);
  });

  it("previews without writing", async () => {
    await threePeriods();
    const plan = await previewReceipt(
      ctx.db,
      fx.accountant,
      {
        customerId: fx.customerId,
        kind: "PAYMENT",
        amount: 30_000_000,
        method: "TRANSFER",
        receivedDate: "2026-11-05",
      },
      { now: NOV_5 },
    );
    expect(plan).toMatchObject({ ok: true, data: { owedAfter: 40_500_000 } });
    expect((await ledger()).receipts).toEqual([]);
  });
});

describe("deposits", () => {
  const deposit = (amount: number) =>
    recordReceipt(
      ctx.db,
      fx.accountant,
      {
        requestId: requestId(),
        customerId: fx.customerId,
        kind: "DEPOSIT",
        contractId: fx.deal.id,
        amount,
        method: "CASH",
        receivedDate: "2026-11-05",
      },
      { now: NOV_5 },
    );

  it("keeps a deposit apart from the debts", async () => {
    await closedPeriod(ctx, fx, "2026-10", 12_000_000);
    const saved = await deposit(30_000_000);
    expect(saved.ok).toBe(true);
    const book = await ledger();
    expect(book.owed).toBe(12_000_000);
    expect(book.prepaid).toBe(0);
    expect(book.deposits.get(fx.deal.id)?.received).toBe(30_000_000);
  });

  it("refuses more than the agreed cash deposit", async () => {
    // d5Rental agrees 50.000.000 ₫ in cash.
    await deposit(30_000_000);
    expect(await deposit(25_000_000)).toMatchObject({
      ok: false,
      status: 422,
      error: `Hợp đồng ${fx.deal.code} còn nhận cọc tối đa 20.000.000 ₫ (thỏa thuận 50.000.000 ₫, đã nhận 30.000.000 ₫).`,
    });
  });
});

describe("cancelling", () => {
  it("reopens what the receipt settled and logs the reason", async () => {
    await threePeriods();
    const saved = await mustPay(30_000_000);
    const done = await cancelReceipt(
      ctx.db,
      fx.accountant,
      saved.id,
      { reason: "Ghi nhầm nhà thầu" },
      { now: NOV_5 },
    );
    expect(done.ok).toBe(true);
    expect(await left()).toEqual({
      "Kỳ 08/2026": 24_600_000,
      "Kỳ 09/2026": 23_100_000,
      "Kỳ 10/2026": 22_800_000,
    });
    const book = await ledger();
    expect(book.debts.find((d) => d.label === "Kỳ 09/2026")?.status.label).toBe(
      "Quá hạn 21 ngày",
    );
    expect(book.receipts[0]?.cancelled?.reason).toBe("Ghi nhầm nhà thầu");
    const rows = (await activityRows(ctx.db)).filter(
      (row) => row.action === "CANCEL",
    );
    expect(rows[0]?.summary).toBe(
      `PT-2026-001 · 30.000.000 ₫ · mở lại Kỳ 08/2026 ${fx.deal.code} 24.600.000 ₫, Kỳ 09/2026 ${fx.deal.code} 5.400.000 ₫ · lý do: Ghi nhầm nhà thầu`,
    );
  });

  it("reopens what its prepayment settled later", async () => {
    await closedPeriod(ctx, fx, "2026-09", 12_000_000);
    const saved = await mustPay(17_000_000);
    await ctx.db.transaction(async (tx) => {
      await closedPeriod({ ...ctx, db: tx as never }, fx, "2026-10", 8_000_000);
      expect(await settleCredits(tx, fx.customerId, fx.accountant, TODAY)).toBe(
        5_000_000,
      );
    });
    expect((await left())["Kỳ 10/2026"]).toBe(3_000_000);
    await cancelReceipt(ctx.db, fx.accountant, saved.id, { reason: "Sai" });
    expect(await left()).toEqual({
      "Kỳ 09/2026": 12_000_000,
      "Kỳ 10/2026": 8_000_000,
    });
    expect((await ledger()).prepaid).toBe(0);
  });

  it("lets the prepayment left settle the reopened debt", async () => {
    await closedPeriod(ctx, fx, "2026-10", 3_000_000);
    const wrong = await mustPay(3_000_000);
    await mustPay(2_000_000);
    expect((await ledger()).prepaid).toBe(2_000_000);
    const done = await cancelReceipt(ctx.db, fx.accountant, wrong.id, {
      reason: "Trùng phiếu",
    });
    expect(done).toMatchObject({ ok: true, data: { resettled: 2_000_000 } });
    expect((await left())["Kỳ 10/2026"]).toBe(1_000_000);
    expect((await ledger()).prepaid).toBe(0);
  });

  it("needs a reason and cancels once", async () => {
    const saved = await mustPay(1_000);
    expect(
      await cancelReceipt(ctx.db, fx.accountant, saved.id, { reason: " " }),
    ).toMatchObject({ status: 422, error: "Bạn ghi lý do hủy phiếu thu." });
    await cancelReceipt(ctx.db, fx.director, saved.id, { reason: "Trùng" });
    const again = await cancelReceipt(ctx.db, fx.accountant, saved.id, {
      reason: "Trùng",
    });
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(again.ok ? "" : again.error).toContain(
      "Phiếu PT-2026-001 đã hủy lúc",
    );
    expect(again.ok ? "" : again.error).toContain("bởi Minh Anh.");
  });
});

// Settling a contract (receivables tasks 5.1–5.3; spec contract-settlement):
// the conditions, the deposit set off against the contract's own debts
// down to the đồng, the refund, and what a closed contract refuses.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { contract, receiptAllocation } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { createAdjustment } from "@/lib/billing/adjustments";
import { createBuyBack } from "@/lib/buy-backs/service";
import { createAmendment } from "@/lib/contracts/amendments";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { approvedRental, planned } from "@/test/deliveries";
import {
  closedPeriod,
  deliveredSale,
  requestId,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";
import { returnOf } from "@/test/returns";
import { DEC_4, DEC_4_DATE, settleReadyContract } from "@/test/settlement";

import { readLedger } from "./balances";
import { cancelReceipt, recordReceipt } from "./receipts";
import { settleContract, settlementView } from "./settlement";

const ctx = createTestContext();
afterAll(ctx.close);

const NOV_5 = new Date("2026-11-05T03:00:00Z");

let fx: ReceivableFixture;
beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
});

async function deposit(amount: number) {
  const saved = await recordReceipt(
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
  if (!saved.ok) throw new Error(saved.error);
  return saved.data;
}

const settle = (body: Record<string, unknown> = {}, actor = fx.accountant) =>
  settleContract(
    ctx.db,
    actor,
    fx.deal.id,
    { refundDate: "2026-12-04", refundMethod: "TRANSFER", ...body },
    { now: DEC_4 },
  );

const ledger = () => readLedger(ctx.db, fx.customerId, DEC_4_DATE);

const statusOf = async (id: string) =>
  (
    await ctx.db
      .select({ status: contract.status })
      .from(contract)
      .where(eq(contract.id, id))
  )[0]?.status;

describe("conditions", () => {
  it("refuses while goods are on site", async () => {
    const result = await settle();
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(result.ok ? "" : result.error).toMatch(
      /^Công trình còn .*120 GG-K17.* của hợp đồng\. Bạn thu hồi hết hàng rồi thanh lý\.$/,
    );
    expect(await statusOf(fx.deal.id)).toBe("ACTIVE");
  });

  it("refuses while the last month is not closed", async () => {
    await returnOf(ctx, fx, {
      "GG-K17": [120, 0, 0, 0],
      "GG-CH": [260, 0, 0, 0],
      "GG-M16": [60, 0, 0, 0],
    });
    const view = await settlementView(
      ctx.db,
      fx.deal.id,
      "2026-11-28" as BusinessDate,
    );
    expect(view?.checks.map((check) => [check.key, check.ok])).toEqual([
      ["ON_SITE", true],
      ["RENT_CLOSED", false],
      ["NOTHING_PENDING", true],
    ]);
    expect(view?.checks[1]?.detail).toBe(
      "Kỳ 11/2026 chưa chốt (chốt được từ 01/12/2026)",
    );
    expect(view?.ready).toBe(false);
  });

  it("refuses a pending compensation note", async () => {
    await returnOf(ctx, fx, {
      "GG-K17": [118, 0, 0, 2],
      "GG-CH": [260, 0, 0, 0],
      "GG-M16": [60, 0, 0, 0],
    });
    const view = await settlementView(ctx.db, fx.deal.id, DEC_4_DATE);
    const pending = view?.checks.find((c) => c.key === "NOTHING_PENDING");
    expect(pending?.ok).toBe(false);
    expect(pending?.refusal).toMatch(
      /^Còn phiếu đền bù ĐB-\d{4}-\d{3} Chờ duyệt\. Giám đốc duyệt hoặc từ chối trước rồi thanh lý\.$/,
    );
  });

  it("refuses an adjustment not closed yet and a pending amendment", async () => {
    await settleReadyContract(ctx, fx);
    const adjusted = await createAdjustment(ctx.db, fx.accountant, {
      contractId: fx.deal.id,
      month: "2026-12",
      refMonth: "2026-11",
      amount: 93_000,
      reason: "Thiếu ngày",
    });
    expect(adjusted.ok).toBe(true);
    let view = await settlementView(ctx.db, fx.deal.id, DEC_4_DATE);
    expect(view?.checks[1]?.detail).toBe("Kỳ 12/2026 có điều chỉnh chưa chốt");
    fx = { ...fx };
    const amended = await createAmendment(ctx.db, fx.sales, fx.deal.id, {
      today: DEC_4_DATE,
    });
    expect(amended.ok).toBe(true);
    view = await settlementView(ctx.db, fx.deal.id, DEC_4_DATE);
    expect(view?.checks[2]?.refusal).toBe(
      `Còn phụ lục ${fx.deal.code}/01 Chờ duyệt. Bạn duyệt hoặc hủy phụ lục trước rồi thanh lý.`,
    );
  });

  it("refuses an approved contract never delivered and a pending batch", async () => {
    const fresh = await approvedRental(ctx, fx);
    const refused = await settleContract(
      ctx.db,
      fx.accountant,
      fresh.id,
      {},
      { now: DEC_4 },
    );
    expect(refused).toMatchObject({
      ok: false,
      error:
        "Chỉ hợp đồng Đang thực hiện mới thanh lý được. Hợp đồng chưa giao hàng thì hủy.",
    });
    await settleReadyContract(ctx, fx);
    const batch = await planned(ctx, fx, {
      contractId: fx.deal.id,
      lines: [{ itemId: fx.item("PK-KU"), quantity: "10" }],
    });
    const blocked = await settle();
    expect(blocked.ok ? "" : blocked.error).toBe(
      `Còn phiếu xuất ${batch.code} chưa xong. Bạn hủy hoặc ghi sổ phiếu đó trước rồi thanh lý.`,
    );
  });

  it("refuses a pending buy-back note", async () => {
    const made = await createBuyBack(
      ctx.db,
      fx.sales,
      {
        contractId: fx.deal.id,
        reason: "Khách giữ lại",
        lines: [{ itemId: fx.item("GG-CH"), quantity: "1", unitPrice: 1 }],
      },
      { now: NOV_5 },
    );
    expect(made.ok).toBe(true);
    const view = await settlementView(ctx.db, fx.deal.id, DEC_4_DATE);
    expect(view?.checks[2]?.refusal).toMatch(
      /^Còn phiếu mua lại MLA-\d{4}-\d{3} Chờ duyệt\./,
    );
  });

  it("settles a sale contract with its own conditions (0.2 #87)", async () => {
    const sale = await deliveredSale(ctx, fx, { customerId: fx.customerId });
    const view = await settlementView(ctx.db, sale.contractId, DEC_4_DATE);
    expect(view?.checks.map((check) => check.key)).toEqual(["NOTHING_PENDING"]);
    expect(view?.ready).toBe(true);
    const done = await settleContract(
      ctx.db,
      fx.accountant,
      sale.contractId,
      { expectedRefund: 0 },
      { now: DEC_4 },
    );
    expect(done).toMatchObject({
      ok: true,
      data: { refund: 0, stillOwed: 17_507_000 },
    });
  });

  it("is for the accountant and the director only", async () => {
    await settleReadyContract(ctx, fx);
    expect(await settle({}, fx.sales)).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe("setting the deposit off", () => {
  it("refunds what the debts of the contract leave, to the đồng", async () => {
    await deposit(50_000_000);
    await closedPeriod(ctx, fx, "2026-10", 18_550_000);
    const { novemberTotal } = await settleReadyContract(ctx, fx);
    const view = await settlementView(ctx.db, fx.deal.id, DEC_4_DATE);
    const refund = 50_000_000 - 18_550_000 - novemberTotal;
    expect(view?.ready).toBe(true);
    expect(view?.plan).toMatchObject({
      deposit: 50_000_000,
      offset: 18_550_000 + novemberTotal,
      refund,
    });
    const done = await settle({ expectedRefund: refund });
    expect(done).toMatchObject({
      ok: true,
      data: { refund, stillOwed: 0 },
    });
    expect(await statusOf(fx.deal.id)).toBe("CLOSED");
    const book = await ledger();
    expect(book.owed).toBe(0);
    expect(
      (await ctx.db.select().from(receiptAllocation)).every(
        (row) => row.mode === "DEPOSIT" && row.settlementId !== null,
      ),
    ).toBe(true);
    const log = (await activityRows(ctx.db)).find(
      (row) => row.action === "SETTLE",
    );
    expect(log?.summary).toBe(
      `${fx.deal.code} · cọc 50.000.000 ₫ · cấn trừ ${new Intl.NumberFormat("vi-VN").format(18_550_000 + novemberTotal)} ₫ · hoàn lại ${new Intl.NumberFormat("vi-VN").format(refund)} ₫`,
    );
  });

  it("leaves the rest owed when the deposit is short", async () => {
    await deposit(20_000_000);
    await closedPeriod(ctx, fx, "2026-10", 18_550_000);
    const { novemberTotal } = await settleReadyContract(ctx, fx);
    const done = await settle({ refundDate: null, refundMethod: null });
    expect(done).toMatchObject({
      ok: true,
      data: { refund: 0, stillOwed: novemberTotal - 1_450_000 },
    });
    const book = await ledger();
    expect(book.owed).toBe(novemberTotal - 1_450_000);
  });

  it("does not touch debts of another contract", async () => {
    const other = await approvedRental(ctx, fx);
    await closedPeriod(ctx, fx, "2026-10", 14_500_000, {
      contractId: other.id,
    });
    await deposit(50_000_000);
    const { novemberTotal } = await settleReadyContract(ctx, fx);
    const done = await settle();
    expect(done).toMatchObject({
      ok: true,
      data: { refund: 50_000_000 - novemberTotal },
    });
    const book = await ledger();
    expect(
      book.debts.find((debt) => debt.contractId === other.id)?.remaining,
    ).toBe(14_500_000);
  });

  it("settles without a deposit and needs no refund date", async () => {
    const { novemberTotal } = await settleReadyContract(ctx, fx);
    const done = await settle({ refundDate: null, refundMethod: null });
    expect(done).toMatchObject({
      ok: true,
      data: { deposit: 0, offset: 0, refund: 0, stillOwed: novemberTotal },
    });
  });

  it("needs the refund date and method when something is refunded", async () => {
    await deposit(50_000_000);
    await settleReadyContract(ctx, fx);
    expect(await settle({ refundDate: null })).toMatchObject({
      ok: false,
      status: 422,
      error: "Bạn nhập ngày hoàn cọc và hình thức.",
    });
  });

  it("answers 409 when the refund changed since it was shown", async () => {
    await deposit(50_000_000);
    const { novemberTotal } = await settleReadyContract(ctx, fx);
    const shown = 50_000_000 - novemberTotal;
    const result = await settle({ expectedRefund: shown - 1 });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(result.ok ? "" : result.error).toContain("Số hoàn cọc đã đổi");
  });

  it("settles once and keeps the deposit receipt from being cancelled", async () => {
    const paid = await deposit(50_000_000);
    await settleReadyContract(ctx, fx);
    expect((await settle()).ok).toBe(true);
    const again = await settle();
    expect(again.ok ? "" : again.error).toMatch(
      /^Hợp đồng đã thanh lý lúc .* bởi Thu Hà\.$/,
    );
    const cancel = await cancelReceipt(ctx.db, fx.accountant, paid.id, {
      reason: "Thử",
    });
    expect(cancel).toMatchObject({
      ok: false,
      status: 409,
      error: `Phiếu ${paid.code} là cọc đã cấn trừ khi thanh lý ${fx.deal.code} nên không hủy được.`,
    });
  });
});

// A settled contract is locked (receivables task 5.3; spec
// contract-settlement "Hợp đồng đã thanh lý bị khóa"): no delivery, return,
// transfer, buy-back, amendment, edit, cancel, deposit or rent adjustment;
// what it still owes is paid like any debt.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createAdjustment } from "@/lib/billing/adjustments";
import { createBuyBack } from "@/lib/buy-backs/service";
import { createAmendment } from "@/lib/contracts/amendments";
import { cancelContract } from "@/lib/contracts/approval";
import { createDelivery } from "@/lib/deliveries/service";
import { createSiteTransfer } from "@/lib/site-transfers/service";
import { createTestContext } from "@/test/auth";
import { approvedRental } from "@/test/deliveries";
import {
  requestId,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";
import { returnOf } from "@/test/returns";
import { DEC_4, DEC_4_DATE, settleReadyContract } from "@/test/settlement";

import { readLedger } from "./balances";
import { recordReceipt } from "./receipts";
import { settleContract } from "./settlement";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ReceivableFixture;
let novemberTotal = 0;

beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
  ({ novemberTotal } = await settleReadyContract(ctx, fx));
  const done = await settleContract(
    ctx.db,
    fx.accountant,
    fx.deal.id,
    {},
    { now: DEC_4 },
  );
  if (!done.ok) throw new Error(done.error);
});

const refusal = (result: { ok: boolean; error?: string }) =>
  result.ok ? "" : (result.error ?? "");

describe("a settled contract", () => {
  it("takes no delivery", async () => {
    const result = await createDelivery(
      ctx.db,
      fx.sales,
      {
        contractId: fx.deal.id,
        lines: [{ itemId: fx.item("PK-KU"), quantity: "10" }],
      },
      { now: DEC_4 },
    );
    expect(refusal(result)).toBe(
      "Hợp đồng đã thanh lý nên không xuất hàng được.",
    );
  });

  it("takes no return, transfer or buy-back", async () => {
    expect((await returnOf(ctx, fx, { "GG-K17": [1, 0, 0, 0] })).ok).toBe(
      false,
    );
    const target = await approvedRental(ctx, fx);
    const transfer = await createSiteTransfer(
      ctx.db,
      fx.sales,
      {
        fromContractId: fx.deal.id,
        toContractId: target.id,
        lines: [{ itemId: fx.item("GG-CH"), quantity: "1" }],
      },
      { now: DEC_4 },
    );
    expect(transfer.ok).toBe(false);
    const buyBack = await createBuyBack(
      ctx.db,
      fx.sales,
      {
        contractId: fx.deal.id,
        reason: "Thử",
        lines: [{ itemId: fx.item("GG-CH"), quantity: "1", unitPrice: 1 }],
      },
      { now: DEC_4 },
    );
    expect(buyBack.ok).toBe(false);
  });

  it("takes no amendment and cannot be cancelled", async () => {
    const amended = await createAmendment(ctx.db, fx.sales, fx.deal.id, {
      today: DEC_4_DATE,
    });
    expect(refusal(amended)).toBe(
      "Hợp đồng đã thanh lý nên không lưu phụ lục được.",
    );
    const cancelled = await cancelContract(
      ctx.db,
      fx.director,
      fx.deal.id,
      "Thử",
    );
    expect(cancelled.ok).toBe(false);
  });

  it("takes no rent adjustment and no deposit", async () => {
    const adjusted = await createAdjustment(ctx.db, fx.accountant, {
      contractId: fx.deal.id,
      month: "2026-12",
      refMonth: "2026-11",
      amount: 50_000,
      reason: "Thiếu",
    });
    expect(refusal(adjusted)).toBe(
      "Hợp đồng đã thanh lý nên không ghi điều chỉnh được. Sai sót sau thanh lý ghi bằng phiếu thu hoặc trao đổi với khách.",
    );
    const deposit = await recordReceipt(
      ctx.db,
      fx.accountant,
      {
        requestId: requestId(),
        customerId: fx.customerId,
        kind: "DEPOSIT",
        contractId: fx.deal.id,
        amount: 1_000,
        method: "CASH",
        receivedDate: "2026-12-04",
      },
      { now: DEC_4 },
    );
    expect(refusal(deposit)).toBe("Hợp đồng đã thanh lý nên không nhận cọc.");
  });

  it("is still paid like any debt", async () => {
    const paid = await recordReceipt(
      ctx.db,
      fx.accountant,
      {
        requestId: requestId(),
        customerId: fx.customerId,
        kind: "PAYMENT",
        amount: novemberTotal,
        method: "TRANSFER",
        receivedDate: "2026-12-04",
      },
      { now: DEC_4 },
    );
    expect(paid.ok).toBe(true);
    expect((await readLedger(ctx.db, fx.customerId, DEC_4_DATE)).owed).toBe(0);
  });
});

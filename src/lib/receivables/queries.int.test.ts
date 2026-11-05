// What D14 shows of one customer and the guarantee banner (receivables
// spec "Cọc và bảo lãnh trên D14"), the D5 deposit line, and the dev seed.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { createTestContext } from "@/test/auth";
import { requestId } from "@/test/receivables";
import { setupSiteFixture, type SiteFixture } from "@/test/site-operations";

import {
  contractMoneyStatus,
  customerDetail,
  guaranteeAlerts,
} from "./queries";
import { cancelReceipt, recordReceipt } from "./receipts";
import { seedReceivables } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

const NOV_5 = new Date("2026-11-05T03:00:00Z");
const day = (value: string) => value as BusinessDate;

let fx: SiteFixture;
let minhPhat = "";
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
  minhPhat = fx.customer("NT-0001");
});

async function deposit(contractId: string, amount: number) {
  const saved = await recordReceipt(
    ctx.db,
    fx.accountant,
    {
      requestId: requestId(),
      customerId: minhPhat,
      kind: "DEPOSIT",
      contractId,
      amount,
      method: "CASH",
      receivedDate: "2026-11-05",
    },
    { now: NOV_5 },
  );
  if (!saved.ok) throw new Error(saved.error);
  return saved.data;
}

describe("customerDetail", () => {
  it("shows each running contract's deposit state and its guarantee", async () => {
    await deposit(fx.from.id, 50_000_000);
    await deposit(fx.to.id, 20_000_000);
    const detail = await customerDetail(ctx.db, minhPhat, day("2027-03-05"));
    const byCode = new Map(
      detail?.deposits.map((view) => [view.contractCode, view]),
    );
    expect(byCode.get(fx.from.code)).toMatchObject({
      agreed: 50_000_000,
      received: 50_000_000,
      state: "FULL",
    });
    expect(byCode.get(fx.to.code)).toMatchObject({
      received: 20_000_000,
      state: "SHORT",
    });
    expect(byCode.get(fx.from.code)?.guarantees).toMatchObject([
      {
        guaranteeNumber: "BL-2026-1188",
        amount: 100_000_000,
        daysLeft: 26,
        warning: "Bảo lãnh BL-2026-1188 còn 26 ngày (hết hạn 31/03/2027)",
      },
    ]);
    expect(detail?.contractCount).toBe(2);
    expect(detail?.receipts).toHaveLength(2);
  });

  it("is null for an unknown or malformed customer", async () => {
    expect(await customerDetail(ctx.db, "nope", day("2026-11-05"))).toBeNull();
    expect(
      await customerDetail(
        ctx.db,
        "00000000-0000-0000-0000-000000000000",
        day("2026-11-05"),
      ),
    ).toBeNull();
  });

  it("says Chưa nhận before any deposit", async () => {
    const detail = await customerDetail(ctx.db, minhPhat, day("2026-11-05"));
    expect(detail?.deposits.every((view) => view.state === "NONE")).toBe(true);
  });
});

describe("guaranteeAlerts", () => {
  it("lists guarantees ending within 30 days, not before", async () => {
    expect(await guaranteeAlerts(ctx.db, day("2027-02-28"))).toEqual([]);
    const alerts = await guaranteeAlerts(ctx.db, day("2027-03-01"));
    expect(alerts.map((alert) => alert.message)).toContain(
      `Bảo lãnh sắp hết hạn: chứng thư BL-2026-1188 của ${fx.from.code} hết hạn 31/03/2027 (còn 30 ngày). Nhắc khách gia hạn.`,
    );
    expect(await guaranteeAlerts(ctx.db, day("2027-04-01"))).toEqual([]);
  });
});

describe("contractMoneyStatus", () => {
  it("counts live deposit receipts only", async () => {
    await deposit(fx.from.id, 30_000_000);
    const wrong = await deposit(fx.from.id, 5_000_000);
    await cancelReceipt(ctx.db, fx.accountant, wrong.id, { reason: "Sai" });
    const status = await contractMoneyStatus(ctx.db, fx.from.id);
    expect(status.received).toBe(30_000_000);
    expect(status.receiptCodes).toHaveLength(1);
    expect(status.settlement).toBeNull();
  });
});

describe("seedReceivables", () => {
  it("adds the deposit and a payment once", async () => {
    expect(await seedReceivables(ctx.db, fx.accountant)).toBe(2);
    expect(await seedReceivables(ctx.db, fx.accountant)).toBe(0);
    const status = await contractMoneyStatus(ctx.db, fx.from.id);
    expect(status.received).toBe(50_000_000);
  });
});

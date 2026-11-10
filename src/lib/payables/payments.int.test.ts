// Payables reads and writes (payables tasks 3.1–3.3, 4.1–4.4): debts come
// from posted receipts only, payments settle them in the fixed order, the
// advance settles later receipts when they are posted, a cancellation
// reopens what the payment paid. Numbers of spec supplier-payments.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  activityLog,
  item,
  supplier,
  supplierPaymentAllocation,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { postMovements } from "@/lib/inventory/post";
import { createTestContext } from "@/test/auth";
import { at, receiptFor, setTerms } from "@/test/payables";
import { setupReceivingFixture, type ReceivingFixture } from "@/test/receiving";

import { readLedger, supplierBalances } from "./balances";
import { readPayables } from "./debts";
import {
  cancelPayment,
  previewPayment,
  recordPayment,
  type PaymentBody,
} from "./payments";
import { supplierDetail } from "./queries";

const ctx = createTestContext();
const { db } = ctx;
afterAll(ctx.close);

const NOV_6 = at("2026-11-06");
const d = (value: string) => value as BusinessDate;

let fx: ReceivingFixture;
let tam = "";

beforeEach(async () => {
  fx = await setupReceivingFixture(ctx);
  tam = fx.supplier("NCC-0002");
});

/** Anh Tâm of D14c: PN 04/11 kg 26.500.000 ₫ and PN 05/11 16.250.000 ₫. */
async function tamReceipts() {
  const kg = await receiptFor(ctx, fx, {
    item: "PL-SAT",
    unit: "KG",
    quantity: "3312.5",
    price: 8_000,
    day: "2026-11-04",
    costs: [{ label: "Cước xe tải", amount: 1_200_000 }],
  });
  const pieces = await receiptFor(ctx, fx, {
    quantity: "650",
    price: 25_000,
    day: "2026-11-05",
    costs: [{ label: "Cước xe tải", amount: 800_000 }],
  });
  return { kg, pieces };
}

const body = (extra: PaymentBody = {}): PaymentBody => ({
  requestId: crypto.randomUUID(),
  supplierId: tam,
  kind: "PAYMENT",
  amount: 30_000_000,
  method: "CASH",
  paidDate: "2026-11-06",
  ...extra,
});

async function pay(extra: PaymentBody = {}, actor = fx.accountant) {
  const result = await recordPayment(db, actor, body(extra), { now: NOV_6 });
  if (!result.ok) throw new Error(`${result.status} ${result.error}`);
  return result.data;
}

async function remainingOf(supplierId: string, day = "2026-11-06") {
  const ledger = await readLedger(db, supplierId, d(day));
  return Object.fromEntries(
    ledger.payables.map((row) => [row.code, row.remaining]),
  );
}

/** Invariant of design D3: a seller with an advance is owed nothing. */
async function expectInvariant(supplierId: string) {
  const ledger = await readLedger(db, supplierId, d("2026-11-06"));
  if (ledger.advance > 0) expect(ledger.owed).toBe(0);
  for (const row of ledger.payables) {
    expect(row.paid).toBeLessThanOrEqual(row.total);
  }
}

async function lastSummary() {
  const [row] = await db
    .select({ summary: activityLog.summary })
    .from(activityLog)
    .orderBy(activityLog.id)
    .then((rows) => rows.slice(-1));
  return row?.summary;
}

describe("readPayables", () => {
  it("is the goods value of each receipt, trip costs left out", async () => {
    const { kg, pieces } = await tamReceipts();
    const payables = await readPayables(db, { supplierIds: [tam] });
    expect(
      payables.map((row) => [row.code, row.total, row.dueDate, row.goods]),
    ).toEqual([
      [
        kg.code,
        26_500_000,
        "2026-11-04",
        "3.312,5 kg Phế liệu sắt lẫn cân thực tế",
      ],
      [pieces.code, 16_250_000, "2026-11-05", expect.stringContaining("650 ")],
    ]);
  });

  it("dates the debt with the seller's days at posting time", async () => {
    await setTerms(ctx, tam, 15);
    const first = await receiptFor(ctx, fx, {
      quantity: "10",
      price: 1_000,
      day: "2026-10-27",
    });
    await setTerms(ctx, tam, 30);
    const later = await receiptFor(ctx, fx, {
      quantity: "10",
      price: 1_000,
      day: "2026-11-05",
    });
    const payables = await readPayables(db, { supplierIds: [tam] });
    expect(payables.map((row) => [row.code, row.dueDate])).toEqual([
      [first.code, "2026-11-11"],
      [later.code, "2026-12-05"],
    ]);
  });

  it("is not changed by a value adjustment of the trip", async () => {
    const { kg } = await tamReceipts();
    await db.transaction((tx) =>
      postMovements(tx, fx.director, {
        documentType: "REVALUE",
        documentId: null,
        documentCode: "ĐCG-2026-001",
        businessDate: d("2026-11-06"),
        lines: [
          {
            itemId: fx.item("PL-SAT"),
            condition: "NEW",
            locationId: null,
            movement: "REVALUE",
            quantityMilli: 0,
            amount: 300_000,
            description: `Tăng giá trị 300.000 ₫ · sửa ${kg.code}`,
          },
        ],
      }),
    );
    const payables = await readPayables(db, { supplierIds: [tam] });
    expect(payables[0]?.total).toBe(26_500_000);
  });
});

describe("recordPayment", () => {
  it("pays the receipt due first (30.000.000 ₫)", async () => {
    const { kg, pieces } = await tamReceipts();
    const saved = await pay();
    expect(saved.code).toBe("PC-2026-001");
    expect(saved.parts.map((p) => [p.code, p.amount, p.left])).toEqual([
      [kg.code, 26_500_000, 0],
      [pieces.code, 3_500_000, 12_750_000],
    ]);
    expect(saved.owedAfter).toBe(12_750_000);
    expect(await remainingOf(tam)).toEqual({
      [kg.code]: 0,
      [pieces.code]: 12_750_000,
    });
    expect(await lastSummary()).toBe(
      `NCC-0002 · Trả tiền hàng 30.000.000 ₫ · ${kg.code} 26.500.000 ₫, ${pieces.code} 3.500.000 ₫`,
    );
  });

  it("keeps a surplus as advance and refuses an advance while owing", async () => {
    await tamReceipts();
    const over = await pay({ amount: 45_000_000 });
    expect(over.advance).toBe(2_250_000);
    await expectInvariant(tam);
    const ledger = await readLedger(db, tam, d("2026-11-06"));
    expect([ledger.owed, ledger.advance]).toEqual([0, 2_250_000]);

    const other = fx.supplier("NCC-0001");
    await receiptFor(ctx, fx, {
      supplier: "NCC-0001",
      quantity: "10",
      price: 100_000,
      day: "2026-11-05",
    });
    const refused = await recordPayment(
      db,
      fx.accountant,
      body({ supplierId: other, kind: "ADVANCE", amount: 5_000_000 }),
      { now: NOV_6 },
    );
    expect(refused).toMatchObject({
      ok: false,
      status: 422,
      error: expect.stringContaining("còn phải trả 1.000.000 ₫"),
    });
  });

  it("pays a named receipt first and answers 409 when it was paid meanwhile", async () => {
    const { kg, pieces } = await tamReceipts();
    const named = await pay({
      amount: 16_250_000,
      allocations: [
        { goodsReceiptId: pieces.id, amount: 16_250_000, seen: 16_250_000 },
      ],
    });
    expect(named.parts.map((p) => [p.code, p.mode])).toEqual([
      [pieces.code, "MANUAL"],
    ]);
    expect((await remainingOf(tam))[kg.code]).toBe(26_500_000);
    const raced = await recordPayment(
      db,
      fx.director,
      body({
        amount: 16_250_000,
        allocations: [
          { goodsReceiptId: pieces.id, amount: 16_250_000, seen: 16_250_000 },
        ],
      }),
      { now: NOV_6 },
    );
    expect(raced).toMatchObject({
      ok: false,
      status: 409,
      error: `${pieces.code} đã được trả đủ bởi phiếu khác. Bạn xem lại rồi ghi.`,
    });
  });

  it("refuses a future date, 0 ₫ and the warehouse", async () => {
    await tamReceipts();
    const future = await recordPayment(
      db,
      fx.accountant,
      body({ paidDate: "2026-11-07" }),
      { now: NOV_6 },
    );
    expect(future).toMatchObject({
      ok: false,
      status: 422,
      error: "Ngày chi không được sau hôm nay (06/11/2026).",
    });
    expect(
      await recordPayment(db, fx.accountant, body({ amount: 0 }), {
        now: NOV_6,
      }),
    ).toMatchObject({ ok: false, error: "Số tiền phải lớn hơn 0 ₫." });
    expect(
      await recordPayment(db, fx.warehouse, body(), { now: NOV_6 }),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      await previewPayment(db, fx.sales, body(), { now: NOV_6 }),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("makes one payment of one request, and takes a past date", async () => {
    await tamReceipts();
    const request = body({ paidDate: "2026-11-05" });
    const first = await recordPayment(db, fx.accountant, request, {
      now: NOV_6,
    });
    const again = await recordPayment(db, fx.accountant, request, {
      now: NOV_6,
    });
    expect(first.ok && again.ok).toBe(true);
    if (first.ok && again.ok) {
      expect(again.data).toMatchObject({
        code: first.data.code,
        replayed: true,
      });
    }
    const ledger = await readLedger(db, tam, d("2026-11-06"));
    expect(ledger.payments.map((row) => row.paidDate)).toEqual(["2026-11-05"]);
  });

  it("is recorded for a stopped seller", async () => {
    await tamReceipts();
    await db
      .update(supplier)
      .set({ status: "ARCHIVED" })
      .where(eq(supplier.id, tam));
    expect((await pay()).code).toBe("PC-2026-001");
  });

  it("previews without writing", async () => {
    await tamReceipts();
    const plan = await previewPayment(
      db,
      fx.accountant,
      body({ amount: 42_750_000 }),
      { now: NOV_6 },
    );
    expect(plan).toMatchObject({
      ok: true,
      data: { owedAfter: 0, advance: 0 },
    });
    expect((await readLedger(db, tam, d("2026-11-06"))).payments).toEqual([]);
  });
});

describe("advance settles later receipts", () => {
  async function advance(amount: number, day: string) {
    const result = await recordPayment(
      db,
      fx.accountant,
      body({ kind: "ADVANCE", amount, paidDate: day }),
      { now: at(day) },
    );
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  it("pays a smaller receipt in full when it is posted", async () => {
    const pc = await advance(10_000_000, "2026-11-01");
    expect(await lastSummary()).toBe(
      "NCC-0002 · Ứng trước 10.000.000 ₫ · giữ làm tiền ứng trước 10.000.000 ₫",
    );
    const pn = await receiptFor(ctx, fx, {
      quantity: "256",
      price: 25_000,
      day: "2026-11-06",
    });
    const ledger = await readLedger(db, tam, d("2026-11-06"));
    expect([ledger.owed, ledger.advance]).toEqual([0, 3_600_000]);
    const [part] = await db
      .select()
      .from(supplierPaymentAllocation)
      .where(eq(supplierPaymentAllocation.goodsReceiptId, pn.id));
    expect(part).toMatchObject({
      paymentId: pc.id,
      amount: 6_400_000,
      mode: "ADVANCE",
    });
    expect(await lastSummary()).toMatch(/· trừ tiền ứng trước 6\.400\.000 ₫$/);
  });

  it("takes nothing when posting the receipt fails", async () => {
    await advance(10_000_000, "2026-11-01");
    await db
      .update(item)
      .set({ status: "ARCHIVED" })
      .where(eq(item.code, "GG-CH"));
    await expect(
      receiptFor(ctx, fx, {
        quantity: "256",
        price: 25_000,
        day: "2026-11-06",
      }),
    ).rejects.toThrow();
    const ledger = await readLedger(db, tam, d("2026-11-06"));
    expect([ledger.payables.length, ledger.advance]).toEqual([0, 10_000_000]);
    expect(await db.select().from(supplierPaymentAllocation)).toEqual([]);
  });

  it("leaves the rest of a larger receipt owed", async () => {
    await advance(10_000_000, "2026-11-01");
    const pn = await receiptFor(ctx, fx, {
      quantity: "560",
      price: 25_000,
      day: "2026-11-06",
    });
    expect(await remainingOf(tam)).toEqual({ [pn.code]: 4_000_000 });
    await expectInvariant(tam);
  });

  it("uses the older advance first", async () => {
    const old = await advance(3_000_000, "2026-11-01");
    const newer = await advance(5_000_000, "2026-11-05");
    await receiptFor(ctx, fx, {
      quantity: "160",
      price: 25_000,
      day: "2026-11-06",
    });
    const rows = await db.select().from(supplierPaymentAllocation);
    expect(rows.map((row) => [row.paymentId, row.amount])).toEqual([
      [old.id, 3_000_000],
      [newer.id, 1_000_000],
    ]);
  });
});

describe("cancelPayment", () => {
  it("reopens what it paid, once, with a reason", async () => {
    const { kg, pieces } = await tamReceipts();
    const pc = await pay();
    expect(
      await cancelPayment(
        db,
        fx.accountant,
        pc.id,
        { reason: " " },
        { now: NOV_6 },
      ),
    ).toMatchObject({ ok: false, error: "Bạn ghi lý do hủy phiếu chi." });
    const done = await cancelPayment(
      db,
      fx.accountant,
      pc.id,
      { reason: "Ghi nhầm số tiền" },
      { now: NOV_6 },
    );
    expect(done.ok).toBe(true);
    expect(await remainingOf(tam)).toEqual({
      [kg.code]: 26_500_000,
      [pieces.code]: 16_250_000,
    });
    expect(await lastSummary()).toBe(
      `PC-2026-001 · 30.000.000 ₫ · mở lại ${kg.code} 26.500.000 ₫, ${pieces.code} 3.500.000 ₫ · lý do: Ghi nhầm số tiền`,
    );
    const twice = await cancelPayment(
      db,
      fx.director,
      pc.id,
      { reason: "lần nữa" },
      { now: NOV_6 },
    );
    expect(twice).toMatchObject({
      ok: false,
      status: 409,
      error: expect.stringMatching(
        /^Phiếu PC-2026-001 đã hủy lúc .* bởi Thu Hà\.$/,
      ),
    });
  });

  it("reopens what an advance paid when it is cancelled", async () => {
    const adv = await recordPayment(
      db,
      fx.accountant,
      body({ kind: "ADVANCE", amount: 10_000_000, paidDate: "2026-11-01" }),
      { now: at("2026-11-01") },
    );
    if (!adv.ok) throw new Error(adv.error);
    const pn = await receiptFor(ctx, fx, {
      quantity: "256",
      price: 25_000,
      day: "2026-11-06",
    });
    await cancelPayment(
      db,
      fx.accountant,
      adv.data.id,
      { reason: "Ghi nhầm" },
      { now: NOV_6 },
    );
    const ledger = await readLedger(db, tam, d("2026-11-06"));
    expect([ledger.owed, ledger.advance]).toEqual([6_400_000, 0]);
    expect(await remainingOf(tam)).toEqual({ [pn.code]: 6_400_000 });
  });

  it("lets another advance settle the reopened receipt", async () => {
    const pn = await receiptFor(ctx, fx, {
      quantity: "80",
      price: 25_000,
      day: "2026-11-05",
    });
    const paid = await pay({ amount: 2_000_000 });
    const adv = await pay({ amount: 3_600_000 });
    expect(adv.advance).toBe(3_600_000);
    const done = await cancelPayment(
      db,
      fx.accountant,
      paid.id,
      { reason: "Trùng" },
      { now: NOV_6 },
    );
    expect(done).toMatchObject({ ok: true, data: { resettled: 2_000_000 } });
    const ledger = await readLedger(db, tam, d("2026-11-06"));
    expect(ledger.payables.map((row) => [row.code, row.remaining])).toEqual([
      [pn.code, 0],
    ]);
    expect(ledger.advance).toBe(1_600_000);
  });
});

describe("supplierBalances and supplierDetail", () => {
  it("adds up the tiles over every seller, and filters", async () => {
    await setTerms(ctx, fx.supplier("NCC-0001"), 30);
    await receiptFor(ctx, fx, {
      supplier: "NCC-0001",
      quantity: "100",
      price: 186_400,
      day: "2026-10-21",
    });
    await tamReceipts();
    const page = await supplierBalances(db, d("2026-11-06"), {
      filter: "owing",
    });
    expect(page.totals).toMatchObject({
      owed: 42_750_000 + 18_640_000,
      owingCount: 2,
      overdue: 42_750_000,
      overdueCount: 1,
      longestOverdueDays: 2,
    });
    expect(page.rows.map((row) => [row.code, row.status.label])).toEqual([
      ["NCC-0002", "Quá hạn 2 ngày"],
      ["NCC-0001", "Chưa đến hạn"],
    ]);
    const overdue = await supplierBalances(db, d("2026-11-06"), {
      filter: "overdue",
    });
    expect(overdue.rows.map((row) => row.code)).toEqual(["NCC-0002"]);
    const search = await supplierBalances(db, d("2026-11-06"), {
      filter: "all",
      q: "chu ba",
    });
    expect(search.rows.map((row) => row.code)).toEqual(["NCC-0002"]);
  });

  it("shows one seller with masked CCCD and bank account", async () => {
    const { kg } = await tamReceipts();
    await db
      .update(supplier)
      .set({
        idNumberEnc: "pii1.1.YWJjZGVmZ2hpamts.YWJjZGVmZ2hpamtsbW5vcA",
        idNumberLast4: "2345",
        bankAccountLast4: "5678",
        bankName: "Vietcombank",
      })
      .where(eq(supplier.id, tam));
    await pay({ amount: 26_500_000 });
    const detail = await supplierDetail(db, tam, d("2026-11-06"));
    expect(detail).toMatchObject({
      idNumber: "•••• •••• 2345",
      bankRef: "Vietcombank ···5678",
      orderCount: 2,
      owed: 16_250_000,
    });
    expect(detail?.payables.map((row) => row.code)).not.toContain(kg.code);
    const all = await supplierDetail(db, tam, d("2026-11-06"), {
      showPaid: true,
    });
    expect(all?.payables.map((row) => row.code)).toContain(kg.code);
    const text = JSON.stringify(detail);
    expect(text).not.toContain("001203012345");
    expect(text).not.toContain("0451000312345678");
    expect(detail?.payments[0]?.parts).toEqual([
      expect.objectContaining({ receiptCode: kg.code, amount: 26_500_000 }),
    ]);
  });
});

describe("concurrency", () => {
  it("pays one receipt once when two payments race", async () => {
    const pn = await receiptFor(ctx, fx, {
      quantity: "650",
      price: 25_000,
      day: "2026-11-05",
    });
    const [a, b] = await Promise.all([
      recordPayment(db, fx.accountant, body({ amount: 16_250_000 }), {
        now: NOV_6,
      }),
      recordPayment(db, fx.director, body({ amount: 16_250_000 }), {
        now: NOV_6,
      }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const ledger = await readLedger(db, tam, d("2026-11-06"));
    expect(ledger.payables.map((row) => [row.code, row.paid])).toEqual([
      [pn.code, 16_250_000],
    ]);
    expect(ledger.advance).toBe(16_250_000);
  });

  it("keeps the sums right when a cancel races a payment", async () => {
    const pn = await receiptFor(ctx, fx, {
      quantity: "650",
      price: 25_000,
      day: "2026-11-05",
    });
    const first = await pay({ amount: 16_250_000 });
    const [cancelled, second] = await Promise.all([
      cancelPayment(
        db,
        fx.accountant,
        first.id,
        { reason: "Ghi nhầm" },
        { now: NOV_6 },
      ),
      recordPayment(db, fx.director, body({ amount: 16_250_000 }), {
        now: NOV_6,
      }),
    ]);
    expect(cancelled.ok && second.ok).toBe(true);
    const ledger = await readLedger(db, tam, d("2026-11-06"));
    expect(ledger.payables.map((row) => [row.code, row.paid])).toEqual([
      [pn.code, 16_250_000],
    ]);
    expect(ledger.advance).toBe(0);
    await expectInvariant(tam);
  });

  it("does not take the advance twice while a receipt is posted", async () => {
    const adv = await recordPayment(
      db,
      fx.accountant,
      body({ kind: "ADVANCE", amount: 10_000_000, paidDate: "2026-11-01" }),
      { now: at("2026-11-01") },
    );
    if (!adv.ok) throw new Error(adv.error);
    const [posted, paid] = await Promise.allSettled([
      receiptFor(ctx, fx, {
        quantity: "256",
        price: 25_000,
        day: "2026-11-06",
      }),
      recordPayment(db, fx.director, body({ amount: 6_400_000 }), {
        now: NOV_6,
      }),
    ]);
    expect(posted.status).toBe("fulfilled");
    expect(paid.status).toBe("fulfilled");
    const ledger = await readLedger(db, tam, d("2026-11-06"));
    expect(ledger.payables[0]?.paid).toBe(6_400_000);
    expect(ledger.advance).toBe(10_000_000);
    await expectInvariant(tam);
    const rows = await db
      .select()
      .from(supplierPaymentAllocation)
      .where(
        and(
          eq(
            supplierPaymentAllocation.goodsReceiptId,
            ledger.payables[0]?.key ?? "",
          ),
        ),
      );
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(6_400_000);
  });
});

// Payables tables (payables tasks 1.2, design D3, D5, D11): supplier
// payments, their allocations and cancellations only grow; posted goods
// receipts never change; an allocation takes from a live payment of the
// same seller; a received order line keeps its price. TRUNCATE passes only
// through truncateWithLedger, so test resets keep working.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { postReceipt } from "@/lib/receiving/post";
import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import { truncateWithLedger } from "@/test/inventory";
import {
  OCT_26,
  orderLineIds,
  placedOrder,
  setupReceivingFixture,
  tripOne,
  type ReceivingFixture,
} from "@/test/receiving";

import { purchaseOrderLine } from "./purchasing";
import {
  supplierPayment,
  supplierPaymentAllocation,
  supplierPaymentCancellation,
} from "./payables";
import { goodsReceipt, goodsReceiptLine } from "./receiving";

const ctx = createTestContext();
const { db } = ctx;
afterAll(ctx.close);

let fx: ReceivingFixture;
let receiptId = "";
let lines: Map<string, string>;

beforeEach(async () => {
  fx = await setupReceivingFixture(ctx);
  const code = await placedOrder(ctx, fx);
  lines = await orderLineIds(ctx, code);
  const posted = await postReceipt(db, fx.warehouse, tripOne(code, lines), {
    now: OCT_26,
  });
  if (!posted.ok) throw new Error(posted.error);
  const [row] = await db
    .select({ id: goodsReceipt.id })
    .from(goodsReceipt)
    .where(eq(goodsReceipt.code, posted.data.code));
  receiptId = row?.id ?? "";
});

let seq = 0;

/** A payment of the D3 order's seller (NCC-0002) unless told otherwise. */
async function payment(supplierCode = "NCC-0002"): Promise<string> {
  seq += 1;
  const [row] = await db
    .insert(supplierPayment)
    .values({
      code: `PC-2026-${String(seq).padStart(3, "0")}`,
      supplierId: fx.supplier(supplierCode),
      kind: "PAYMENT",
      amount: 1_000_000,
      method: "CASH",
      paidDate: "2026-10-26",
      requestId: crypto.randomUUID(),
      createdBy: fx.accountant.id,
    })
    .returning({ id: supplierPayment.id });
  return row?.id ?? "";
}

const allocation = (paymentId: string) => ({
  paymentId,
  goodsReceiptId: receiptId,
  amount: 500_000,
  mode: "AUTO",
  createdBy: fx.accountant.id,
});

async function errorOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  return "";
}

async function errorCode(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? "";
  }
  return "";
}

describe("supplier_payment", () => {
  it("cannot be changed or deleted by the app role", async () => {
    const id = await payment();
    await db.insert(supplierPaymentAllocation).values(allocation(id));
    expect(
      await errorCode(() =>
        db
          .update(supplierPayment)
          .set({ amount: 0 })
          .where(eq(supplierPayment.id, id)),
      ),
    ).toBe("42501");
    expect(
      await errorCode(() =>
        db.execute(sql`delete from supplier_payment_allocation`),
      ),
    ).toBe("42501");
  });

  it("refuses an update even from the owner", async () => {
    const id = await payment();
    expect(
      await errorOf(() =>
        getAdminDatabase()
          .update(supplierPayment)
          .set({ note: "sửa" })
          .where(eq(supplierPayment.id, id)),
      ),
    ).toContain("Phiếu chi chỉ ghi thêm");
    await db.insert(supplierPaymentAllocation).values(allocation(id));
    expect(
      await errorOf(() =>
        getAdminDatabase().update(supplierPaymentAllocation).set({ amount: 1 }),
      ),
    ).toContain("Phiếu chi chỉ ghi thêm");
  });

  it("is cancelled once", async () => {
    const id = await payment();
    const cancel = {
      paymentId: id,
      reason: "Ghi nhầm số tiền",
      cancelledBy: fx.accountant.id,
    };
    await db.insert(supplierPaymentCancellation).values(cancel);
    expect(
      await errorCode(() =>
        db.insert(supplierPaymentCancellation).values(cancel),
      ),
    ).toBe("23505");
  });
});

describe("supplier_payment_allocation", () => {
  it("takes nothing from a cancelled payment", async () => {
    const id = await payment();
    await db.insert(supplierPaymentCancellation).values({
      paymentId: id,
      reason: "Ghi nhầm",
      cancelledBy: fx.accountant.id,
    });
    expect(
      await errorOf(() =>
        db.insert(supplierPaymentAllocation).values(allocation(id)),
      ),
    ).toContain("Phiếu chi đã hủy");
  });

  it("joins a payment and a receipt of the same seller", async () => {
    const other = await payment("NCC-0001");
    expect(
      await errorOf(() =>
        db.insert(supplierPaymentAllocation).values(allocation(other)),
      ),
    ).toContain("Phiếu chi và phiếu nhập không cùng người bán");
  });
});

describe("posted goods receipt", () => {
  it("cannot be changed or deleted by the app role", async () => {
    expect(
      await errorCode(() =>
        db
          .update(goodsReceipt)
          .set({ dueDate: "2026-12-31" })
          .where(eq(goodsReceipt.id, receiptId)),
      ),
    ).toBe("42501");
    expect(
      await errorCode(() =>
        db
          .update(goodsReceiptLine)
          .set({ quantity: "1" })
          .where(eq(goodsReceiptLine.receiptId, receiptId)),
      ),
    ).toBe("42501");
    expect(
      await errorCode(() =>
        db.execute(
          sql`delete from goods_receipt where id = ${receiptId}::uuid`,
        ),
      ),
    ).toBe("42501");
  });

  it("refuses an update even from the owner", async () => {
    expect(
      await errorOf(() =>
        getAdminDatabase()
          .update(goodsReceipt)
          .set({ vehicle: "sửa" })
          .where(eq(goodsReceipt.id, receiptId)),
      ),
    ).toContain("Phiếu nhập đã ghi sổ không sửa");
  });

  it("is due on its receipt day for a seller owed 0 days", async () => {
    const [row] = await db
      .select({ due: goodsReceipt.dueDate, day: goodsReceipt.businessDate })
      .from(goodsReceipt)
      .where(eq(goodsReceipt.id, receiptId));
    expect(row).toEqual({ due: "2026-10-26", day: "2026-10-26" });
  });
});

describe("received order line", () => {
  it("keeps its price, unit and item", async () => {
    const lineId = lines.get("GG-CH") ?? "";
    expect(
      await errorOf(() =>
        db
          .update(purchaseOrderLine)
          .set({ unitPrice: 1 })
          .where(eq(purchaseOrderLine.id, lineId)),
      ),
    ).toContain(
      "Dòng đơn đã có phiếu nhập: không đổi đơn giá, đơn vị, vật tư.",
    );
  });

  it("still takes other changes, and lines of an order not received change", async () => {
    const received = lines.get("GG-CH") ?? "";
    await db
      .update(purchaseOrderLine)
      .set({ quantity: "401" })
      .where(eq(purchaseOrderLine.id, received));
    const other = await orderLineIds(ctx, await placedOrder(ctx, fx));
    const open = other.get("GG-M16") ?? "";
    await db
      .update(purchaseOrderLine)
      .set({ unitPrice: 146_000 })
      .where(eq(purchaseOrderLine.id, open));
    const [row] = await db
      .select({ price: purchaseOrderLine.unitPrice })
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.id, open));
    expect(row?.price).toBe(146_000);
  });
});

describe("TRUNCATE of the append-only payables tables", () => {
  const tables = sql`truncate table "supplier_payment_cancellation", "supplier_payment_allocation", "supplier_payment", "goods_receipt_cost", "goods_receipt_line", "goods_receipt" cascade`;

  it("passes through truncateWithLedger", async () => {
    const id = await payment();
    await db.insert(supplierPaymentAllocation).values(allocation(id));
    await truncateWithLedger(tables);
    const rows = await db.select({ id: goodsReceipt.id }).from(goodsReceipt);
    expect(rows).toEqual([]);
  });

  it("is refused without it", async () => {
    expect(await errorOf(() => getAdminDatabase().execute(tables))).toMatch(
      /chỉ ghi thêm|không sửa, không xóa/,
    );
  });
});

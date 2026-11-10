// Erasing a seller (personal-data-protection 5.1–5.5).
import { count, eq, sql, sum } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  activityLog,
  goodsReceipt,
  inventoryLedger,
  supplier,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { PAYABLE_MESSAGES } from "@/domain/payables";
import {
  getSupplierForEdit,
  listSuppliers,
  updateSupplier,
} from "@/lib/catalog/partners";
import { supplierDetail } from "@/lib/payables/queries";
import { recordPayment } from "@/lib/payables/payments";
import { getPurchasingOrder } from "@/test/privacy";
import { lastActivity } from "@/test/activity";
import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import { at, receiptFor } from "@/test/payables";
import {
  counted,
  orderLineIds,
  setupReceivingFixture,
  type ReceivingFixture,
} from "@/test/receiving";
import { createOrder } from "@/lib/purchasing/orders";
import { postReceipt } from "@/lib/receiving/post";
import { d3Order } from "@/test/purchasing";

import { ANONYMIZE_MESSAGES, anonymizeSupplier } from "./anonymize";
import { decryptIdNumber, decryptTaxIdentity, encryptIdNumber } from "./cipher";
import { getPiiKeyRing } from "./key-ring";

vi.mock("@/lib/monitoring/reporter", () => ({ reportError: vi.fn() }));

const ctx = createTestContext();
const { db } = ctx;
afterAll(ctx.close);

const CCCD = "001203012345";
const NAME = "Anh Lê Văn Tâm";
const ADDRESS = "12 Trần Phú, Hà Đông";
const PHONE = "0912345678";
const NOW = at("2026-11-10");
const REQUEST = { confirmCode: "NCC-0002", requestedOn: "2026-11-09" };

let fx: ReceivingFixture;
let tam = "";

/** NCC-0002 with every personal field filled in. */
async function fillPerson(id: string, idNumber: string | null = CCCD) {
  await db
    .update(supplier)
    .set({
      name: NAME,
      phone: PHONE,
      address: ADDRESS,
      taxCode: "0109876543",
      note: "Người quen anh Năm",
      bankName: "Vietcombank",
      bankAccountLast4: "5678",
      idNumberEnc: idNumber
        ? encryptIdNumber(id, idNumber, getPiiKeyRing())
        : null,
      idNumberLast4: idNumber ? idNumber.slice(-4) : null,
      searchText: "anh le van tam ncc-0002 0912345678",
    })
    .where(eq(supplier.id, id));
}

beforeEach(async () => {
  fx = await setupReceivingFixture(ctx);
  tam = fx.supplier("NCC-0002");
  await fillPerson(tam);
});

const anonymize = (input = REQUEST, id = tam, actor = fx.director) =>
  anonymizeSupplier(db, actor, id, input, NOW);

async function rowOf(id = tam) {
  const [row] = await db.select().from(supplier).where(eq(supplier.id, id));
  if (!row) throw new Error("no row");
  return row;
}

async function rowText(id = tam): Promise<string> {
  const rows = await getAdminDatabase().execute<{ text: string }>(
    sql`select s::text as text from supplier s where id = ${id}::uuid`,
  );
  return rows[0]?.text ?? "";
}

/** A receipt paid in full, so the seller owes nothing. */
async function paidReceipt() {
  const receipt = await receiptFor(ctx, fx, {
    quantity: "10",
    price: 100_000,
    day: "2026-03-05",
  });
  await pay(1_000_000);
  return receipt;
}

async function pay(amount: number, kind: "PAYMENT" | "ADVANCE" = "PAYMENT") {
  const paid = await recordPayment(
    db,
    fx.accountant,
    {
      requestId: crypto.randomUUID(),
      supplierId: tam,
      kind,
      amount,
      method: "CASH",
      paidDate: "2026-11-05",
    },
    { now: at("2026-11-05") },
  );
  if (!paid.ok) throw new Error(paid.error);
  return paid;
}

describe("anonymizeSupplier", () => {
  it("clears the fields, renames, archives", async () => {
    await paidReceipt();
    expect(await anonymize()).toMatchObject({
      ok: true,
      data: { code: "NCC-0002", name: "Đã ẩn danh (NCC-0002)" },
    });
    expect(await rowOf()).toMatchObject({
      code: "NCC-0002",
      name: "Đã ẩn danh (NCC-0002)",
      phone: null,
      address: null,
      taxCode: null,
      note: null,
      bankName: null,
      bankAccountLast4: null,
      idNumberEnc: null,
      idNumberLast4: null,
      status: "ARCHIVED",
      anonymizeRequestedOn: "2026-11-09",
      anonymizedBy: fx.director.id,
      searchText: "da an danh (ncc-0002) ncc-0002",
    });
  });

  it("leaves documents and the books alone", async () => {
    await paidReceipt();
    const totals = async () => {
      const [ledger] = await db
        .select({ rows: count(), value: sum(inventoryLedger.amount) })
        .from(inventoryLedger);
      const [receipts] = await db.select({ rows: count() }).from(goodsReceipt);
      return { ledger, receipts };
    };
    const before = await totals();
    const logsBefore = await db.select().from(activityLog);
    await anonymize();
    expect(await totals()).toEqual(before);
    const logsAfter = await db.select().from(activityLog);
    expect(logsAfter.slice(0, logsBefore.length)).toEqual(logsBefore);
    expect(logsAfter).toHaveLength(logsBefore.length + 1);
  });

  it("writes a log row with no old data, and none exists anywhere", async () => {
    await paidReceipt();
    await anonymize();
    expect(await lastActivity(db, "NCC-0002")).toMatchObject({
      action: "ANONYMIZE",
      summary: "Ẩn danh theo yêu cầu nhận ngày 09/11/2026",
      documentCode: "NCC-0002",
    });
    expect((await lastActivity(db, "NCC-0002"))?.flags).toContain("SENSITIVE");
    const dump = (
      await getAdminDatabase().execute<{ text: string }>(
        sql`select a::text as text from activity_log a`,
      )
    )
      .map((row) => row.text)
      .join("\n");
    for (const secret of [NAME, PHONE, ADDRESS, CCCD]) {
      expect(dump).not.toContain(secret);
    }
  });

  it("leaves no old value in the row as text", async () => {
    await paidReceipt();
    await anonymize();
    const text = await rowText();
    for (const secret of ["Lê Văn Tâm", "le van tam", ADDRESS, CCCD, PHONE]) {
      expect(text).not.toContain(secret);
    }
  });

  it("shows the new name on D14c and finds nothing by the old name", async () => {
    await paidReceipt();
    await anonymize();
    const detail = await supplierDetail(db, tam, "2026-11-10" as BusinessDate);
    expect(detail?.name).toBe("Đã ẩn danh (NCC-0002)");
    expect(detail?.bankRef).toBeNull();
    expect(await getPurchasingOrder(ctx, tam)).toBe("Đã ẩn danh (NCC-0002)");
    expect(
      await listSuppliers(db, { q: "Le Van Tam", status: "ARCHIVED" }),
    ).toHaveLength(0);
  });
});

describe("refusals", () => {
  const unchanged = async () => expect((await rowOf()).anonymizedAt).toBeNull();

  it("while money is owed", async () => {
    await receiptFor(ctx, fx, {
      quantity: "265",
      price: 100_000,
      day: "2026-11-04",
    });
    expect(await anonymize()).toEqual({
      ok: false,
      status: 409,
      error: "NCC-0002 còn phải trả 26.500.000 ₫. Trả hết trước khi ẩn danh",
    });
    await unchanged();
  });

  it("while an advance is held", async () => {
    await pay(5_000_000, "ADVANCE");
    expect(await anonymize()).toEqual({
      ok: false,
      status: 409,
      error:
        "NCC-0002 còn tiền ứng trước 5.000.000 ₫. Xử lý xong trước khi ẩn danh",
    });
    await unchanged();
  });

  it("while an order is open, naming it", async () => {
    const order = await createOrder(db, fx.sales, d3Order(fx), {
      place: true,
      now: NOW,
    });
    if (!order.ok) throw new Error(order.error);
    const result = await anonymize();
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(!result.ok && result.error).toContain(order.data.code);
    await unchanged();
  });

  it("for a company", async () => {
    expect(
      await anonymize(
        { confirmCode: "NCC-0001", requestedOn: "2026-11-09" },
        fx.supplier("NCC-0001"),
      ),
    ).toEqual({
      ok: false,
      status: 409,
      error: ANONYMIZE_MESSAGES.onlyPerson,
    });
  });

  it("the second time", async () => {
    await anonymize();
    expect(await anonymize()).toEqual({
      ok: false,
      status: 409,
      error: ANONYMIZE_MESSAGES.already,
    });
  });

  it("with the wrong code", async () => {
    expect(
      await anonymize({ confirmCode: "NCC-0005", requestedOn: "2026-11-09" }),
    ).toMatchObject({
      ok: false,
      status: 422,
      error: ANONYMIZE_MESSAGES.wrongCode,
    });
    await unchanged();
  });

  it.each(["", "09/11/2026", "2026-11-11"])(
    "with the request date %j",
    async (requestedOn) => {
      expect(
        await anonymize({ confirmCode: "NCC-0002", requestedOn }),
      ).toMatchObject({ ok: false, status: 422 });
      await unchanged();
    },
  );
});

describe("after erasure", () => {
  beforeEach(async () => {
    await anonymize();
  });

  it("cannot be edited, reactivated or opened in the edit form", async () => {
    expect(
      await updateSupplier(db, fx.accountant, tam, { note: "x" }),
    ).toMatchObject({ status: 409 });
    expect(
      await updateSupplier(db, fx.accountant, tam, { status: "ACTIVE" }),
    ).toMatchObject({ status: 409 });
    expect((await rowOf()).status).toBe("ARCHIVED");
    expect(await getSupplierForEdit(db, tam)).toMatchObject({ status: 409 });
  });

  it("takes no payment", async () => {
    expect(
      await recordPayment(
        db,
        fx.accountant,
        {
          requestId: crypto.randomUUID(),
          supplierId: tam,
          kind: "ADVANCE",
          amount: 1_000,
          method: "CASH",
          paidDate: "2026-11-10",
        },
        { now: NOW },
      ),
    ).toMatchObject({ ok: false, status: 409 });
  });

  it("takes no receipt on an order placed before", async () => {
    // Only possible through a race: the order is moved to the seller by hand.
    const order = await createOrder(
      db,
      fx.sales,
      {
        supplierId: fx.supplier("NCC-0001"),
        kind: "NEW",
        expectedDate: "2026-11-10",
        allocationMethod: "VALUE",
        lines: [
          {
            itemId: fx.item("GG-CH"),
            unit: "PIECE",
            quantity: "1",
            unitPrice: 100_000,
          },
        ],
        costs: [],
      },
      { place: true, now: NOW },
    );
    if (!order.ok) throw new Error(order.error);
    await getAdminDatabase().execute(
      sql`update purchase_order set supplier_id = ${tam}::uuid where code = ${order.data.code}`,
    );
    const lines = await orderLineIds(ctx, order.data.code);
    const result = await postReceipt(
      db,
      fx.warehouse,
      {
        draftId: crypto.randomUUID(),
        orderCode: order.data.code,
        lines: [counted(lines.get("GG-CH") ?? "", "1", { NEW: "1" })],
        costs: [],
      },
      { now: NOW },
    );
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: PAYABLE_MESSAGES.sellerAnonymized,
    });
  });
});

describe("tax file", () => {
  const ring = () => getPiiKeyRing();

  it("keeps name, address and CCCD of someone who sold us goods", async () => {
    await paidReceipt();
    await anonymize();
    const row = await rowOf();
    expect(row.taxIdentityEnc?.startsWith("pii1.")).toBe(true);
    expect(row.idNumberEnc).toBeNull();
    expect(decryptTaxIdentity(tam, row.taxIdentityEnc ?? "", ring())).toEqual({
      name: NAME,
      address: ADDRESS,
      idNumber: CCCD,
    });
  });

  it("keeps name and address when there was no CCCD", async () => {
    await fillPerson(tam, null);
    await paidReceipt();
    await anonymize();
    const row = await rowOf();
    expect(decryptTaxIdentity(tam, row.taxIdentityEnc ?? "", ring())).toEqual({
      name: NAME,
      address: ADDRESS,
      idNumber: null,
    });
  });

  it("is not made for someone who never sold us goods", async () => {
    await anonymize();
    expect(await rowOf()).toMatchObject({
      taxIdentityEnc: null,
      idNumberEnc: null,
      idNumberLast4: null,
    });
  });

  it("cannot be read as the CCCD column", async () => {
    await paidReceipt();
    await anonymize();
    const row = await rowOf();
    expect(() =>
      decryptIdNumber(tam, row.taxIdentityEnc ?? "", ring()),
    ).toThrow();
  });
});

describe("races", () => {
  it("lets only one of a payment and an erasure win", async () => {
    const [paid, erased] = await Promise.all([
      recordPayment(
        db,
        fx.accountant,
        {
          requestId: crypto.randomUUID(),
          supplierId: tam,
          kind: "ADVANCE",
          amount: 1_000,
          method: "CASH",
          paidDate: "2026-11-10",
        },
        { now: NOW },
      ),
      anonymize(),
    ]);
    expect([paid.ok, erased.ok].filter(Boolean)).toHaveLength(1);
  });
});

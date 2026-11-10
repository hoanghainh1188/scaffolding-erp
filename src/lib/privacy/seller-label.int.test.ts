// A person is written by code into append-only tables; nothing there could
// be erased later (personal-data-protection D8, tasks 4.3).
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { inventoryLedger, supplier } from "@/db/schema";
import {
  PARTNER_MESSAGES,
  createSupplier,
  deleteSupplier,
  updateSupplier,
} from "@/lib/catalog/partners";
import { recordPayment } from "@/lib/payables/payments";
import { lastActivity } from "@/test/activity";
import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import { at, receiptFor } from "@/test/payables";
import { setupReceivingFixture, type ReceivingFixture } from "@/test/receiving";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ReceivingFixture;

beforeEach(async () => {
  fx = await setupReceivingFixture(ctx);
});

const REAL_NAME = "Chú Ba ve chai";

async function dumpLogAndLedger(): Promise<string> {
  const rows = await getAdminDatabase().execute<{ text: string }>(sql`
    select a::text as text from activity_log a
    union all select l::text from inventory_ledger l`);
  return rows.map((row) => row.text).join("\n");
}

describe("a person in append-only tables", () => {
  it("is written by code on the order, the receipt and the payment", async () => {
    const receipt = await receiptFor(ctx, fx, {
      quantity: "10",
      price: 100_000,
      day: "2026-11-04",
    });
    const [line] = await ctx.db
      .select({ note: inventoryLedger.description })
      .from(inventoryLedger)
      .where(eq(inventoryLedger.documentCode, receipt.code));
    expect(line?.note).toBe(
      `Nhập từ ${receipt.orderCode} · NCC-0002 · chuyến 1`,
    );
    const paid = await recordPayment(
      ctx.db,
      fx.accountant,
      {
        requestId: crypto.randomUUID(),
        supplierId: fx.supplier("NCC-0002"),
        kind: "PAYMENT",
        amount: 1_000_000,
        method: "CASH",
        paidDate: "2026-11-04",
      },
      { now: at("2026-11-04") },
    );
    expect(paid.ok).toBe(true);
    expect(await dumpLogAndLedger()).not.toContain(REAL_NAME);
  });

  it("is written by code when created and deleted", async () => {
    const created = await createSupplier(ctx.db, fx.sales, {
      kind: "PERSON",
      name: "Anh Năm Bền",
    });
    if (!created.ok) throw new Error(created.error);
    expect((await lastActivity(ctx.db, created.data.code))?.summary).toBe(
      created.data.code,
    );
    await deleteSupplier(ctx.db, fx.sales, created.data.id);
    expect((await lastActivity(ctx.db, created.data.code))?.summary).toBe(
      created.data.code,
    );
    expect(await dumpLogAndLedger()).not.toContain("Năm Bền");
  });
});

describe("turning a person into a company (0.2 số 170)", () => {
  const toCompany = (id: string) =>
    updateSupplier(ctx.db, fx.accountant, id, { kind: "COMPANY" });
  const refused = {
    ok: false,
    status: 409,
    error: PARTNER_MESSAGES.personHasDocuments,
  };
  const kindOf = async (id: string) => {
    const [row] = await ctx.db
      .select({ kind: supplier.kind })
      .from(supplier)
      .where(eq(supplier.id, id));
    return row?.kind;
  };

  async function newPerson() {
    const created = await createSupplier(ctx.db, fx.sales, {
      kind: "PERSON",
      name: "Anh Năm Bền",
    });
    if (!created.ok) throw new Error(created.error);
    return created.data.id;
  }

  it("is refused once there is an order", async () => {
    await receiptFor(ctx, fx, {
      quantity: "10",
      price: 100_000,
      day: "2026-11-04",
    });
    const id = fx.supplier("NCC-0002");
    expect(await toCompany(id)).toMatchObject(refused);
    expect(await kindOf(id)).toBe("PERSON");
  });

  it("is refused once there is a payment", async () => {
    const id = fx.supplier("NCC-0002");
    const paid = await recordPayment(
      ctx.db,
      fx.accountant,
      {
        requestId: crypto.randomUUID(),
        supplierId: id,
        kind: "ADVANCE",
        amount: 1_000,
        method: "CASH",
        paidDate: "2026-11-04",
      },
      { now: at("2026-11-04") },
    );
    expect(paid.ok).toBe(true);
    expect(await toCompany(id)).toMatchObject(refused);
  });

  it("is allowed before any document", async () => {
    const id = await newPerson();
    expect(await toCompany(id)).toMatchObject({ ok: true });
    expect(await kindOf(id)).toBe("COMPANY");
  });

  it("does not block other edits of a person with documents", async () => {
    await receiptFor(ctx, fx, {
      quantity: "10",
      price: 100_000,
      day: "2026-11-04",
    });
    expect(
      await updateSupplier(ctx.db, fx.accountant, fx.supplier("NCC-0002"), {
        kind: "PERSON",
        note: "Đã gọi",
      }),
    ).toMatchObject({ ok: true });
  });
});

describe("a company in append-only tables", () => {
  it("keeps its name", async () => {
    const [company] = await ctx.db
      .select({ name: supplier.name })
      .from(supplier)
      .where(eq(supplier.code, "NCC-0001"));
    const receipt = await receiptFor(ctx, fx, {
      supplier: "NCC-0001",
      quantity: "10",
      price: 100_000,
      day: "2026-11-04",
    });
    const [line] = await ctx.db
      .select({ note: inventoryLedger.description })
      .from(inventoryLedger)
      .where(eq(inventoryLedger.documentCode, receipt.code));
    expect(line?.note).toBe(
      `Nhập từ ${receipt.orderCode} · ${company?.name} · chuyến 1`,
    );
  });
});

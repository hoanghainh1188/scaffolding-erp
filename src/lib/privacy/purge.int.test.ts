// Retention (personal-data-protection 5.6, 5.7, 0.2 số 161, số 166).
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { supplier, user } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { systemActor } from "@/lib/activity/actor";
import { recordPayment } from "@/lib/payables/payments";
import { activityRows } from "@/test/activity";
import { createTestContext, createTestUser } from "@/test/auth";
import { at, receiptFor } from "@/test/payables";
import { setupReceivingFixture, type ReceivingFixture } from "@/test/receiving";

import { anonymizeSupplier } from "./anonymize";
import { encryptIdNumber } from "./cipher";
import { getPiiKeyRing } from "./key-ring";
import { purgeActor, purgeExpiredPii } from "./purge";

const ctx = createTestContext();
const { db } = ctx;
afterAll(ctx.close);

const CCCD = "001203012345";
const d = (value: string) => value as BusinessDate;

let fx: ReceivingFixture;
let tam = "";

beforeEach(async () => {
  fx = await setupReceivingFixture(ctx);
  tam = fx.supplier("NCC-0002");
});

const actor = () => systemActor(fx.director);
const purge = (today: string, years?: number) =>
  purgeExpiredPii(db, actor(), { today: d(today), years });

async function giveCccd(id = tam) {
  await db
    .update(supplier)
    .set({
      phone: "0912345678",
      idNumberEnc: encryptIdNumber(id, CCCD, getPiiKeyRing()),
      idNumberLast4: "2345",
    })
    .where(eq(supplier.id, id));
}

async function rowOf() {
  const [row] = await db.select().from(supplier).where(eq(supplier.id, tam));
  if (!row) throw new Error("no row");
  return row;
}

const receipt = (day: string) =>
  receiptFor(ctx, fx, { quantity: "10", price: 100_000, day });

async function logsOf() {
  return (await activityRows(db)).filter(
    (row) => row.documentCode === "NCC-0002",
  );
}

describe("purgeActor", () => {
  it("names the active Director created first, on no real browser", async () => {
    const later = await createTestUser(ctx, {
      role: "DIRECTOR",
      username: "giamdocmoi",
    });
    await db
      .update(user)
      .set({ createdAt: new Date("2030-01-01T00:00:00Z") })
      .where(eq(user.id, later.id));
    expect(await purgeActor(db)).toEqual({
      id: fx.director.id,
      role: "DIRECTOR",
      device: "DESKTOP",
      browser: "OTHER",
    });
  });

  it("skips a locked Director", async () => {
    await db
      .update(user)
      .set({ status: "LOCKED" })
      .where(eq(user.id, fx.director.id));
    expect(await purgeActor(db)).toBeNull();
  });
});

describe("tax file of an erased seller", () => {
  beforeEach(async () => {
    await giveCccd();
    await receipt("2026-03-05");
    const paid = await recordPayment(
      db,
      fx.accountant,
      {
        requestId: crypto.randomUUID(),
        supplierId: tam,
        kind: "PAYMENT",
        amount: 1_000_000,
        method: "CASH",
        paidDate: "2026-11-05",
      },
      { now: at("2026-11-05") },
    );
    if (!paid.ok) throw new Error(paid.error);
    const erased = await anonymizeSupplier(
      db,
      fx.director,
      tam,
      { confirmCode: "NCC-0002", requestedOn: "2026-11-09" },
      at("2026-11-10"),
    );
    if (!erased.ok) throw new Error(erased.error);
  });

  it("stays until the day before the deadline", async () => {
    expect(await purge("2036-03-04")).toEqual({ taxFiles: 0, idNumbers: 0 });
    expect((await rowOf()).taxIdentityEnc).not.toBeNull();
  });

  it("goes on the deadline, once, with one log row", async () => {
    const before = (await logsOf()).length;
    expect(await purge("2036-03-05")).toEqual({ taxFiles: 1, idNumbers: 0 });
    expect((await rowOf()).taxIdentityEnc).toBeNull();
    const logs = await logsOf();
    expect(logs).toHaveLength(before + 1);
    expect(logs.at(-1)).toMatchObject({
      action: "ANONYMIZE",
      summary: "Xóa hồ sơ thuế đã hết thời hạn giữ",
      userId: fx.director.id,
      browser: "OTHER",
    });
    expect(await purge("2036-03-05")).toEqual({ taxFiles: 0, idNumbers: 0 });
    expect(await logsOf()).toHaveLength(before + 1);
  });

  it("follows the period parameter", async () => {
    expect(await purge("2031-03-04", 5)).toMatchObject({ taxFiles: 0 });
    expect(await purge("2031-03-05", 5)).toMatchObject({ taxFiles: 1 });
  });
});

describe("CCCD of a seller not erased", () => {
  beforeEach(() => giveCccd());

  it("is deleted 10 years after the last receipt, the rest stays", async () => {
    await receipt("2026-03-05");
    expect(await purge("2036-03-04")).toEqual({ taxFiles: 0, idNumbers: 0 });
    expect(await purge("2036-03-05")).toEqual({ taxFiles: 0, idNumbers: 1 });
    expect(await rowOf()).toMatchObject({
      idNumberEnc: null,
      idNumberLast4: null,
      name: "Chú Ba ve chai",
      phone: "0912345678",
    });
    const log = (await logsOf()).at(-1);
    expect(log).toMatchObject({
      action: "UPDATE",
      summary: "Số CCCD: •••• •••• 2345 → –",
      changes: [
        {
          field: "idNumber",
          label: "Số CCCD",
          before: "•••• •••• 2345",
          after: null,
        },
      ],
    });
    expect(log?.flags).toContain("SENSITIVE");
    expect(JSON.stringify(log)).not.toContain(CCCD);
    const count = (await logsOf()).length;
    expect(await purge("2036-03-05")).toEqual({ taxFiles: 0, idNumbers: 0 });
    expect(await logsOf()).toHaveLength(count);
  });

  it("stays while the seller keeps selling", async () => {
    await receipt("2026-03-05");
    await receipt("2030-02-01");
    expect(await purge("2036-03-05")).toEqual({ taxFiles: 0, idNumbers: 0 });
    expect((await rowOf()).idNumberLast4).toBe("2345");
  });

  it("counts from a CCCD typed in again after the last receipt", async () => {
    // Back after 10 years: the CCCD was entered again on 01/11/2036, before
    // any new receipt.
    await receipt("2026-03-05");
    await db.execute(
      sql`update supplier set id_number_saved_at = '2036-10-31T17:30:00Z' where id = ${tam}::uuid`,
    );
    expect(await purge("2036-11-10")).toEqual({ taxFiles: 0, idNumbers: 0 });
    expect((await rowOf()).idNumberLast4).toBe("2345");
    expect(await purge("2046-10-31")).toEqual({ taxFiles: 0, idNumbers: 0 });
    expect(await purge("2046-11-01")).toEqual({ taxFiles: 0, idNumbers: 1 });
  });

  it("still counts from a later receipt", async () => {
    await db.execute(
      sql`update supplier set id_number_saved_at = '2026-01-10T03:00:00Z' where id = ${tam}::uuid`,
    );
    await receipt("2030-02-01");
    expect(await purge("2040-01-31")).toEqual({ taxFiles: 0, idNumbers: 0 });
    expect(await purge("2040-02-01")).toEqual({ taxFiles: 0, idNumbers: 1 });
  });

  it("counts from the Vietnamese creation day without a receipt", async () => {
    await db.execute(
      sql`update supplier set created_at = '2026-11-09T17:30:00Z' where id = ${tam}::uuid`,
    );
    expect(await purge("2036-11-09")).toEqual({ taxFiles: 0, idNumbers: 0 });
    expect(await purge("2036-11-10")).toEqual({ taxFiles: 0, idNumbers: 1 });
  });
});

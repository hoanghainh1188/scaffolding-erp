// Step 1 of the two-step migration (personal-data-protection 6.1).
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { supplier } from "@/db/schema";
import { getAdminDatabase } from "@/test/admin";
import { createTestContext, resetAuthTables } from "@/test/auth";
import { resetCatalogTables } from "@/test/catalog";
import { runScript } from "@/test/run-script";

import { backfillLegacyPii, countLegacyRows } from "./backfill";
import { decryptIdNumber, encryptIdNumber, type PiiKeyRing } from "./cipher";

const ctx = createTestContext();
const { db } = ctx;
afterAll(ctx.close);

const KEY = { id: 1, key: Buffer.alloc(32, 1) };
const ring: PiiKeyRing = { current: KEY, all: [KEY] };
const CCCD = "000203012345";

beforeEach(async () => {
  await resetAuthTables();
  await resetCatalogTables();
});

async function legacy(
  code: string,
  idNumber: string | null,
  account: string | null,
) {
  const id = crypto.randomUUID();
  await getAdminDatabase().execute(sql`
    insert into supplier (id, code, kind, name, search_text, id_number, bank_account)
    values (${id}::uuid, ${code}, 'PERSON', 'Anh Tâm', 'x', ${idNumber}, ${account})`);
  return id;
}

async function oldColumns(id: string) {
  const rows = await getAdminDatabase().execute<{
    id_number: string | null;
    bank_account: string | null;
  }>(sql`select id_number, bank_account from supplier where id = ${id}::uuid`);
  return rows[0];
}

async function rowOf(id: string) {
  const [row] = await db.select().from(supplier).where(eq(supplier.id, id));
  return row;
}

describe("npm run pii:backfill", () => {
  const env = {
    PII_ENCRYPTION_KEYS: `1:${KEY.key.toString("base64")}`,
  };

  it("exits 1 while old values remain and prints counts only", async () => {
    await legacy("NCC-0001", CCCD, "0451000312345678");
    await legacy("NCC-0002", null, "123");
    expect(
      await runScript("scripts/pii-backfill.mts", ["--check"], env),
    ).toEqual({ code: 1, output: "Còn 2 dòng có dữ liệu ở cột cũ.\n" });
    const moved = await runScript("scripts/pii-backfill.mts", [], env);
    expect(moved).toEqual({
      code: 0,
      output: "Đã chuyển 2 dòng; bỏ 1 số tài khoản quá ngắn.\n",
    });
    expect(moved.output).not.toContain(CCCD);
    expect(moved.output).not.toContain("5678");
    expect(
      (await runScript("scripts/pii-backfill.mts", ["--check"], env)).code,
    ).toBe(0);
  }, 60_000);
});

describe("backfillLegacyPii", () => {
  it("moves the numbers and empties the old columns", async () => {
    const id = await legacy("NCC-0001", CCCD, "0451 0003 1234 5678");
    expect(await countLegacyRows(db)).toBe(1);
    expect(await backfillLegacyPii(db, ring)).toEqual({
      migrated: 1,
      accountsDropped: 0,
    });
    const row = await rowOf(id);
    expect(row?.idNumberEnc?.startsWith("pii1.1.")).toBe(true);
    expect(row).toMatchObject({
      idNumberLast4: "2345",
      bankAccountLast4: "5678",
    });
    expect(decryptIdNumber(id, row?.idNumberEnc ?? "", ring)).toBe(CCCD);
    expect(await oldColumns(id)).toEqual({
      id_number: null,
      bank_account: null,
    });
    expect(await countLegacyRows(db)).toBe(0);
  });

  it("keeps what was saved after the deploy", async () => {
    const id = await legacy("NCC-0001", CCCD, "0451000312345678");
    const newer = encryptIdNumber(id, "000299999999", ring);
    await db
      .update(supplier)
      .set({
        idNumberEnc: newer,
        idNumberLast4: "9999",
        bankAccountLast4: "1111",
      })
      .where(eq(supplier.id, id));
    await backfillLegacyPii(db, ring);
    expect(await rowOf(id)).toMatchObject({
      idNumberEnc: newer,
      idNumberLast4: "9999",
      bankAccountLast4: "1111",
    });
    expect(await oldColumns(id)).toEqual({
      id_number: null,
      bank_account: null,
    });
  });

  it("dates a moved CCCD from the row's last update, for pii:purge", async () => {
    const id = await legacy("NCC-0001", CCCD, null);
    await getAdminDatabase().execute(
      sql`update supplier set updated_at = '2020-05-01T00:00:00Z' where id = ${id}::uuid`,
    );
    await backfillLegacyPii(db, ring);
    expect((await rowOf(id))?.idNumberSavedAt).toEqual(
      new Date("2020-05-01T00:00:00Z"),
    );
  });

  it("leaves the saving day of a CCCD saved after the deploy", async () => {
    const id = await legacy("NCC-0001", CCCD, null);
    const saved = new Date("2026-11-01T00:00:00Z");
    await db
      .update(supplier)
      .set({
        idNumberEnc: encryptIdNumber(id, "000299999999", ring),
        idNumberLast4: "9999",
        idNumberSavedAt: saved,
      })
      .where(eq(supplier.id, id));
    await backfillLegacyPii(db, ring);
    expect((await rowOf(id))?.idNumberSavedAt).toEqual(saved);
  });

  it("does nothing the second time", async () => {
    const id = await legacy("NCC-0001", CCCD, "12345678");
    await backfillLegacyPii(db, ring);
    const before = await rowOf(id);
    expect(await backfillLegacyPii(db, ring)).toEqual({
      migrated: 0,
      accountsDropped: 0,
    });
    expect(await rowOf(id)).toEqual(before);
  });

  it("counts a too-short account and keeps nothing of it", async () => {
    const id = await legacy("NCC-0001", null, "123");
    expect(await backfillLegacyPii(db, ring)).toEqual({
      migrated: 1,
      accountsDropped: 1,
    });
    expect((await rowOf(id))?.bankAccountLast4).toBeNull();
    expect(await oldColumns(id)).toEqual({
      id_number: null,
      bank_account: null,
    });
  });
});

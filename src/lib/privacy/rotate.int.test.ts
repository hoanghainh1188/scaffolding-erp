// Key rotation (personal-data-protection 6.2, design D4).
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { supplier } from "@/db/schema";
import { getAdminDatabase } from "@/test/admin";
import { createTestContext, resetAuthTables } from "@/test/auth";
import { resetCatalogTables } from "@/test/catalog";
import { runScript } from "@/test/run-script";

import {
  decryptIdNumber,
  decryptTaxIdentity,
  encryptIdNumber,
  encryptTaxIdentity,
  type PiiKeyRing,
} from "./cipher";
import { countStaleCiphertexts, rotatePiiKeys } from "./rotate";

const ctx = createTestContext();
const { db } = ctx;
afterAll(ctx.close);

const OLD = { id: 1, key: Buffer.alloc(32, 1) };
const NEW = { id: 2, key: Buffer.alloc(32, 2) };
const oldRing: PiiKeyRing = { current: OLD, all: [OLD] };
const newRing: PiiKeyRing = { current: NEW, all: [NEW, OLD] };
const CCCD = "000203012345";
const STAMP = new Date("2026-01-02T03:04:05Z");

beforeEach(async () => {
  await resetAuthTables();
  await resetCatalogTables();
});

async function seedRows(total: number) {
  const ids = Array.from({ length: total }, () => crypto.randomUUID());
  await db.insert(supplier).values(
    ids.map((id, index) => ({
      id,
      code: `NCC-${String(index).padStart(5, "0")}`,
      kind: "PERSON",
      name: `Người bán ${index}`,
      searchText: "x",
      idNumberEnc: encryptIdNumber(id, CCCD, oldRing),
      idNumberLast4: "2345",
      updatedAt: STAMP,
    })),
  );
  return ids;
}

describe("npm run pii:rotate", () => {
  const b64 = (key: Buffer) => key.toString("base64");
  const env = {
    PII_ENCRYPTION_KEYS: `2:${b64(NEW.key)},1:${b64(OLD.key)}`,
  };

  it("reports what is left, moves it, and never prints a number", async () => {
    await seedRows(3);
    expect(await runScript("scripts/pii-rotate.mts", ["--check"], env)).toEqual(
      { code: 1, output: "Còn 3 bản mã dùng khóa cũ.\n" },
    );
    expect(await countStaleCiphertexts(db, newRing)).toBe(3);
    const moved = await runScript("scripts/pii-rotate.mts", [], env);
    expect(moved).toEqual({ code: 0, output: "Đã đổi khóa 3 dòng.\n" });
    expect(moved.output).not.toContain(CCCD);
    expect(await runScript("scripts/pii-rotate.mts", [], env)).toEqual({
      code: 0,
      output: "Đã đổi khóa 0 dòng.\n",
    });
    expect(
      (await runScript("scripts/pii-rotate.mts", ["--check"], env)).code,
    ).toBe(0);
  }, 60_000);

  it("refuses a bad batch size", async () => {
    expect(
      (await runScript("scripts/pii-rotate.mts", ["--batch", "0"], env)).code,
    ).toBe(2);
  }, 60_000);
});

describe("rotatePiiKeys", () => {
  it("moves 250 values in batches, content and updated_at unchanged", async () => {
    const ids = await seedRows(250);
    expect(await countStaleCiphertexts(db, newRing)).toBe(250);
    expect(await rotatePiiKeys(db, newRing, { batch: 100 })).toBe(250);
    expect(await countStaleCiphertexts(db, newRing)).toBe(0);
    const [row] = await db
      .select()
      .from(supplier)
      .where(eq(supplier.id, ids[0] ?? ""));
    expect(row?.idNumberEnc?.startsWith("pii1.2.")).toBe(true);
    expect(
      decryptIdNumber(row?.id ?? "", row?.idNumberEnc ?? "", newRing),
    ).toBe(CCCD);
    expect(row?.updatedAt).toEqual(STAMP);
  });

  it("picks up after being stopped, reading both keys meanwhile", async () => {
    const ids = await seedRows(250);
    expect(
      await rotatePiiKeys(db, newRing, { batch: 100, maxBatches: 1 }),
    ).toBe(100);
    expect(await countStaleCiphertexts(db, newRing)).toBe(150);
    const rows = await db.select().from(supplier);
    expect(rows).toHaveLength(ids.length);
    for (const row of rows) {
      expect(decryptIdNumber(row.id, row.idNumberEnc ?? "", newRing)).toBe(
        CCCD,
      );
    }
    expect(await rotatePiiKeys(db, newRing, { batch: 100 })).toBe(150);
  });

  it("changes nothing when already done", async () => {
    await seedRows(3);
    await rotatePiiKeys(db, newRing);
    const before = await db.select().from(supplier);
    expect(await rotatePiiKeys(db, newRing)).toBe(0);
    expect(await db.select().from(supplier)).toEqual(before);
  });

  it("rotates a tax file too, content unchanged", async () => {
    const id = crypto.randomUUID();
    const identity = { name: "Anh Tâm", address: "Hà Đông", idNumber: CCCD };
    await getAdminDatabase()
      .insert(supplier)
      .values({
        id,
        code: "NCC-0001",
        kind: "PERSON",
        name: "Đã ẩn danh (NCC-0001)",
        searchText: "x",
        status: "ARCHIVED",
        anonymizedAt: STAMP,
        taxIdentityEnc: encryptTaxIdentity(id, identity, oldRing),
      });
    expect(await countStaleCiphertexts(db, newRing)).toBe(1);
    expect(await rotatePiiKeys(db, newRing)).toBe(1);
    const [row] = await db.select().from(supplier);
    expect(row?.taxIdentityEnc?.startsWith("pii1.2.")).toBe(true);
    expect(decryptTaxIdentity(id, row?.taxIdentityEnc ?? "", newRing)).toEqual(
      identity,
    );
  });

  it("fails without touching the batch when an old key is gone", async () => {
    await seedRows(2);
    const before = await db.select().from(supplier);
    await expect(
      rotatePiiKeys(db, { current: NEW, all: [NEW] }),
    ).rejects.toThrow("không có khóa số 1");
    expect(await db.select().from(supplier)).toEqual(before);
  });

  it("counts through SQL with the current key only", async () => {
    await seedRows(1);
    await rotatePiiKeys(db, newRing);
    const rows = await db.execute<{ value: number }>(
      sql`select count(*)::int as value from supplier where id_number_enc like 'pii1.2.%'`,
    );
    expect(rows[0]?.value).toBe(1);
  });
});

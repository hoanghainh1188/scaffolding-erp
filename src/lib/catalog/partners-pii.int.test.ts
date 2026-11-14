// Sellers' personal data in the service (personal-data-protection 3.x).
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { supplier } from "@/db/schema";
import { DATA_NOTICE_MESSAGE } from "@/domain/personal-data";
import { reportError } from "@/lib/monitoring/reporter";
import { decryptIdNumber } from "@/lib/privacy/cipher";
import { lastActivity } from "@/test/activity";
import { getAdminDatabase } from "@/test/admin";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
  type TestUser,
} from "@/test/auth";
import { resetCatalogTables } from "@/test/catalog";

import {
  createSupplier,
  getSupplierForEdit,
  listSuppliers,
  updateSupplier,
  type SupplierInput,
} from "./partners";

vi.mock("@/lib/monitoring/reporter", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/privacy/cipher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/privacy/cipher")>();
  return { ...actual, decryptIdNumber: vi.fn(actual.decryptIdNumber) };
});

const ctx = createTestContext();
afterAll(ctx.close);

const CCCD = "001203012345";
let thuha: TestUser;

beforeEach(async () => {
  vi.clearAllMocks();
  await resetAuthTables();
  await resetCatalogTables();
  thuha = await createTestUser(ctx, {
    role: "ACCOUNTANT",
    username: "thuha",
    name: "Thu Hà",
  });
});

const person = (extra: SupplierInput = {}): SupplierInput => ({
  kind: "PERSON",
  name: "Anh Lê Văn Tâm",
  ...extra,
});

async function seller(extra: SupplierInput = {}) {
  const result = await createSupplier(ctx.db, thuha, person(extra));
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const withCccd = (extra: SupplierInput = {}) =>
  seller({ idNumber: CCCD, dataNoticeConfirmed: true, ...extra });

async function rowOf(id: string) {
  const [row] = await ctx.db.select().from(supplier).where(eq(supplier.id, id));
  if (!row) throw new Error("no row");
  return row;
}

async function rowText(id: string): Promise<string> {
  const rows = await getAdminDatabase().execute<{ text: string }>(
    sql`select s::text as text from supplier s where id = ${id}::uuid`,
  );
  return rows[0]?.text ?? "";
}

describe("CCCD encryption", () => {
  it("stores only ciphertext and the last 4 digits", async () => {
    const created = await withCccd();
    const row = await rowOf(created.id);
    expect(row.idNumberEnc?.startsWith("pii1.")).toBe(true);
    expect(row.idNumberLast4).toBe("2345");
    expect(await rowText(created.id)).not.toContain(CCCD);
  });

  it("gives two sellers different ciphertexts for one number", async () => {
    const a = await rowOf((await withCccd()).id);
    const b = await rowOf((await withCccd()).id);
    expect(a.idNumberEnc).not.toBe(b.idNumberEnc);
  });

  it("does not decrypt to list", async () => {
    await withCccd();
    vi.mocked(decryptIdNumber).mockClear();
    const [listed] = await listSuppliers(ctx.db);
    expect(listed?.idNumberMasked).toBe("•••• •••• 2345");
    expect(decryptIdNumber).not.toHaveBeenCalled();
  });

  it("decrypts for the edit form, with no-leak failure on a copied value", async () => {
    const a = await withCccd();
    const b = await withCccd({ idNumber: "001203099999" });
    expect(await getSupplierForEdit(ctx.db, a.id)).toMatchObject({
      data: { idNumber: CCCD },
    });
    const copied = (await rowOf(a.id)).idNumberEnc ?? "";
    await ctx.db
      .update(supplier)
      .set({ idNumberEnc: copied })
      .where(eq(supplier.id, b.id));
    const result = await getSupplierForEdit(ctx.db, b.id);
    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "Không đọc được số CCCD, báo quản trị",
    });
    expect(reportError).toHaveBeenCalledTimes(1);
    const report = JSON.stringify(vi.mocked(reportError).mock.calls[0]);
    expect(report).toContain("AUTH_FAILED");
    expect(report).not.toContain(copied);
    expect(report).not.toContain(CCCD);
  });
});

describe("editing a CCCD", () => {
  it("does not decrypt or change the ciphertext when the body has none", async () => {
    const created = await withCccd();
    const before = (await rowOf(created.id)).idNumberEnc;
    vi.mocked(decryptIdNumber).mockClear();
    await updateSupplier(ctx.db, thuha, created.id, { phone: "0912345678" });
    expect(decryptIdNumber).not.toHaveBeenCalled();
    expect((await rowOf(created.id)).idNumberEnc).toBe(before);
  });

  it("keeps the ciphertext when the same number is sent", async () => {
    const created = await withCccd();
    const before = (await rowOf(created.id)).idNumberEnc;
    await updateSupplier(ctx.db, thuha, created.id, { idNumber: CCCD });
    expect((await rowOf(created.id)).idNumberEnc).toBe(before);
  });

  it("changes ciphertext and last 4 digits, masked in the log", async () => {
    const created = await withCccd({ idNumber: "001203011111" });
    const before = (await rowOf(created.id)).idNumberEnc;
    await updateSupplier(ctx.db, thuha, created.id, { idNumber: CCCD });
    const row = await rowOf(created.id);
    expect(row.idNumberEnc).not.toBe(before);
    expect(row.idNumberLast4).toBe("2345");
    const log = await lastActivity(ctx.db, created.code);
    expect(log?.changes).toEqual([
      {
        field: "idNumber",
        label: "Số CCCD",
        before: "•••• •••• 1111",
        after: "•••• •••• 2345",
      },
    ]);
    expect(JSON.stringify(log)).not.toContain(CCCD);
    expect(JSON.stringify(log)).not.toContain(row.idNumberEnc);
    expect(log?.flags).toContain("SENSITIVE");
  });

  it("clears both columns on null", async () => {
    const created = await withCccd();
    await updateSupplier(ctx.db, thuha, created.id, { idNumber: null });
    expect(await rowOf(created.id)).toMatchObject({
      idNumberEnc: null,
      idNumberLast4: null,
      idNumberSavedAt: null,
    });
  });
});

describe("the day a CCCD is saved (anchor of pii:purge)", () => {
  const OLD = new Date("2016-01-01T00:00:00Z");
  const age = (id: string) =>
    getAdminDatabase().execute(
      sql`update supplier set id_number_saved_at = ${OLD.toISOString()}::timestamptz where id = ${id}::uuid`,
    );

  it("is set when the CCCD is first saved", async () => {
    const before = Date.now();
    const created = await withCccd();
    const saved = (await rowOf(created.id)).idNumberSavedAt;
    expect(saved?.getTime()).toBeGreaterThanOrEqual(before - 1_000);
  });

  it("is kept by an edit that leaves the CCCD as it is", async () => {
    const created = await withCccd();
    await age(created.id);
    await updateSupplier(ctx.db, thuha, created.id, { phone: "0912345678" });
    await updateSupplier(ctx.db, thuha, created.id, { idNumber: CCCD });
    expect((await rowOf(created.id)).idNumberSavedAt).toEqual(OLD);
  });

  it("moves when the CCCD is typed in again", async () => {
    const created = await withCccd();
    await age(created.id);
    await updateSupplier(ctx.db, thuha, created.id, { idNumber: null });
    await updateSupplier(ctx.db, thuha, created.id, {
      idNumber: CCCD,
      dataNoticeConfirmed: true,
    });
    const saved = (await rowOf(created.id)).idNumberSavedAt;
    expect(saved?.getTime()).toBeGreaterThan(OLD.getTime());
  });
});

describe("bank account", () => {
  it("saves 4 digits", async () => {
    const created = await seller({
      bankAccountLast4: "5678",
      dataNoticeConfirmed: true,
    });
    expect((await rowOf(created.id)).bankAccountLast4).toBe("5678");
  });

  it("refuses a full number without repeating it", async () => {
    const result = await createSupplier(
      ctx.db,
      thuha,
      person({
        bankAccountLast4: "0451000312345678",
        dataNoticeConfirmed: true,
      }),
    );
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: "Chỉ nhập 4 số cuối của tài khoản",
      field: "bankAccountLast4",
    });
    expect(JSON.stringify(result)).not.toContain("0451000312345678");
    expect(await listSuppliers(ctx.db)).toHaveLength(0);
  });
});

describe("data notice gate", () => {
  const refused = { ok: false, status: 422, error: DATA_NOTICE_MESSAGE };

  it.each<[string, SupplierInput]>([
    ["a CCCD", { idNumber: CCCD }],
    ["a phone", { phone: "0912345678" }],
    ["an address", { address: "Hà Đông" }],
    ["an account", { bankAccountLast4: "5678" }],
  ])("refuses a person's %s without the tick", async (_name, extra) => {
    expect(await createSupplier(ctx.db, thuha, person(extra))).toMatchObject(
      refused,
    );
    expect(await listSuppliers(ctx.db)).toHaveLength(0);
  });

  it("records version, the signed-in user and server time", async () => {
    const created = await withCccd();
    const row = await rowOf(created.id);
    expect(row.dataNoticeVersion).toBe(1);
    expect(row.dataNoticeBy).toBe(thuha.id);
    expect(Date.now() - (row.dataNoticeAt?.getTime() ?? 0)).toBeLessThan(5000);
    expect(await lastActivity(ctx.db, created.code)).toMatchObject({
      summary: `${created.code} · Ghi nhận thông báo phiên bản 1`,
    });
  });

  it("ignores who and when sent by the client", async () => {
    const created = await seller({
      phone: "0912345678",
      dataNoticeConfirmed: true,
      dataNoticeBy: "someone-else",
      dataNoticeAt: "2020-01-01",
    } as SupplierInput);
    expect((await rowOf(created.id)).dataNoticeBy).toBe(thuha.id);
  });

  it("needs no second tick once recorded, and keeps the record", async () => {
    const created = await seller({
      phone: "0912345678",
      dataNoticeConfirmed: true,
    });
    const before = await rowOf(created.id);
    expect(
      await updateSupplier(ctx.db, thuha, created.id, {
        phone: "0912345679",
      }),
    ).toMatchObject({ ok: true });
    const after = await rowOf(created.id);
    expect(after.dataNoticeAt).toEqual(before.dataNoticeAt);
    expect(after.dataNoticeVersion).toBe(1);
  });

  it("logs the notice when an edit records it", async () => {
    const created = await seller();
    await updateSupplier(ctx.db, thuha, created.id, {
      phone: "0912345678",
      dataNoticeConfirmed: true,
    });
    const log = await lastActivity(ctx.db, created.code);
    expect(log?.changes).toContainEqual({
      field: "dataNotice",
      label: "Ghi nhận thông báo",
      before: null,
      after: "Phiên bản 1",
    });
  });

  it("does not invent a record for old data; a note-only edit passes", async () => {
    const created = await withCccd();
    await ctx.db
      .update(supplier)
      .set({ dataNoticeVersion: null, dataNoticeAt: null, dataNoticeBy: null })
      .where(eq(supplier.id, created.id));
    expect(
      await updateSupplier(ctx.db, thuha, created.id, { note: "Mới" }),
    ).toMatchObject({ ok: true });
    expect((await rowOf(created.id)).dataNoticeVersion).toBeNull();
  });

  it("still gates an old row when a personal field is sent", async () => {
    const created = await withCccd();
    await ctx.db
      .update(supplier)
      .set({ dataNoticeVersion: null, dataNoticeAt: null, dataNoticeBy: null })
      .where(eq(supplier.id, created.id));
    expect(
      await updateSupplier(ctx.db, thuha, created.id, {
        phone: "0912345678",
      }),
    ).toMatchObject(refused);
  });

  it("needs nothing for a name only", async () => {
    expect((await rowOf((await seller()).id)).dataNoticeVersion).toBeNull();
  });

  it("needs nothing for a company with a phone", async () => {
    const created = await seller({
      kind: "COMPANY",
      name: "Thép Nam Sơn",
      phone: "0243123456",
    });
    expect((await rowOf(created.id)).dataNoticeVersion).toBeNull();
  });

  it("gates a company with a CCCD", async () => {
    expect(
      await createSupplier(
        ctx.db,
        thuha,
        person({ kind: "COMPANY", idNumber: CCCD }),
      ),
    ).toMatchObject(refused);
  });

  it("gates a company turned into a person who has a phone", async () => {
    const created = await seller({
      kind: "COMPANY",
      name: "Thép Nam Sơn",
      phone: "0243123456",
    });
    expect(
      await updateSupplier(ctx.db, thuha, created.id, { kind: "PERSON" }),
    ).toMatchObject(refused);
  });
});

describe("edit data", () => {
  it("gives the record and the wording", async () => {
    const created = await withCccd();
    const result = await getSupplierForEdit(ctx.db, created.id);
    expect(result).toMatchObject({
      ok: true,
      data: {
        idNumber: CCCD,
        dataNotice: { version: 1, byName: "Thu Hà" },
        notice: { version: 1 },
      },
    });
  });
});

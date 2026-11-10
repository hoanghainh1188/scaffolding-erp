import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { location, site } from "@/db/schema";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
} from "@/test/auth";
import { lastActivity } from "@/test/activity";
import { resetCatalogTables } from "@/test/catalog";

import type { Actor } from "./common";
import {
  createCustomer,
  createSupplier,
  deleteCustomer,
  deleteSupplier,
  getSupplierForEdit,
  listCustomers,
  listSuppliers,
  updateCustomer,
  updateSupplier,
} from "./partners";
import {
  createLocation,
  createSite,
  deleteLocation,
  deleteSite,
  listLocations,
  listSites,
  updateLocation,
  updateSite,
} from "./places";

const ctx = createTestContext();

afterAll(ctx.close);

let actor: Actor;

beforeEach(async () => {
  await resetAuthTables();
  await resetCatalogTables();
  actor = await createTestUser(ctx, { role: "SALES", username: "quocbao" });
});

async function customerId(name = "Cty TNHH Xây dựng Minh Phát") {
  const result = await createCustomer(ctx.db, actor, { kind: "COMPANY", name });
  if (!result.ok) throw new Error(result.error);
  return result.data.id;
}

async function siteFor(
  owner: string,
  name = "Chung cư An Phú – Block B",
  province = "HN",
) {
  const result = await createSite(ctx.db, actor, {
    name,
    address: "Hoài Đức, Hà Nội",
    province,
    customerId: owner,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

describe("customers", () => {
  it("numbers NT-0001, NT-0002 and never reuses a deleted number", async () => {
    const first = await createCustomer(ctx.db, actor, {
      kind: "COMPANY",
      name: "Minh Phát",
    });
    const second = await createCustomer(ctx.db, actor, {
      kind: "COMPANY",
      name: "Sông Hồng",
    });
    expect(first).toMatchObject({ ok: true, data: { code: "NT-0001" } });
    expect(second).toMatchObject({ ok: true, data: { code: "NT-0002" } });
    if (second.ok) await deleteCustomer(ctx.db, actor, second.data.id);
    const third = await createCustomer(ctx.db, actor, {
      kind: "PERSON",
      name: "Anh Hùng",
    });
    expect(third).toMatchObject({ ok: true, data: { code: "NT-0003" } });
  });

  it("gives two concurrent creations two codes", async () => {
    const results = await Promise.all(
      ["A", "B", "C"].map((name) =>
        createCustomer(ctx.db, actor, { kind: "COMPANY", name }),
      ),
    );
    const codes = results.map((result) => (result.ok ? result.data.code : ""));
    expect(new Set(codes).size).toBe(3);
  });

  it("stores contact details with a 30-day default term", async () => {
    const result = await createCustomer(ctx.db, actor, {
      kind: "COMPANY",
      name: "Cty TNHH Xây dựng Minh Phát",
      taxCode: "0109876543",
      contactName: "Anh Đỗ Mạnh · chỉ huy trưởng",
      phone: "0912.345.678",
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        paymentTermsDays: 30,
        phone: "0912345678",
        taxCode: "0109876543",
      },
    });
  });

  it("explains a bad tax code, phone and term", async () => {
    const attempt = (extra: object) =>
      createCustomer(ctx.db, actor, { kind: "COMPANY", name: "X", ...extra });
    expect(await attempt({ taxCode: "01098765" })).toMatchObject({
      status: 400,
      error: "Mã số thuế gồm 10 chữ số, hoặc 10 chữ số kèm -XXX cho chi nhánh",
    });
    expect(await attempt({ phone: "091234567" })).toMatchObject({
      error: "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0",
    });
    expect(await attempt({ paymentTermsDays: 400 })).toMatchObject({
      error: "Hạn thanh toán từ 0 đến 365 ngày",
    });
    expect(await attempt({ paymentTermsDays: -1 })).toMatchObject({
      status: 400,
    });
  });

  it("finds a customer by part of the phone typed with spaces", async () => {
    await createCustomer(ctx.db, actor, {
      kind: "PERSON",
      name: "Anh Trần Văn Hùng (cai thầu)",
      phone: "0912345678",
    });
    expect(await listCustomers(ctx.db, { q: "0912 345" })).toHaveLength(1);
    expect(await listCustomers(ctx.db, { q: "tran van hung" })).toHaveLength(1);
  });

  it("counts active sites and refuses archiving while one is active", async () => {
    const owner = await customerId();
    const place = await siteFor(owner);
    expect((await listCustomers(ctx.db))[0]?.siteCount).toBe(1);
    expect(
      await updateCustomer(ctx.db, actor, owner, { status: "ARCHIVED" }),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Ngừng dùng các công trình của nhà thầu này trước",
    });
    await updateSite(ctx.db, actor, place.id, { status: "ARCHIVED" });
    expect(
      await updateCustomer(ctx.db, actor, owner, { status: "ARCHIVED" }),
    ).toMatchObject({ ok: true, data: { status: "ARCHIVED" } });
  });

  it("will not delete a customer with a site, even an archived one", async () => {
    const owner = await customerId();
    const place = await siteFor(owner);
    await updateSite(ctx.db, actor, place.id, { status: "ARCHIVED" });
    expect(await deleteCustomer(ctx.db, actor, owner)).toEqual({
      ok: false,
      status: 409,
      error: "Nhà thầu đã được dùng nên chỉ ngừng dùng được",
    });
  });

  it("changes the payment term for new contracts", async () => {
    const owner = await customerId();
    expect(
      await updateCustomer(ctx.db, actor, owner, { paymentTermsDays: 45 }),
    ).toMatchObject({ ok: true, data: { paymentTermsDays: 45 } });
  });
});

describe("suppliers", () => {
  it("creates a person with a name only", async () => {
    expect(
      await createSupplier(ctx.db, actor, {
        kind: "PERSON",
        name: "Chú Ba ve chai",
      }),
    ).toMatchObject({
      ok: true,
      data: { code: "NCC-0001", idNumberMasked: null },
    });
  });

  it("refuses a 10-digit CCCD", async () => {
    expect(
      await createSupplier(ctx.db, actor, {
        kind: "PERSON",
        name: "Chú Ba",
        idNumber: "0012030123",
      }),
    ).toMatchObject({ status: 400, error: "Số CCCD gồm 12 chữ số" });
  });

  it("lists the CCCD masked; only the edit read has it in full", async () => {
    const created = await createSupplier(ctx.db, actor, {
      kind: "PERSON",
      name: "Chú Ba ve chai",
      idNumber: "001203012345",
      dataNoticeConfirmed: true,
    });
    const id = created.ok ? created.data.id : "";
    const listed = await listSuppliers(ctx.db);
    expect(listed[0]?.idNumberMasked).toBe("•••• •••• 2345");
    expect(JSON.stringify(listed)).not.toContain("001203012345");
    expect(JSON.stringify(created)).not.toContain("001203012345");
    expect(await getSupplierForEdit(ctx.db, id)).toMatchObject({
      data: { idNumber: "001203012345" },
    });
    // The CCCD is not searchable.
    expect(await listSuppliers(ctx.db, { q: "001203" })).toHaveLength(0);
  });

  it("keeps only the last 4 digits of the account, not searchable", async () => {
    await createSupplier(ctx.db, actor, {
      kind: "PERSON",
      name: "Chú Ba ve chai",
      bankAccountLast4: "5678",
      bankName: "Vietcombank",
      dataNoticeConfirmed: true,
    });
    const listed = await listSuppliers(ctx.db);
    expect(listed[0]).toMatchObject({
      bankAccountLast4: "5678",
      bankName: "Vietcombank",
    });
    expect(await listSuppliers(ctx.db, { q: "5678" })).toHaveLength(0);
  });

  it("keeps the CCCD when an edit leaves it out, archives and deletes", async () => {
    const created = await createSupplier(ctx.db, actor, {
      kind: "PERSON",
      name: "Chú Ba",
      idNumber: "001203012345",
      dataNoticeConfirmed: true,
    });
    const id = created.ok ? created.data.id : "";
    await updateSupplier(ctx.db, actor, id, { phone: "0987654321" });
    expect(await getSupplierForEdit(ctx.db, id)).toMatchObject({
      data: { idNumber: "001203012345" },
    });
    await updateSupplier(ctx.db, actor, id, { status: "ARCHIVED" });
    expect(await listSuppliers(ctx.db)).toHaveLength(0);
    expect(await deleteSupplier(ctx.db, actor, id)).toEqual({
      ok: true,
      data: null,
    });
  });
});

describe("supplier payment terms (payables, 0.2 #99)", () => {
  it("is 0 days when not given and logs a change", async () => {
    const created = await createSupplier(ctx.db, actor, {
      kind: "COMPANY",
      name: "Cty TNHH Vật tư Hưng Thịnh",
    });
    expect(created).toMatchObject({ ok: true, data: { paymentTermsDays: 0 } });
    const id = created.ok ? created.data.id : "";
    const updated = await updateSupplier(ctx.db, actor, id, {
      paymentTermsDays: 30,
    });
    expect(updated).toMatchObject({ ok: true, data: { paymentTermsDays: 30 } });
    const log = await lastActivity(ctx.db);
    expect(log?.changes).toContainEqual(
      expect.objectContaining({
        field: "paymentTermsDays",
        before: "0 ngày",
        after: "30 ngày",
      }),
    );
    // An edit that leaves it out keeps it.
    await updateSupplier(ctx.db, actor, id, { phone: "0987654321" });
    expect(await getSupplierForEdit(ctx.db, id)).toMatchObject({
      data: { paymentTermsDays: 30 },
    });
  });

  it.each([400, -1, 1.5])("refuses %s days", async (days) => {
    expect(
      await createSupplier(ctx.db, actor, {
        kind: "PERSON",
        name: "Chú Ba",
        paymentTermsDays: days,
      }),
    ).toMatchObject({
      ok: false,
      error: "Số ngày được nợ từ 0 đến 365 ngày",
    });
  });
});

describe("sites", () => {
  it("creates CT-0001 with its SITE location", async () => {
    const owner = await customerId();
    const place = await siteFor(owner);
    expect(place).toMatchObject({ code: "CT-0001", customerId: owner });
    const [spot] = await ctx.db
      .select()
      .from(location)
      .where(eq(location.id, place.locationId));
    expect(spot).toMatchObject({
      code: "CT-0001",
      type: "SITE",
      name: "Chung cư An Phú – Block B",
    });
  });

  it("leaves nothing behind when the location cannot be created", async () => {
    const owner = await customerId();
    // Take the code the next site will get, so its location insert fails.
    await ctx.db
      .insert(location)
      .values({ code: "CT-0001", name: "Chiếm chỗ", type: "YARD" });
    await expect(
      createSite(ctx.db, actor, {
        name: "An Phú",
        province: "HN",
        customerId: owner,
      }),
    ).rejects.toThrow();
    expect(await ctx.db.select().from(site)).toHaveLength(0);
  });

  it("refuses an archived customer and a change of customer", async () => {
    const owner = await customerId();
    const place = await siteFor(owner);
    const otherOwner = await customerId("Sông Hồng");
    expect(
      await updateSite(ctx.db, actor, place.id, { customerId: otherOwner }),
    ).toEqual({
      ok: false,
      status: 400,
      error: "Không đổi được nhà thầu của công trình",
    });
    await updateCustomer(ctx.db, actor, otherOwner, { status: "ARCHIVED" });
    expect(
      await createSite(ctx.db, actor, {
        name: "X",
        province: "HN",
        customerId: otherOwner,
      }),
    ).toMatchObject({ ok: false, error: "Nhà thầu này đã ngừng dùng" });
  });

  it("renames and archives the location with the site", async () => {
    const owner = await customerId();
    const place = await siteFor(owner);
    await updateSite(ctx.db, actor, place.id, {
      name: "An Phú – Block B (giai đoạn 2)",
    });
    await updateSite(ctx.db, actor, place.id, { status: "ARCHIVED" });
    const [spot] = await ctx.db
      .select()
      .from(location)
      .where(eq(location.id, place.locationId));
    expect(spot).toMatchObject({
      name: "An Phú – Block B (giai đoạn 2)",
      status: "ARCHIVED",
    });
  });

  it("will not bring back a site whose customer is archived", async () => {
    const owner = await customerId();
    const place = await siteFor(owner);
    await updateSite(ctx.db, actor, place.id, { status: "ARCHIVED" });
    await updateCustomer(ctx.db, actor, owner, { status: "ARCHIVED" });
    expect(
      await updateSite(ctx.db, actor, place.id, { status: "ACTIVE" }),
    ).toMatchObject({
      ok: false,
      status: 409,
      error: "Dùng lại nhà thầu của công trình này trước",
    });
  });

  it("deletes a site created by mistake with its location", async () => {
    const owner = await customerId();
    const place = await siteFor(owner);
    expect(await deleteSite(ctx.db, actor, place.id)).toEqual({
      ok: true,
      data: null,
    });
    expect(await listSites(ctx.db)).toHaveLength(0);
    expect(
      await ctx.db.select().from(location).where(eq(location.type, "SITE")),
    ).toHaveLength(0);
  });
});

describe("locations", () => {
  it("adds a second yard, refuses a SITE by hand", async () => {
    expect(
      await createLocation(ctx.db, actor, {
        code: "bai-02",
        name: "Bãi Hoài Đức",
        type: "YARD",
      }),
    ).toMatchObject({ ok: true, data: { code: "BAI-02", type: "YARD" } });
    expect(
      await createLocation(ctx.db, actor, {
        code: "CT-9",
        name: "X",
        type: "SITE",
      }),
    ).toMatchObject({
      status: 400,
      error: "Vị trí công trình được tạo khi thêm công trình",
    });
    expect(await listLocations(ctx.db, { type: "YARD" })).toHaveLength(2);
  });

  it("keeps the last active yard", async () => {
    const [yard] = await listLocations(ctx.db, { type: "YARD" });
    expect(
      await updateLocation(ctx.db, actor, yard?.id ?? "", {
        status: "ARCHIVED",
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Phải còn ít nhất một bãi đang dùng",
    });
    expect(await deleteLocation(ctx.db, actor, yard?.id ?? "")).toMatchObject({
      status: 409,
    });
  });

  it("archives a yard when another one remains", async () => {
    const second = await createLocation(ctx.db, actor, {
      code: "BAI-02",
      name: "Bãi 2",
      type: "YARD",
    });
    expect(
      await updateLocation(ctx.db, actor, second.ok ? second.data.id : "", {
        status: "ARCHIVED",
      }),
    ).toMatchObject({ ok: true, data: { status: "ARCHIVED" } });
  });

  it("sends SITE locations to the site instead", async () => {
    const owner = await customerId();
    const place = await siteFor(owner);
    expect(
      await updateLocation(ctx.db, actor, place.locationId, { name: "X" }),
    ).toMatchObject({ status: 400, error: "Sửa công trình để đổi vị trí này" });
  });
});

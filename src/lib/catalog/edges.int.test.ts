// Edge paths of the catalog services: missing rows, fixed codes, the sample
// seed, and rules that only show up when restoring.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { item, kit, site, supplier } from "@/db/schema";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
} from "@/test/auth";
import { resetCatalogTables } from "@/test/catalog";

import type { Actor } from "./common";
import { createGroup, deleteGroup, updateGroup } from "./item-groups";
import { createItem, deleteItem, updateItem } from "./items";
import { createKit, deleteKit, listKits, updateKit } from "./kits";
import {
  createCustomer,
  deleteCustomer,
  deleteSupplier,
  getSupplierForEdit,
  updateCustomer,
  updateSupplier,
} from "./partners";
import {
  createLocation,
  createSite,
  deleteLocation,
  deleteSite,
  listLocations,
  updateLocation,
  updateSite,
} from "./places";
import { seedCatalog } from "./seed";

const ctx = createTestContext();

afterAll(ctx.close);

const MISSING = "00000000-0000-0000-0000-000000000000";
const notFound = { ok: false, status: 404, error: "Không tìm thấy bản ghi" };

let actor: Actor;

beforeEach(async () => {
  await resetAuthTables();
  await resetCatalogTables();
  actor = await createTestUser(ctx, { role: "DIRECTOR", username: "minhanh" });
});

describe("seedCatalog", () => {
  it("creates the D9/D16 sample once", async () => {
    const first = await seedCatalog(ctx.db, actor);
    expect(first).toBeGreaterThan(0);
    expect(await seedCatalog(ctx.db, actor)).toBe(0);
    expect(await ctx.db.select().from(item)).toHaveLength(8);
    expect(await ctx.db.select().from(kit)).toHaveLength(1);
    expect(await ctx.db.select().from(site)).toHaveLength(2);
    expect(await ctx.db.select().from(supplier)).toHaveLength(2);
    const [set] = await listKits(ctx.db);
    expect(set).toMatchObject({
      code: "BO-17",
      weightMilli: 43_600,
      rentalPerDay: 3900,
    });
  });
});

describe("missing rows answer 404", () => {
  it("for every update and delete", async () => {
    expect(await updateGroup(ctx.db, actor, MISSING, { name: "X" })).toEqual(
      notFound,
    );
    expect(await deleteGroup(ctx.db, actor, MISSING)).toEqual(notFound);
    expect(await updateItem(ctx.db, actor, MISSING, { name: "X" })).toEqual(
      notFound,
    );
    expect(await deleteItem(ctx.db, actor, MISSING)).toEqual(notFound);
    expect(await updateKit(ctx.db, actor, MISSING, { name: "X" })).toEqual(
      notFound,
    );
    expect(await deleteKit(ctx.db, actor, MISSING)).toEqual(notFound);
    expect(await updateCustomer(ctx.db, actor, MISSING, { name: "X" })).toEqual(
      notFound,
    );
    expect(await deleteCustomer(ctx.db, actor, MISSING)).toEqual(notFound);
    expect(await updateSupplier(ctx.db, actor, MISSING, { name: "X" })).toEqual(
      notFound,
    );
    expect(await deleteSupplier(ctx.db, actor, MISSING)).toEqual(notFound);
    expect(await getSupplierForEdit(ctx.db, MISSING)).toBeNull();
    expect(await updateSite(ctx.db, actor, MISSING, { name: "X" })).toEqual(
      notFound,
    );
    expect(await deleteSite(ctx.db, actor, MISSING)).toEqual(notFound);
    expect(await updateLocation(ctx.db, actor, MISSING, { name: "X" })).toEqual(
      notFound,
    );
    expect(await deleteLocation(ctx.db, actor, MISSING)).toEqual(notFound);
  });
});

describe("groups and items", () => {
  it("renames a group onto a taken name: 409", async () => {
    await createGroup(ctx.db, actor, { name: "Giàn giáo" });
    const other = await createGroup(ctx.db, actor, { name: "Phụ kiện" });
    expect(
      await updateGroup(ctx.db, actor, other.ok ? other.data.id : "", {
        name: "GIÀN GIÁO",
      }),
    ).toMatchObject({ status: 409, error: "Tên nhóm đã có" });
    expect(await createGroup(ctx.db, actor, { name: " " })).toMatchObject({
      status: 400,
      error: "Nhập tên",
    });
  });

  it("refuses an archived or missing group and an unknown unit", async () => {
    const group = await createGroup(ctx.db, actor, { name: "Cũ" });
    const groupId = group.ok ? group.data.id : "";
    await updateGroup(ctx.db, actor, groupId, { status: "ARCHIVED" });
    const base = {
      code: "AB-1",
      name: "X",
      unit: "PIECE" as const,
      standardWeightKg: "1",
    };
    expect(await createItem(ctx.db, actor, { ...base, groupId })).toMatchObject(
      {
        status: 400,
        error: "Nhóm hàng này đã ngừng dùng",
      },
    );
    expect(
      await createItem(ctx.db, actor, { ...base, groupId: MISSING }),
    ).toMatchObject({
      error: "Chọn nhóm hàng",
    });
    expect(
      await createItem(ctx.db, actor, {
        ...base,
        groupId,
        unit: "BOX" as never,
      }),
    ).toMatchObject({ error: "Chọn đơn vị cái hoặc kg" });
  });

  it("refuses a kg item with a weight and a negative price", async () => {
    const group = await createGroup(ctx.db, actor, { name: "Phế liệu" });
    const groupId = group.ok ? group.data.id : "";
    expect(
      await createItem(ctx.db, actor, {
        code: "PL-1",
        name: "Sắt",
        groupId,
        unit: "KG",
        standardWeightKg: "1",
      }),
    ).toMatchObject({
      error: "Vật tư tính theo kg không có trọng lượng chuẩn",
    });
    expect(
      await createItem(ctx.db, actor, {
        code: "AB-1",
        name: "X",
        groupId,
        unit: "PIECE",
        standardWeightKg: "1",
        lostPrice: -5,
      }),
    ).toMatchObject({ error: "Giá không được âm" });
    expect(
      await createItem(ctx.db, actor, {
        code: "AB-2",
        name: "X",
        groupId,
        unit: "PIECE",
        standardWeightKg: "99999999",
      }),
    ).toMatchObject({ error: "Trọng lượng chuẩn quá lớn" });
  });
});

describe("kits", () => {
  it("keeps the kit code and re-checks parts when coming back", async () => {
    await seedCatalog(ctx.db, actor);
    const [set] = await listKits(ctx.db);
    const id = set?.id ?? "";
    expect(await updateKit(ctx.db, actor, id, { code: "BO-18" })).toMatchObject(
      {
        status: 400,
        error: "Không đổi được mã bộ sau khi tạo",
      },
    );
    await updateKit(ctx.db, actor, id, { status: "ARCHIVED" });
    const ch = set?.components.find((part) => part.code === "GG-CH");
    await updateItem(ctx.db, actor, ch?.itemId ?? "", { status: "ARCHIVED" });
    expect(
      await updateKit(ctx.db, actor, id, { status: "ACTIVE" }),
    ).toMatchObject({
      status: 400,
      error: "Vật tư GG-CH đã ngừng dùng",
    });
    expect(
      await createKit(ctx.db, actor, {
        code: "BO-X",
        name: "X",
        components: [{ itemId: MISSING, quantity: 2 }],
      }),
    ).toMatchObject({ status: 400, error: "Không tìm thấy vật tư trong bộ" });
  });
});

describe("sites and locations", () => {
  it("needs a customer, keeps location codes, refuses SITE rows and duplicates", async () => {
    expect(await createSite(ctx.db, actor, { name: "X" })).toMatchObject({
      status: 400,
      error: "Chọn nhà thầu của công trình",
    });
    const [yard] = await listLocations(ctx.db, { type: "YARD" });
    expect(
      await updateLocation(ctx.db, actor, yard?.id ?? "", { code: "BAI-09" }),
    ).toMatchObject({ status: 400, error: "Không đổi được mã sau khi tạo" });
    expect(
      await createLocation(ctx.db, actor, {
        code: "BAI-01",
        name: "Trùng",
        type: "YARD",
      }),
    ).toMatchObject({ status: 409, error: "Mã này đã được dùng" });
    expect(
      await createLocation(ctx.db, actor, {
        code: "KHO-1",
        name: "X",
        type: "HALL",
      }),
    ).toMatchObject({ status: 400, error: "Chọn loại bãi hoặc xưởng" });

    const owner = await createCustomer(ctx.db, actor, {
      kind: "COMPANY",
      name: "Minh Phát",
    });
    const place = await createSite(ctx.db, actor, {
      name: "An Phú",
      customerId: owner.ok ? owner.data.id : "",
    });
    expect(
      await deleteLocation(
        ctx.db,
        actor,
        place.ok ? place.data.locationId : "",
      ),
    ).toMatchObject({ status: 400, error: "Sửa công trình để đổi vị trí này" });
  });

  it("deletes a spare workshop", async () => {
    const spare = await createLocation(ctx.db, actor, {
      code: "XUONG-02",
      name: "Xưởng 2",
      type: "WORKSHOP",
    });
    expect(
      await deleteLocation(ctx.db, actor, spare.ok ? spare.data.id : ""),
    ).toEqual({
      ok: true,
      data: null,
    });
  });
});

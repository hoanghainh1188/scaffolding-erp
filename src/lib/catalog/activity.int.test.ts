// Catalog writes in the activity log (activity-log tasks 5.1).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { activityRows, activityTrail, lastActivity } from "@/test/activity";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
  type TestUser,
} from "@/test/auth";
import { resetCatalogTables } from "@/test/catalog";

import { createGroup, deleteGroup, updateGroup } from "./item-groups";
import { createItem, deleteItem, updateItem } from "./items";
import { createKit, deleteKit, updateKit } from "./kits";
import {
  createCustomer,
  createSupplier,
  deleteCustomer,
  deleteSupplier,
  updateCustomer,
  updateSupplier,
} from "./partners";
import {
  createLocation,
  createSite,
  deleteLocation,
  deleteSite,
  updateLocation,
  updateSite,
} from "./places";

const ctx = createTestContext();
afterAll(ctx.close);

let lanphuong: TestUser;
let director: TestUser;

beforeEach(async () => {
  await resetAuthTables();
  await resetCatalogTables();
  lanphuong = await createTestUser(ctx, {
    role: "SALES",
    username: "lanphuong",
  });
  director = await createTestUser(ctx, {
    role: "DIRECTOR",
    username: "minhanh",
  });
});

const SUPPLIER = {
  kind: "PERSON",
  name: "Anh Tư – Bình Dương",
  phone: "0903123456",
  idNumber: "001203012345",
  bankAccountLast4: "1234",
  bankName: "Vietcombank",
  dataNoticeConfirmed: true,
};

async function supplierNcc() {
  const created = await createSupplier(ctx.db, lanphuong, SUPPLIER);
  if (!created.ok) throw new Error(created.error);
  return created.data;
}

describe("suppliers", () => {
  it("logs the creation with the actor's role and device", async () => {
    const ncc = await supplierNcc();
    expect(await lastActivity(ctx.db, ncc.code)).toMatchObject({
      action: "CREATE",
      documentType: "SUPPLIER",
      documentId: ncc.id,
      role: "SALES",
      device: "DESKTOP",
      summary: `${ncc.code} · Ghi nhận thông báo phiên bản 1`,
    });
  });

  it("writes nothing when an edit changes nothing", async () => {
    const ncc = await supplierNcc();
    const saved = await updateSupplier(ctx.db, lanphuong, ncc.id, SUPPLIER);
    expect(saved.ok).toBe(true);
    expect(await activityTrail(ctx.db, ncc.code)).toEqual([
      `CREATE ${ncc.code}`,
    ]);
  });

  it("records only the field that changed", async () => {
    const ncc = await supplierNcc();
    await updateSupplier(ctx.db, lanphuong, ncc.id, {
      ...SUPPLIER,
      phone: "0903123457",
    });
    const row = await lastActivity(ctx.db, ncc.code);
    expect(row?.changes).toEqual([
      {
        field: "phone",
        label: "Điện thoại",
        before: null,
        after: "(đã đổi)",
      },
    ]);
    expect(row?.flags).not.toContain("SENSITIVE");
  });

  it("masks the bank account and flags it sensitive", async () => {
    const ncc = await supplierNcc();
    await updateSupplier(ctx.db, lanphuong, ncc.id, {
      ...SUPPLIER,
      bankAccountLast4: "5678",
    });
    const row = await lastActivity(ctx.db, ncc.code);
    expect(row?.action).toBe("UPDATE");
    expect(row?.summary).toBe("Số tài khoản: •••• 1234 → •••• 5678");
    expect(row?.flags).toContain("SENSITIVE");
    const all = JSON.stringify(await activityRows(ctx.db));
    expect(all).not.toContain("001203012345");
    expect(all).not.toContain("Anh Tư");
    expect(all).not.toContain("0903123456");
  });

  it("a name change carries no flag but off hours", async () => {
    const ncc = await supplierNcc();
    await updateSupplier(ctx.db, lanphuong, ncc.id, {
      ...SUPPLIER,
      name: "Anh Tư",
    });
    const row = await lastActivity(ctx.db, ncc.code);
    expect(row?.flags.filter((flag) => flag !== "OFF_HOURS")).toEqual([]);
  });

  it("logs a delete, and nothing when the delete is refused", async () => {
    const ncc = await supplierNcc();
    await deleteSupplier(ctx.db, lanphuong, ncc.id);
    expect(await activityTrail(ctx.db, ncc.code)).toEqual([
      `CREATE ${ncc.code}`,
      `DELETE ${ncc.code}`,
    ]);
  });
});

describe("customers and sites", () => {
  it("logs create, edit, archive and a refused delete", async () => {
    const created = await createCustomer(ctx.db, lanphuong, {
      kind: "COMPANY",
      name: "Minh Phát",
      contactName: "Anh Hùng",
    });
    if (!created.ok) throw new Error(created.error);
    const owner = created.data;
    const place = await createSite(ctx.db, lanphuong, {
      province: "HN",
      name: "An Phú – Block B",
      address: "Hoài Đức",
      customerId: owner.id,
    });
    if (!place.ok) throw new Error(place.error);
    await updateCustomer(ctx.db, lanphuong, owner.id, {
      paymentTermsDays: 45,
    });
    await updateSite(ctx.db, director, place.data.id, { status: "ARCHIVED" });
    // The site still refers to the customer: refused, so no DELETE row.
    expect((await deleteCustomer(ctx.db, lanphuong, owner.id)).ok).toBe(false);

    expect(await activityTrail(ctx.db, owner.code)).toEqual([
      `CREATE ${owner.code}`,
      `UPDATE ${owner.code}`,
    ]);
    expect((await lastActivity(ctx.db, owner.code))?.changes).toEqual([
      {
        field: "paymentTermsDays",
        label: "Hạn thanh toán mặc định",
        before: "30 ngày",
        after: "45 ngày",
      },
    ]);
    expect((await lastActivity(ctx.db, place.data.code))?.changes).toEqual([
      {
        field: "status",
        label: "Trạng thái",
        before: "Đang dùng",
        after: "Ngừng dùng",
      },
    ]);
    await deleteSite(ctx.db, director, place.data.id);
    expect((await lastActivity(ctx.db, place.data.code))?.action).toBe(
      "DELETE",
    );
  });

  it("logs yards and workshops", async () => {
    const spare = await createLocation(ctx.db, director, {
      code: "BAI-09",
      name: "Bãi phụ",
      type: "YARD",
    });
    if (!spare.ok) throw new Error(spare.error);
    await updateLocation(ctx.db, director, spare.data.id, { name: "Bãi 9" });
    await deleteLocation(ctx.db, director, spare.data.id);
    expect(await activityTrail(ctx.db, "BAI-09")).toEqual([
      "CREATE BAI-09",
      "UPDATE BAI-09",
      "DELETE BAI-09",
    ]);
    expect((await activityRows(ctx.db, "BAI-09"))[0]?.summary).toBe(
      "Bãi phụ · Bãi",
    );
  });
});

describe("items, groups and kits", () => {
  it("logs each write with the right code", async () => {
    const group = await createGroup(ctx.db, director, { name: "Giàn giáo" });
    if (!group.ok) throw new Error(group.error);
    const frame = await createItem(ctx.db, director, {
      code: "GG-K17",
      name: "Khung 1,7m",
      groupId: group.data.id,
      unit: "PIECE",
      standardWeightKg: "13.5",
    });
    const brace = await createItem(ctx.db, director, {
      code: "GG-CH",
      name: "Giằng chéo",
      groupId: group.data.id,
      unit: "PIECE",
      standardWeightKg: "3",
    });
    if (!frame.ok || !brace.ok) throw new Error("items");
    await updateItem(ctx.db, director, frame.data.id, {
      dailyRentalPrice: 1_200,
    });
    const set = await createKit(ctx.db, director, {
      code: "BO-17",
      name: "Bộ khung 1,7m",
      components: [{ itemId: frame.data.id, quantity: 2 }],
    });
    if (!set.ok) throw new Error(set.error);
    await updateKit(ctx.db, director, set.data.id, {
      components: [
        { itemId: frame.data.id, quantity: 4 },
        { itemId: brace.data.id, quantity: 2 },
      ],
    });
    // Nothing changes: no row.
    await updateGroup(ctx.db, director, group.data.id, { name: "Giàn giáo" });

    expect((await lastActivity(ctx.db, "GG-K17"))?.changes).toEqual([
      {
        field: "dailyRentalPrice",
        label: "Giá thuê / ngày",
        before: null,
        after: "1.200 ₫",
      },
    ]);
    expect((await lastActivity(ctx.db, "BO-17"))?.changes).toEqual([
      {
        field: "components.GG-K17.quantity",
        label: "Số lượng GG-K17",
        before: "2 cái",
        after: "4 cái",
      },
      {
        field: "components.GG-CH",
        label: "Dòng GG-CH",
        before: null,
        after: "2 cái",
      },
    ]);
    expect(await activityTrail(ctx.db, "Giàn giáo")).toEqual([
      "CREATE Giàn giáo",
    ]);

    await deleteKit(ctx.db, director, set.data.id);
    await deleteItem(ctx.db, director, brace.data.id);
    await deleteGroup(ctx.db, director, group.data.id); // in use: refused
    expect(await activityTrail(ctx.db)).toEqual([
      "CREATE Giàn giáo",
      "CREATE GG-K17",
      "CREATE GG-CH",
      "UPDATE GG-K17",
      "CREATE BO-17",
      "UPDATE BO-17",
      "DELETE BO-17",
      "DELETE GG-CH",
    ]);
  });
});

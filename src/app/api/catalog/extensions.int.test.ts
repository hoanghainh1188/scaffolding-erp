// catalog-extensions (09): real codes, old codes, 9 units, categories,
// site provinces and sales staff, through the services and the API.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { customer, user } from "@/db/schema";
import { createGroup, updateGroup } from "@/lib/catalog/item-groups";
import {
  createItem,
  deleteItem,
  getItem,
  listItems,
  updateItem,
  type ItemInput,
} from "@/lib/catalog/items";
import { createKit } from "@/lib/catalog/kits";
import {
  createCustomer,
  listCustomers,
  updateCustomer,
} from "@/lib/catalog/partners";
import { createSite, listSites, updateSite } from "@/lib/catalog/places";
import { lastActivity } from "@/test/activity";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  resetAuthTables,
  signInAs,
  type TestUser,
} from "@/test/auth";
import { getAdminDatabase } from "@/test/admin";
import { resetCatalogTables } from "@/test/catalog";

import * as lookup from "../stock/lookup/route";
import * as customerOne from "./customers/[id]/route";
import * as customers from "./customers/route";
import * as itemOne from "./items/[id]/route";
import * as items from "./items/route";
import * as salesStaff from "./sales-staff/route";
import * as sites from "./sites/route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);

afterAll(async () => {
  uninstall();
  await ctx.close();
});

let director: TestUser;
let equipment = "";

beforeEach(async () => {
  await resetAuthTables();
  await resetCatalogTables();
  director = await createTestUser(ctx, {
    role: "DIRECTOR",
    username: "giamdoc",
    name: "Giám đốc",
  });
  equipment = await group("Giàn giáo");
});

async function group(name: string, category?: string): Promise<string> {
  const result = await createGroup(ctx.db, director, { name, category });
  if (!result.ok) throw new Error(result.error);
  return result.data.id;
}

async function newItem(input: ItemInput) {
  const result = await createItem(ctx.db, director, {
    groupId: equipment,
    name: input.code ?? "Vật tư",
    unit: "PIECE",
    standardWeightKg: "13.2",
    ...input,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe("4.1 real codes and units", () => {
  it("stores the company's codes as typed", async () => {
    for (const code of ["h1,7", "H1,7KĐ", "kb+ku34", "nối  34"]) {
      await newItem({ code });
    }
    const { items: rows } = await listItems(ctx.db);
    expect(rows.map((row) => row.code).sort()).toEqual(
      ["H1,7", "H1,7KĐ", "KB+KU34", "NỐI 34"].sort(),
    );
  });

  it("refuses NOI34 next to NỐI 34 and BO-17 next to a kit", async () => {
    const joint = await newItem({ code: "NỐI 34" });
    expect(
      await createItem(ctx.db, director, {
        code: "NOI34",
        name: "Nối",
        groupId: equipment,
        unit: "PIECE",
        standardWeightKg: "1",
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Mã gần giống mã NỐI 34 đã có",
    });
    const second = await newItem({ code: "KU0,5" });
    await createKit(ctx.db, director, {
      code: "BO-17",
      name: "Bộ",
      components: [
        { itemId: joint.id, quantity: 1 },
        { itemId: second.id, quantity: 1 },
      ],
    });
    expect(
      await createItem(ctx.db, director, {
        code: "bo-17",
        name: "X",
        groupId: equipment,
        unit: "PIECE",
        standardWeightKg: "1",
      }),
    ).toMatchObject({ status: 409, error: "Mã này đã được dùng" });
  });

  it("saves a metre item with its unit, weight and rent", async () => {
    const pipe = await newItem({
      code: "ONG-49",
      name: "Thép ống D49",
      unit: "METER",
      standardWeightKg: "3.56",
      dailyRentalPrice: 150,
    });
    const read = await getItem(ctx.db, pipe.id);
    expect(read).toMatchObject({
      unit: "METER",
      unitLabel: "m",
      standardWeightKg: "3.560",
      dailyRentalPrice: 150,
    });
    const scrap = await newItem({
      code: "PL-TON",
      unit: "KG",
      standardWeightKg: null,
      dailyRentalPrice: 40,
    });
    expect(scrap).toMatchObject({
      unit: "KG",
      unitLabel: "kg",
      dailyRentalPrice: 40,
    });
  });

  it("refuses a metre item with no weight", async () => {
    expect(
      await createItem(ctx.db, director, {
        code: "ONG-49",
        name: "Thép ống",
        groupId: equipment,
        unit: "METER",
        standardWeightKg: null,
      }),
    ).toMatchObject({
      status: 400,
      error: "Nhập trọng lượng chuẩn lớn hơn 0 kg",
    });
  });
});

describe("4.2 old codes", () => {
  it("finds an item by its old code in the API search", async () => {
    const frame = await newItem({ code: "GG-K17", name: "Khung 1,7m" });
    await updateItem(ctx.db, director, frame.id, {
      aliases: ["k1,7", "khung 1m7"],
    });
    expect((await lastActivity(ctx.db, "GG-K17"))?.summary).toBe(
      "Mã cũ thêm K1,7, KHUNG 1M7",
    );
    const cookie = await signInAs(ctx, director);
    const { status, body } = await json(
      await items.GET(
        appRequest(`/api/catalog/items?q=${encodeURIComponent("k1,7")}`, {
          cookie,
        }),
      ),
    );
    expect(status).toBe(200);
    expect(
      body.data.items.map((row: { code: string; aliases: string[] }) => [
        row.code,
        row.aliases,
      ]),
    ).toEqual([["GG-K17", ["K1,7", "KHUNG 1M7"]]]);
  });

  it("refuses an old code that is another item's code", async () => {
    await newItem({ code: "H1,7" });
    const frame = await newItem({ code: "GG-K17" });
    expect(
      await updateItem(ctx.db, director, frame.id, { aliases: ["H1,7"] }),
    ).toMatchObject({
      status: 409,
      error: "Mã H1,7 đã là mã của vật tư khác",
    });
    expect((await getItem(ctx.db, frame.id))?.aliases).toEqual([]);
  });

  it("refuses a new item whose code is an old code", async () => {
    await newItem({ code: "GG-K17", aliases: ["K1,7"] });
    expect(
      await createItem(ctx.db, director, {
        code: "K1,7",
        name: "Khung",
        groupId: equipment,
        unit: "PIECE",
        standardWeightKg: "1",
      }),
    ).toMatchObject({
      status: 409,
      error: "Mã K1,7 đang là mã cũ của GG-K17",
    });
  });

  it("allows at most 5 old codes", async () => {
    const frame = await newItem({
      code: "GG-K17",
      aliases: ["A1", "A2", "A3", "A4", "A5"],
    });
    expect(
      await updateItem(ctx.db, director, frame.id, {
        aliases: ["A1", "A2", "A3", "A4", "A5", "A6"],
      }),
    ).toMatchObject({
      status: 400,
      error: "Mỗi vật tư có tối đa 5 mã cũ",
    });
  });

  it("refuses old codes from an accountant", async () => {
    const frame = await newItem({ code: "GG-K17" });
    const thuha = await createTestUser(ctx, {
      role: "ACCOUNTANT",
      username: "thuha",
    });
    const response = await itemOne.PATCH(
      appRequest(`/api/catalog/items/${frame.id}`, {
        method: "PATCH",
        cookie: await signInAs(ctx, thuha),
        body: { aliases: ["K1,7"] },
      }),
      params(frame.id),
    );
    expect(response.status).toBe(403);
    expect((await getItem(ctx.db, frame.id))?.aliases).toEqual([]);
  });

  it("deletes the old codes with an unused item", async () => {
    const frame = await newItem({ code: "GG-K17", aliases: ["K1,7"] });
    expect(await deleteItem(ctx.db, director, frame.id)).toEqual({
      ok: true,
      data: null,
    });
    await newItem({ code: "K1,7" });
  });
});

describe("4.3 stock lookup by typed code", () => {
  async function lookUp(code: string) {
    const cookie = await signInAs(ctx, director);
    return json(
      await lookup.GET(
        appRequest(`/api/stock/lookup?code=${encodeURIComponent(code)}`, {
          cookie,
        }),
      ),
    );
  }

  it("takes a near spelling and an old code, main code first", async () => {
    await newItem({ code: "NỐI 34" });
    await newItem({ code: "GG-K17", aliases: ["K1,7X"] });
    expect((await lookUp("noi 34")).body.data.code).toBe("NỐI 34");
    expect((await lookUp("k1,7x")).body.data.code).toBe("GG-K17");
    await newItem({ code: "K1,7" });
    await updateItem(ctx.db, director, (await getByCode("GG-K17")).id, {
      aliases: ["K1,7X"],
    });
    expect((await lookUp("K1,7")).body.data.code).toBe("K1,7");
  });

  it("answers 404 for an unknown code", async () => {
    expect(await lookUp("ZZ-99")).toMatchObject({
      status: 404,
      body: { error: "Không tìm thấy mã ZZ-99" },
    });
  });
});

async function getByCode(code: string) {
  const { items: rows } = await listItems(ctx.db, { q: code });
  const found = rows.find((row) => row.code === code);
  if (!found) throw new Error(code);
  return found;
}

describe("4.4 categories", () => {
  it("adds a raw material and filters by category", async () => {
    const rods = await group("Que hàn", "MATERIAL");
    await newItem({ code: "GG-K17" });
    await newItem({
      code: "QH-2,5",
      name: "Que hàn 2,5",
      groupId: rods,
      unit: "BOX",
      standardWeightKg: "5",
    });
    const cookie = await signInAs(ctx, director);
    const list = async (category: string) =>
      (
        await json(
          await items.GET(
            appRequest(`/api/catalog/items?category=${category}`, { cookie }),
          ),
        )
      ).body.data.items.map((row: { code: string }) => row.code);
    expect(await list("MATERIAL")).toEqual(["QH-2,5"]);
    expect(await list("EQUIPMENT")).toEqual(["GG-K17"]);
    const rod = await getByCode("QH-2,5");
    expect(rod).toMatchObject({ category: "MATERIAL", unitLabel: "hộp" });
  });

  it("moves the items with their group", async () => {
    const pipes = await group("Thép ống");
    await newItem({ code: "ONG-60", groupId: pipes });
    await updateGroup(ctx.db, director, pipes, { category: "MATERIAL" });
    expect((await getByCode("ONG-60")).category).toBe("MATERIAL");
    expect((await lastActivity(ctx.db, "Thép ống"))?.summary).toBe(
      "Phân loại: Thiết bị → Vật tư",
    );
  });
});

describe("4.5 kits", () => {
  it("refuses a metre part, accepts bars, refuses a code taken by an item", async () => {
    const pipe = await newItem({
      code: "ONG-49",
      unit: "METER",
      standardWeightKg: "3.56",
    });
    const bar = await newItem({
      code: "ONG-6M",
      unit: "BAR",
      standardWeightKg: "21.4",
    });
    const clamp = await newItem({ code: "KU0,5" });
    expect(
      await createKit(ctx.db, director, {
        code: "BO-ONG",
        name: "Bộ ống",
        components: [
          { itemId: pipe.id, quantity: 2 },
          { itemId: clamp.id, quantity: 1 },
        ],
      }),
    ).toMatchObject({
      status: 400,
      error: "Bộ chỉ gồm vật tư đếm được (cái, cây, bó...)",
    });
    expect(
      await createKit(ctx.db, director, {
        code: "BO-CAY",
        name: "Bộ cây",
        components: [
          { itemId: bar.id, quantity: 4 },
          { itemId: clamp.id, quantity: 8 },
        ],
      }),
    ).toMatchObject({ ok: true });
    await newItem({ code: "NỐI 34" });
    expect(
      await createKit(ctx.db, director, {
        code: "NOI34",
        name: "Trùng",
        components: [{ itemId: bar.id, quantity: 2 }],
      }),
    ).toMatchObject({ status: 409, error: "Mã gần giống mã NỐI 34 đã có" });
  });
});

describe("4.6 site provinces and regions", () => {
  async function owner(name = "Minh Phát") {
    const result = await createCustomer(ctx.db, director, {
      kind: "COMPANY",
      name,
    });
    if (!result.ok) throw new Error(result.error);
    return result.data.id;
  }

  it("filters sites by region and province", async () => {
    const customerId = await owner();
    const make = (name: string, province: string) =>
      createSite(ctx.db, director, { name, province, customerId });
    for (const [index, province] of [
      "HCM",
      "HCM",
      "HCM",
      "HCM",
      "DNI",
      "TNI",
    ].entries()) {
      await make(`Nam ${index}`, province);
    }
    await make("Bắc 1", "HN");
    await make("Bắc 2", "BNI");
    const old = await make("Cũ", "HN");
    // A site made before provinces existed.
    await getAdminDatabase().execute(
      `update site set province = null where id = '${old.ok ? old.data.id : ""}'`,
    );
    const vantung = await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "vantung",
    });
    const cookie = await signInAs(ctx, vantung);
    const count = async (query: string) =>
      (
        await json(
          await sites.GET(
            appRequest(`/api/catalog/sites?${query}`, { cookie }),
          ),
        )
      ).body.data.length;
    expect(await count("region=SOUTH")).toBe(6);
    expect(await count("region=NORTH")).toBe(2);
    expect(await count("region=UNKNOWN")).toBe(1);
    expect(await count("region=SOUTH&province=HCM")).toBe(4);
    const [north] = await listSites(ctx.db, { province: "BNI" });
    expect(north).toMatchObject({
      provinceName: "Bắc Ninh",
      region: "NORTH",
    });
  });

  it("requires a known province on create and on edit of an old site", async () => {
    const customerId = await owner();
    expect(
      await createSite(ctx.db, director, { name: "X", customerId }),
    ).toMatchObject({ status: 400, error: "Chọn tỉnh/thành của công trình" });
    expect(
      await createSite(ctx.db, director, {
        name: "X",
        customerId,
        province: "Bà Rịa - Vũng Tàu",
      }),
    ).toMatchObject({ status: 400, error: "Tỉnh/thành không hợp lệ" });
    const made = await createSite(ctx.db, director, {
      name: "Long Hậu",
      customerId,
      province: "Tây Ninh",
    });
    if (!made.ok) throw new Error(made.error);
    expect(made.data).toMatchObject({ province: "TNI", region: "SOUTH" });
    await getAdminDatabase().execute(
      `update site set province = null where id = '${made.data.id}'`,
    );
    expect(
      await updateSite(ctx.db, director, made.data.id, { name: "Long Hậu 2" }),
    ).toMatchObject({ status: 400, error: "Chọn tỉnh/thành của công trình" });
    expect(
      await updateSite(ctx.db, director, made.data.id, { status: "ARCHIVED" }),
    ).toMatchObject({ ok: true });
    expect(
      await updateSite(ctx.db, director, made.data.id, {
        province: "HCM",
        status: "ACTIVE",
      }),
    ).toMatchObject({ ok: true, data: { provinceName: "TP. Hồ Chí Minh" } });
    expect((await lastActivity(ctx.db, made.data.code))?.summary).toContain(
      "Tỉnh/thành: – → TP. Hồ Chí Minh",
    );
  });
});

describe("4.7 sales staff in charge", () => {
  let khang: TestUser;
  let thao: TestUser;

  beforeEach(async () => {
    khang = await createTestUser(ctx, {
      role: "SALES",
      username: "khang",
      name: "Khang",
    });
    thao = await createTestUser(ctx, {
      role: "SALES",
      username: "thao",
      name: "Thảo",
    });
  });

  async function customerFor(name: string, salesUserId?: string) {
    const result = await createCustomer(ctx.db, director, {
      kind: "COMPANY",
      name,
      salesUserId,
    });
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  it("puts Khang in charge and logs it by name", async () => {
    const thuha = await createTestUser(ctx, {
      role: "ACCOUNTANT",
      username: "thuha",
    });
    const nt = await customerFor("Minh Phát");
    const result = await updateCustomer(ctx.db, thuha, nt.id, {
      salesUserId: khang.id,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { salesUser: { id: khang.id, name: "Khang", active: true } },
    });
    expect((await lastActivity(ctx.db, nt.code))?.summary).toBe(
      "Nhân viên phụ trách: – → Khang",
    );
  });

  it("refuses a warehouse account", async () => {
    const vantung = await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "vantung",
    });
    const nt = await customerFor("Minh Phát");
    expect(
      await updateCustomer(ctx.db, director, nt.id, {
        salesUserId: vantung.id,
      }),
    ).toMatchObject({
      status: 400,
      error:
        "Người phụ trách phải là tài khoản Kinh doanh hoặc Giám đốc đang hoạt động",
    });
  });

  it("keeps a locked person in charge but never picks them again", async () => {
    const nt = await customerFor("Minh Phát", khang.id);
    await ctx.db
      .update(user)
      .set({ status: "LOCKED" })
      .where(eq(user.id, khang.id));
    const [row] = await listCustomers(ctx.db);
    expect(row?.salesUser).toEqual({
      id: khang.id,
      name: "Khang",
      active: false,
    });
    expect(
      await updateCustomer(ctx.db, director, nt.id, { phone: "0988123456" }),
    ).toMatchObject({ ok: true });
    expect(
      await createCustomer(ctx.db, director, {
        kind: "COMPANY",
        name: "Khác",
        salesUserId: khang.id,
      }),
    ).toMatchObject({ status: 400 });
    const cookie = await signInAs(ctx, thao);
    const staff = await json(
      await salesStaff.GET(appRequest("/api/catalog/sales-staff", { cookie })),
    );
    expect(staff.body.data.map((row: { name: string }) => row.name)).toEqual([
      "Giám đốc",
      "Thảo",
    ]);
  });

  it("filters customers by person in charge, 5 / 3 / 2", async () => {
    for (let i = 0; i < 5; i += 1) await customerFor(`L${i}`, khang.id);
    for (let i = 0; i < 3; i += 1) await customerFor(`Y${i}`, thao.id);
    for (let i = 0; i < 2; i += 1) await customerFor(`N${i}`);
    const cookie = await signInAs(ctx, thao);
    const count = async (sales: string) =>
      (
        await json(
          await customers.GET(
            appRequest(`/api/catalog/customers?sales=${sales}`, { cookie }),
          ),
        )
      ).body.data.length;
    expect(await count(khang.id)).toBe(5);
    expect(await count(thao.id)).toBe(3);
    expect(await count("none")).toBe(2);
    // Thảo still reads Khang's customers: no limit on who sees what.
    expect(
      (
        await json(
          await customers.GET(appRequest("/api/catalog/customers", { cookie })),
        )
      ).body.data,
    ).toHaveLength(10);
  });

  it("refuses a change from a warehouse keeper", async () => {
    const vantung = await createTestUser(ctx, {
      role: "WAREHOUSE",
      username: "vantung",
    });
    const nt = await customerFor("Minh Phát");
    const response = await customerOne.PATCH(
      appRequest(`/api/catalog/customers/${nt.id}`, {
        method: "PATCH",
        cookie: await signInAs(ctx, vantung),
        body: { salesUserId: khang.id },
      }),
      params(nt.id),
    );
    expect(response.status).toBe(403);
    const [row] = await ctx.db
      .select({ sales: customer.salesUserId })
      .from(customer)
      .where(eq(customer.id, nt.id));
    expect(row?.sales).toBeNull();
  });
});

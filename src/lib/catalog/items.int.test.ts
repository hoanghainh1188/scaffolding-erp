import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
} from "@/test/auth";
import { resetCatalogTables } from "@/test/catalog";

import type { Actor } from "./common";
import {
  createGroup,
  deleteGroup,
  listGroups,
  updateGroup,
} from "./item-groups";
import {
  createItem,
  deleteItem,
  listItems,
  updateItem,
  type ItemInput,
} from "./items";
import { createKit, deleteKit, listKits, updateKit } from "./kits";

const ctx = createTestContext();
// A second pool so two transactions really overlap.
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");

afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

let actor: Actor;
let scaffold = "";
let fittings = "";

beforeEach(async () => {
  await resetAuthTables();
  await resetCatalogTables();
  actor = await createTestUser(ctx, { role: "SALES", username: "quocbao" });
  scaffold = await groupId("Giàn giáo");
  fittings = await groupId("Phụ kiện");
});

async function groupId(name: string): Promise<string> {
  const result = await createGroup(ctx.db, actor, { name });
  if (!result.ok) throw new Error(result.error);
  return result.data.id;
}

const frame: ItemInput = {
  code: "gg-k17",
  name: "Khung giàn giáo 1,7m",
  unit: "PIECE",
  standardWeightKg: "13.5",
  dailyRentalPrice: 1200,
  lostPrice: 350_000,
  damagePrice: 60_000,
};

async function made(input: ItemInput) {
  const result = await createItem(ctx.db, actor, {
    groupId: scaffold,
    ...input,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** Bộ giàn giáo 1,7m from the D9 design, with its three parts. */
async function scaffoldSet() {
  const k17 = await made(frame);
  const ch = await made({
    code: "GG-CH",
    name: "Chéo giàn giáo",
    unit: "PIECE",
    standardWeightKg: "2.8",
    dailyRentalPrice: 300,
  });
  const m16 = await made({
    code: "GG-M16",
    name: "Mâm giàn giáo 1,6m",
    unit: "PIECE",
    standardWeightKg: "11",
    dailyRentalPrice: 900,
  });
  const set = await createKit(ctx.db, actor, {
    code: "BO-17",
    name: "Bộ giàn giáo 1,7m",
    components: [
      { itemId: k17.id, quantity: 2 },
      { itemId: ch.id, quantity: 2 },
      { itemId: m16.id, quantity: 1 },
    ],
  });
  if (!set.ok) throw new Error(set.error);
  return { k17, ch, m16, set: set.data };
}

describe("item groups", () => {
  it("refuses a name that differs only in accents or case", async () => {
    expect(await createGroup(ctx.db, actor, { name: "giàn giao" })).toEqual({
      ok: false,
      status: 409,
      error: "Tên nhóm đã có",
    });
  });

  it("will not delete a group with items, deletes an empty one", async () => {
    await made(frame);
    expect(await deleteGroup(ctx.db, actor, scaffold)).toEqual({
      ok: false,
      status: 409,
      error: "Nhóm hàng đã được dùng nên chỉ ngừng dùng được",
    });
    expect(await deleteGroup(ctx.db, actor, fittings)).toEqual({
      ok: true,
      data: null,
    });
  });

  it("counts active items per group and archives", async () => {
    await made(frame);
    await updateGroup(ctx.db, actor, fittings, { status: "ARCHIVED" });
    const groups = await listGroups(ctx.db);
    expect(groups.find((g) => g.id === scaffold)?.itemCount).toBe(1);
    expect(groups.find((g) => g.id === fittings)?.status).toBe("ARCHIVED");
  });
});

describe("items", () => {
  it("creates GG-K17 with upper-cased code, weight and prices", async () => {
    const row = await made(frame);
    expect(row).toMatchObject({
      code: "GG-K17",
      unit: "PIECE",
      standardWeightKg: "13.500",
      dailyRentalPrice: 1200,
      lostPrice: 350_000,
      damagePrice: 60_000,
      groupName: "Giàn giáo",
      status: "ACTIVE",
    });
  });

  it("stores a kg item with no weight and no rent", async () => {
    const row = await made({
      code: "PL-SAT",
      name: "Phế liệu sắt lẫn",
      unit: "KG",
    });
    expect(row).toMatchObject({
      standardWeightKg: null,
      dailyRentalPrice: null,
    });
  });

  it("explains missing weight, bad code and a fraction price", async () => {
    const attempt = (input: ItemInput) =>
      createItem(ctx.db, actor, { groupId: scaffold, ...input });
    expect(await attempt({ ...frame, standardWeightKg: "0" })).toMatchObject({
      status: 400,
      error: "Nhập trọng lượng chuẩn lớn hơn 0 kg",
    });
    expect(await attempt({ ...frame, code: "H1/7" })).toMatchObject({
      status: 400,
      error:
        "Mã chỉ gồm chữ in hoa, số và các dấu , * + - hoặc khoảng trắng; không bắt đầu, kết thúc hay lặp hai dấu liền nhau",
    });
    expect(await attempt({ ...frame, dailyRentalPrice: 1200.5 })).toMatchObject(
      {
        status: 400,
        error: "Số tiền phải là số nguyên",
      },
    );
  });

  it("refuses a code already used by a kit", async () => {
    await scaffoldSet();
    expect(
      await createItem(ctx.db, actor, {
        ...frame,
        groupId: scaffold,
        code: "BO-17",
      }),
    ).toEqual({ ok: false, status: 409, error: "Mã này đã được dùng" });
  });

  it("lets only one of two same-code creations through", async () => {
    const results = await Promise.all([
      createItem(ctx.db, actor, { ...frame, groupId: scaffold }),
      createItem(other.db, actor, { ...frame, groupId: scaffold }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ status: 409 });
  });

  it("never changes code or unit", async () => {
    const row = await made(frame);
    expect(
      await updateItem(ctx.db, actor, row.id, { code: "GG-K170" }),
    ).toEqual({
      ok: false,
      status: 400,
      error: "Không đổi được mã hàng sau khi tạo",
    });
    expect(
      await updateItem(ctx.db, actor, row.id, { unit: "KG" }),
    ).toMatchObject({
      status: 400,
      error: "Không đổi được đơn vị sau khi tạo",
    });
  });

  it("edits price and name", async () => {
    const row = await made(frame);
    const result = await updateItem(ctx.db, actor, row.id, {
      name: "Khung 1,7m",
      dailyRentalPrice: 1300,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { name: "Khung 1,7m", dailyRentalPrice: 1300, code: "GG-K17" },
    });
  });

  it("searches without accents and filters by group and status", async () => {
    await scaffoldSet();
    await made({
      code: "PK-CX",
      name: "Cùm xoay",
      unit: "PIECE",
      standardWeightKg: "1.1",
      groupId: fittings,
    });
    const found = await listItems(ctx.db, { q: "khung gian" });
    expect(found.items.map((row) => row.code)).toEqual(["GG-K17"]);
    expect((await listItems(ctx.db, { groupId: fittings })).items).toHaveLength(
      1,
    );
    expect(found.counts).toMatchObject({ activeItems: 4, activeKits: 1 });
    expect(found.counts.byGroup[scaffold]).toBe(3);
  });

  it("does not let % in the search match everything", async () => {
    await made(frame);
    expect((await listItems(ctx.db, { q: "%" })).items).toHaveLength(0);
  });

  it("deletes an unused item, keeps one inside a kit", async () => {
    const { ch } = await scaffoldSet();
    const spare = await made({
      code: "TEST-01",
      name: "Tạo nhầm",
      unit: "PIECE",
      standardWeightKg: "1",
    });
    expect(await deleteItem(ctx.db, actor, spare.id)).toEqual({
      ok: true,
      data: null,
    });
    expect(await deleteItem(ctx.db, actor, ch.id)).toEqual({
      ok: false,
      status: 409,
      error: "Vật tư đã được dùng nên chỉ ngừng dùng được",
    });
  });

  it("will not archive an item of an active kit", async () => {
    const { ch } = await scaffoldSet();
    expect(
      await updateItem(ctx.db, actor, ch.id, { status: "ARCHIVED" }),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Bỏ vật tư này khỏi bộ BO-17 hoặc ngừng dùng bộ trước",
    });
  });

  it("archives and brings back; archived items are hidden by default", async () => {
    const row = await made({
      code: "KK-01",
      name: "Kích",
      unit: "PIECE",
      standardWeightKg: "3",
    });
    await updateItem(ctx.db, actor, row.id, { status: "ARCHIVED" });
    expect((await listItems(ctx.db)).items).toHaveLength(0);
    expect(
      (await listItems(ctx.db, { status: "ARCHIVED" })).items,
    ).toHaveLength(1);
    await updateItem(ctx.db, actor, row.id, { status: "ACTIVE" });
    expect((await listItems(ctx.db)).items).toHaveLength(1);
  });
});

describe("kits", () => {
  it("computes 43,6 kg and 3.900 ₫ a day for BO-17", async () => {
    const { set } = await scaffoldSet();
    expect(set).toMatchObject({
      code: "BO-17",
      weightMilli: 43_600,
      rentalPerDay: 3900,
    });
    expect(set.components).toHaveLength(3);
  });

  it("follows a part's new price without editing the kit", async () => {
    const { ch, set } = await scaffoldSet();
    await updateItem(ctx.db, actor, ch.id, { dailyRentalPrice: 350 });
    const [after] = await listKits(ctx.db, {
      containsItemId: set.components[0]?.itemId,
    });
    expect(after?.rentalPerDay).toBe(4000);
  });

  it("lists the kits that contain an item", async () => {
    const { k17 } = await scaffoldSet();
    const holders = await listKits(ctx.db, { containsItemId: k17.id });
    expect(holders.map((row) => row.code)).toEqual(["BO-17"]);
  });

  it("refuses an archived item in a new kit", async () => {
    const jack = await made({
      code: "KK-01",
      name: "Kích",
      unit: "PIECE",
      standardWeightKg: "3",
    });
    await updateItem(ctx.db, actor, jack.id, { status: "ARCHIVED" });
    expect(
      await createKit(ctx.db, actor, {
        code: "BO-KK",
        name: "Bộ kích",
        components: [{ itemId: jack.id, quantity: 2 }],
      }),
    ).toEqual({ ok: false, status: 400, error: "Vật tư KK-01 đã ngừng dùng" });
  });

  it("replaces parts, deletes a kit with its lines", async () => {
    const { k17, set } = await scaffoldSet();
    const edited = await updateKit(ctx.db, actor, set.id, {
      components: [{ itemId: k17.id, quantity: 4 }],
    });
    expect(edited).toMatchObject({ ok: true, data: { weightMilli: 54_000 } });
    expect(await deleteKit(ctx.db, actor, set.id)).toEqual({
      ok: true,
      data: null,
    });
    // The part is free again: it can be deleted now.
    expect(await deleteItem(ctx.db, actor, k17.id)).toEqual({
      ok: true,
      data: null,
    });
  });
});

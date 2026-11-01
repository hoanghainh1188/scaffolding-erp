import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { resetCatalogTables } from "@/test/catalog";
import { resetInventoryTables, truncateWithLedger } from "@/test/inventory";

import { user } from "./auth";
import { item, itemGroup, location } from "./catalog";
import { repairOrder, repairOrderLine } from "./repairs";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

const userId = "repair-schema-user";
let itemId = "";
let yardId = "";

beforeEach(async () => {
  await truncateWithLedger(sql`truncate table "user" cascade`);
  await resetInventoryTables();
  await resetCatalogTables();
  await db.insert(user).values({
    id: userId,
    name: "Thu Hà",
    email: "thuha@users.invalid",
    username: "thuha",
    role: "ACCOUNTANT",
  });
  const [group] = await db
    .insert(itemGroup)
    .values({ name: "Giàn giáo", nameKey: "gian giao" })
    .returning({ id: itemGroup.id });
  const [row] = await db
    .insert(item)
    .values({
      code: "GG-K17",
      name: "Khung giàn giáo 1,7m",
      groupId: group?.id ?? "",
      unit: "PIECE",
      standardWeightKg: "13.500",
      searchText: "khung gian giao 1,7m gg-k17",
    })
    .returning({ id: item.id });
  itemId = row?.id ?? "";
  const [yard] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  yardId = yard?.id ?? "";
});

type OrderValues = Partial<typeof repairOrder.$inferInsert>;
type LineValues = Partial<typeof repairOrderLine.$inferInsert>;

async function insertOrder(values: OrderValues = {}) {
  const [row] = await db
    .insert(repairOrder)
    .values({
      code: "PSC-2026-024",
      repairDate: "2026-10-28",
      fromLocationId: yardId,
      toLocationId: yardId,
      createdBy: userId,
      ...values,
    })
    .returning({ id: repairOrder.id });
  return row?.id ?? "";
}

async function insertLine(orderId: string, values: LineValues = {}) {
  await db.insert(repairOrderLine).values({
    orderId,
    position: 1,
    itemId,
    quantityTaken: "40",
    quantityGood: "36",
    quantityScrap: "4",
    repairCost: 1_980_000,
    ...values,
  });
}

async function post(orderId: string) {
  await db
    .update(repairOrder)
    .set({
      status: "POSTED",
      postedBy: userId,
      postedAt: new Date(),
      postingId: crypto.randomUUID(),
    })
    .where(eq(repairOrder.id, orderId));
}

async function errorCode(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? (error as { code?: string }).code ?? "unknown";
  }
  return "none";
}

async function errorMessage(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  return "none";
}

describe("repair_order checks", () => {
  it.each<[string, OrderValues]>([
    ["unknown status", { status: "CANCELLED" }],
    ["posted without who and when", { status: "POSTED" }],
    ["empty worker", { repairedBy: "" }],
    ["worker over 100 characters", { repairedBy: "x".repeat(101) }],
    ["note over 500 characters", { note: "x".repeat(501) }],
    ["zero scrap price", { scrapPriceUsed: 0 }],
  ])("refuses a slip with %s", async (_name, values) => {
    expect(await errorCode(() => insertOrder(values))).toBe("23514");
  });

  it("refuses a draft carrying posting fields and two slips with one code", async () => {
    expect(
      await errorCode(() =>
        insertOrder({ postedBy: userId, postedAt: new Date() }),
      ),
    ).toBe("23514");
    await insertOrder();
    expect(await errorCode(() => insertOrder())).toBe("23505");
  });
});

describe("repair_order_line checks", () => {
  it.each<[string, LineValues]>([
    [
      "nothing taken",
      { quantityTaken: "0", quantityGood: "0", quantityScrap: "0" },
    ],
    ["parts not adding up", { quantityGood: "30" }],
    ["negative good", { quantityGood: "-1", quantityScrap: "41" }],
    ["negative cost", { repairCost: -1 }],
    [
      "cost without repaired goods",
      { quantityGood: "0", quantityScrap: "40", repairCost: 300_000 },
    ],
    ["loss with repaired goods", { lossAmount: 235_000 }],
    [
      "negative loss",
      { quantityGood: "0", quantityScrap: "40", repairCost: 0, lossAmount: -1 },
    ],
  ])("refuses a line with %s", async (_name, values) => {
    const orderId = await insertOrder();
    expect(await errorCode(() => insertLine(orderId, values))).toBe("23514");
  });

  it("accepts an all-scrap line with its loss", async () => {
    const orderId = await insertOrder();
    expect(
      await errorCode(() =>
        insertLine(orderId, {
          quantityTaken: "5",
          quantityGood: "0",
          quantityScrap: "5",
          repairCost: 0,
          lossAmount: 600_000,
        }),
      ),
    ).toBe("none");
  });

  it("refuses the same item twice on a slip", async () => {
    const orderId = await insertOrder();
    await insertLine(orderId);
    expect(await errorCode(() => insertLine(orderId, { position: 2 }))).toBe(
      "23505",
    );
  });

  it("keeps an item and a place a slip refers to", async () => {
    const orderId = await insertOrder();
    await insertLine(orderId);
    expect(
      await errorCode(() => db.delete(item).where(eq(item.id, itemId))),
    ).toBe("23503");
    expect(
      await errorCode(() => db.delete(location).where(eq(location.id, yardId))),
    ).toBe("23503");
  });
});

describe("posted repair slips", () => {
  it("deletes a draft with its lines", async () => {
    const orderId = await insertOrder();
    await insertLine(orderId);
    await db.delete(repairOrder).where(eq(repairOrder.id, orderId));
    expect(await db.select().from(repairOrderLine)).toHaveLength(0);
  });

  it("freezes a posted slip and its lines", async () => {
    const orderId = await insertOrder();
    await insertLine(orderId);
    await post(orderId);
    const frozen = "Phiếu đã ghi sổ, không sửa hay xóa được";
    expect(
      await errorMessage(() =>
        db
          .update(repairOrder)
          .set({ note: "sửa" })
          .where(eq(repairOrder.id, orderId)),
      ),
    ).toContain(frozen);
    expect(
      await errorMessage(() =>
        db.delete(repairOrder).where(eq(repairOrder.id, orderId)),
      ),
    ).toContain(frozen);
    expect(
      await errorMessage(() =>
        db.update(repairOrderLine).set({ repairCost: 0 }),
      ),
    ).toContain(frozen);
    expect(await errorMessage(() => db.delete(repairOrderLine))).toContain(
      frozen,
    );
    expect(
      await errorMessage(() =>
        insertLine(orderId, {
          position: 2,
          itemId: crypto.randomUUID(),
        }),
      ),
    ).toContain(frozen);
    const [line] = await db.select().from(repairOrderLine);
    expect(line?.repairCost).toBe(1_980_000);
  });
});

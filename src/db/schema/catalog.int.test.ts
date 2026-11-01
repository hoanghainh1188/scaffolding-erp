import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { resetCatalogTables } from "@/test/catalog";

import { item, itemGroup, kit, kitComponent, location } from "./catalog";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

let groupId = "";

beforeEach(async () => {
  await resetCatalogTables();
  const [group] = await db
    .insert(itemGroup)
    .values({ name: "Giàn giáo", nameKey: "gian giao" })
    .returning({ id: itemGroup.id });
  groupId = group?.id ?? "";
});

const piece = (overrides: Partial<typeof item.$inferInsert> = {}) => ({
  code: "GG-K17",
  name: "Khung giàn giáo 1,7m",
  groupId,
  unit: "PIECE",
  standardWeightKg: "13.500",
  dailyRentalPrice: 1200,
  searchText: "khung gian giao 1,7m gg-k17",
  ...overrides,
});

/** Postgres error code and constraint name from a rejected query. */
async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  const cause = (error as { cause?: Record<string, unknown> } | undefined)
    ?.cause;
  return { code: cause?.code, constraint: cause?.constraint_name };
}

describe("catalog tables", () => {
  it("seeds one yard and one workshop", async () => {
    const rows = await db
      .select({ code: location.code, type: location.type })
      .from(location);
    expect(rows).toEqual(
      expect.arrayContaining([
        { code: "BAI-01", type: "YARD" },
        { code: "XUONG-01", type: "WORKSHOP" },
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("stores a piece item with its weight and price", async () => {
    await db.insert(item).values(piece());
    const [row] = await db.select().from(item);
    expect(row).toMatchObject({
      code: "GG-K17",
      standardWeightKg: "13.500",
      dailyRentalPrice: 1200,
      status: "ACTIVE",
    });
  });

  it("requires a weight for piece items and none for kg items", async () => {
    expect(
      await rejection(
        db.insert(item).values(piece({ standardWeightKg: null })),
      ),
    ).toMatchObject({ code: "23514", constraint: "item_weight_check" });
    expect(
      await rejection(db.insert(item).values(piece({ standardWeightKg: "0" }))),
    ).toMatchObject({ constraint: "item_weight_check" });
    expect(
      await rejection(
        db
          .insert(item)
          .values(
            piece({ code: "PL-SAT", unit: "KG", dailyRentalPrice: null }),
          ),
      ),
    ).toMatchObject({ constraint: "item_weight_check" });
  });

  it("refuses a rental price on a kg item and negative prices", async () => {
    expect(
      await rejection(
        db
          .insert(item)
          .values(
            piece({ code: "PL-SAT", unit: "KG", standardWeightKg: null }),
          ),
      ),
    ).toMatchObject({ constraint: "item_rental_unit_check" });
    expect(
      await rejection(db.insert(item).values(piece({ lostPrice: -1 }))),
    ).toMatchObject({ constraint: "item_prices_check" });
  });

  it("refuses a lower-case or malformed code", async () => {
    for (const code of ["gg-k17", "GG--K17", "G"]) {
      expect(
        await rejection(db.insert(item).values(piece({ code }))),
        code,
      ).toMatchObject({ constraint: "item_code_check" });
    }
  });

  it("refuses a kit line with quantity 0", async () => {
    const [frame] = await db
      .insert(item)
      .values(piece())
      .returning({ id: item.id });
    const [set] = await db
      .insert(kit)
      .values({ code: "BO-17", name: "Bộ 1,7m", searchText: "bo 1,7m" })
      .returning({ id: kit.id });
    expect(
      await rejection(
        db.insert(kitComponent).values({
          kitId: set?.id ?? "",
          itemId: frame?.id ?? "",
          quantity: 0,
        }),
      ),
    ).toMatchObject({ constraint: "kit_component_quantity_check" });
  });

  it("will not delete a group that still has items", async () => {
    await db.insert(item).values(piece());
    expect(
      await rejection(db.delete(itemGroup).where(eq(itemGroup.id, groupId))),
    ).toMatchObject({ code: "23503" });
  });
});

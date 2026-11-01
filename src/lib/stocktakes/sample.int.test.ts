// Sample stocktake (stocktake task 8.1, design D16).
import { afterAll, beforeEach, expect, it } from "vitest";

import { seedInventory } from "@/lib/inventory/sample";
import { createTestContext } from "@/test/auth";
import {
  resetInventoryTables,
  setupInventoryFixture,
  type InventoryFixture,
} from "@/test/inventory";

import { getStocktake, listStocktakes } from "./queries";
import { seedStocktakes } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: InventoryFixture;
beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
  await resetInventoryTables();
  await seedInventory(ctx.db, fx.director);
});

it("adds one session waiting for approval with the D13 differences, once", async () => {
  expect(await seedStocktakes(ctx.db, fx.director)).toBe(1);
  expect(await seedStocktakes(ctx.db, fx.director)).toBe(0);
  const rows = await listStocktakes(ctx.db);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    status: "SUBMITTED",
    locationCode: "BAI-01",
  });
  const detail = await getStocktake(ctx.db, rows[0]?.code ?? "");
  const off = detail?.lines
    .filter((line) => line.differenceMilli !== 0)
    .map((line) => [
      line.itemCode,
      line.condition,
      (line.differenceMilli ?? 0) / 1000,
    ]);
  expect(off).toEqual([
    ["GG-CH", "GOOD", -30],
    ["GG-CH", "NEEDS_REPAIR", 10],
    ["GG-K15", "GOOD", -8],
    ["GG-K17", "GOOD", -4],
    ["PK-KU", "GOOD", 2],
  ]);
  expect(detail?.summary.counted).toBe(detail?.summary.total);
});

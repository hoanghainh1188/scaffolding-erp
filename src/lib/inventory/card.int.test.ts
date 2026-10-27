import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { site } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { createTestContext } from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import { getStockCard, type CardFilter } from "./card";
import { seedInventory } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

const OCTOBER = {
  from: "2026-10-01" as BusinessDate,
  to: "2026-10-31" as BusinessDate,
};

let fx: InventoryFixture;
beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
  await seedInventory(ctx.db, fx.director);
});

const card = (filter: Partial<CardFilter> = {}, code = "GG-K17") =>
  getStockCard(ctx.db, code, {
    condition: "GOOD",
    place: "yard",
    ...OCTOBER,
    ...filter,
  });

describe("getStockCard", () => {
  it("matches the worked example of design D11", async () => {
    const result = await card();
    expect(result).toMatchObject({
      opening: 1_220_000,
      inflow: 450_000,
      outflow: 430_000,
      closing: 1_240_000,
      currentAvg: 195_282,
      openingAvg: 195_000,
    });
    expect(
      result?.lines.map((l) => [
        l.date.slice(5),
        l.documentCode,
        l.in / 1000,
        l.out / 1000,
        l.balance / 1000,
        l.unitCost,
        l.avgAfter,
      ]),
    ).toEqual([
      ["10-03", "PX-2026-118", 0, 300, 920, 195_000, 195_000],
      ["10-08", "PN-2026-087", 160, 0, 1080, 196_155, 195_055],
      ["10-12", "PSC-2026-021", 40, 0, 1120, 214_500, 195_282],
      ["10-15", "PTH-2026-064", 210, 0, 1330, 195_282, 195_282],
      ["10-16", "ĐC-2026-004", 0, 10, 1320, 195_282, 195_282],
      ["10-20", "PX-2026-131", 0, 120, 1200, 195_282, 195_282],
      ["10-22", "PTH-2026-069", 40, 0, 1240, 195_282, 195_282],
    ]);
  });

  it("has no movement in November", async () => {
    const result = await card({
      from: "2026-11-01" as BusinessDate,
      to: "2026-11-30" as BusinessDate,
    });
    expect(result).toMatchObject({
      opening: 1_240_000,
      inflow: 0,
      outflow: 0,
      closing: 1_240_000,
      lines: [],
    });
  });

  it("filters one site", async () => {
    const [maiDich] = await ctx.db
      .select({ code: site.code })
      .from(site)
      .where(eq(site.locationId, fx.place("maiDich")));
    const result = await card({ place: "sites", siteCode: maiDich?.code });
    expect(result?.site?.name).toBe("Cầu vượt Mai Dịch");
    expect([result?.opening, result?.closing]).toEqual([800_000, 1_100_000]);
    expect(await card({ place: "sites", siteCode: "CT-9999" })).toBeNull();
  });

  it("hides prices for every condition together", async () => {
    const result = await card({ condition: null });
    expect(result?.currentAvg).toBeNull();
    expect(
      result?.lines.every((l) => l.unitCost === null && l.avgAfter === null),
    ).toBe(true);
    // Tốt 1.240 + Chờ sửa 176 + 10 + Phế liệu 42 at the yard.
    expect(result?.closing).toBe(1_468_000);
  });

  it("reads the workshop", async () => {
    const result = await card({ condition: "NEEDS_REPAIR", place: "workshop" });
    expect([result?.opening, result?.outflow, result?.closing]).toEqual([
      100_000, 40_000, 60_000,
    ]);
  });

  it("returns null for an unknown item", async () => {
    expect(await card({}, "KHONG-CO")).toBeNull();
  });
});

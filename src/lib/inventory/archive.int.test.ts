// Archiving is refused while stock remains (inventory-ledger deltas of
// item-catalog and sites-and-locations).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { site } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { MovementDraft } from "@/domain/movement";
import { deleteItem, updateItem } from "@/lib/catalog/items";
import { deleteSite, updateLocation, updateSite } from "@/lib/catalog/places";
import { createTestContext } from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import { postMovements } from "./post";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: InventoryFixture;
beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
});

const TODAY = "2026-10-27" as BusinessDate;

function post(date: string, lines: Omit<MovementDraft, "description">[]) {
  return ctx.db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "TEST",
        documentId: null,
        documentCode: "TEST-1",
        businessDate: date as BusinessDate,
        lines: lines.map((line) => ({ ...line, description: "test" })),
      },
      TODAY,
    ),
  );
}

const opening = (
  code: string,
  place: string,
  pieces: number,
  condition: MovementDraft["condition"] = "GOOD",
) => ({
  itemId: fx.item(code),
  condition,
  locationId: fx.place(place),
  movement: "OPENING" as const,
  quantityMilli: pieces * 1000,
  amount: pieces * 100_000,
});

async function siteByLocation(locationId: string) {
  const [row] = await ctx.db
    .select({ id: site.id, code: site.code })
    .from(site)
    .where(eq(site.locationId, locationId));
  return row ?? { id: "", code: "" };
}

describe("archiving an item with stock", () => {
  it("is refused while stock remains, sites included", async () => {
    await post("2026-10-01", [
      opening("OT-06", "BAI-01", 12),
      opening("OT-06", "anPhu", 30),
    ]);
    const result = await updateItem(ctx.db, fx.director, fx.item("OT-06"), {
      status: "ARCHIVED",
    });
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "OT-06 còn tồn 42 cái, chỉ ngừng dùng được khi tồn về 0",
    });
  });

  it("works once stock is back to zero; the item stays undeletable", async () => {
    await post("2026-10-01", [opening("OT-06", "BAI-01", 12)]);
    await post("2026-10-02", [
      {
        itemId: fx.item("OT-06"),
        condition: "GOOD",
        locationId: fx.place("BAI-01"),
        movement: "SALE_OUT",
        quantityMilli: -12_000,
      },
    ]);
    const archived = await updateItem(ctx.db, fx.director, fx.item("OT-06"), {
      status: "ARCHIVED",
    });
    expect(archived.ok).toBe(true);
    expect(await deleteItem(ctx.db, fx.director, fx.item("OT-06"))).toEqual({
      ok: false,
      status: 409,
      error: "Vật tư đã được dùng nên chỉ ngừng dùng được",
    });
  });

  it("speaks kg for items counted in kg", async () => {
    await post("2026-10-01", [
      {
        ...opening("PL-SAT", "BAI-01", 0, "SCRAP"),
        quantityMilli: 12_850_500,
        amount: 1,
      },
    ]);
    const result = await updateItem(ctx.db, fx.director, fx.item("PL-SAT"), {
      status: "ARCHIVED",
    });
    expect(result.ok ? "" : result.error).toBe(
      "PL-SAT còn tồn 12.850,5 kg, chỉ ngừng dùng được khi tồn về 0",
    );
  });
});

describe("archiving a site or workshop with stock", () => {
  it("refuses a site that still holds stock", async () => {
    await post("2026-10-01", [
      opening("GG-K17", "anPhu", 1540),
      opening("GG-CH", "anPhu", 300),
    ]);
    const anPhu = await siteByLocation(fx.place("anPhu"));
    const result = await updateSite(ctx.db, fx.director, anPhu.id, {
      status: "ARCHIVED",
    });
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: `Công trình ${anPhu.code} còn 1.840 cái hàng, thu hồi hết trước khi ngừng dùng`,
    });
  });

  it("archives a site once everything is back, but never deletes it", async () => {
    await post("2026-10-01", [opening("GG-K17", "anPhu", 5)]);
    await post("2026-10-02", [
      {
        itemId: fx.item("GG-K17"),
        condition: "GOOD",
        locationId: fx.place("anPhu"),
        movement: "RETURN_OUT",
        quantityMilli: -5000,
      },
      {
        itemId: fx.item("GG-K17"),
        condition: "GOOD",
        locationId: fx.place("BAI-01"),
        movement: "RETURN_IN",
        quantityMilli: 5000,
        pairedWith: 0,
      },
    ]);
    const anPhu = await siteByLocation(fx.place("anPhu"));
    const archived = await updateSite(ctx.db, fx.director, anPhu.id, {
      status: "ARCHIVED",
    });
    expect(archived.ok && archived.data.status).toBe("ARCHIVED");
    expect(await deleteSite(ctx.db, fx.director, anPhu.id)).toEqual({
      ok: false,
      status: 409,
      error: "Công trình đã được dùng nên chỉ ngừng dùng được",
    });
  });

  it("refuses the workshop while it holds stock", async () => {
    await post("2026-10-01", [
      opening("GG-K17", "XUONG-01", 60, "NEEDS_REPAIR"),
    ]);
    const result = await updateLocation(
      ctx.db,
      fx.director,
      fx.place("XUONG-01"),
      { status: "ARCHIVED" },
    );
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "XUONG-01 còn 60 cái hàng, chuyển hết đi trước khi ngừng dùng",
    });
  });
});

// Production tables (production-orders tasks 1.1–1.3): checks, the freeze of
// a posted or cancelled order, and the append-only submissions.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { getAdminDatabase } from "@/test/admin";
import { resetCatalogTables } from "@/test/catalog";
import { resetInventoryTables, truncateWithLedger } from "@/test/inventory";

import { user } from "./auth";
import { item, itemGroup, location } from "./catalog";
import {
  productionBom,
  productionBomMaterial,
  productionOrder,
  productionOrderLine,
  productionOrderMaterial,
  productionOrderSubmission,
  productionSetting,
} from "./production";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

const userId = "production-schema-user";
let itemId = "";
let materialId = "";
let yardId = "";

beforeEach(async () => {
  await truncateWithLedger(sql`truncate table "user" cascade`);
  await resetInventoryTables();
  await resetCatalogTables();
  await db.insert(user).values({
    id: userId,
    name: "Thu Hà",
    email: "thuha-production@users.invalid",
    username: "thuha",
    role: "ACCOUNTANT",
  });
  const [group] = await db
    .insert(itemGroup)
    .values({ name: "Giàn giáo", nameKey: "gian giao" })
    .returning({ id: itemGroup.id });
  const [finished, material] = await db
    .insert(item)
    .values(
      ["GG-K17", "VT-ONG42"].map((code) => ({
        code,
        name: code,
        groupId: group?.id ?? "",
        unit: "PIECE",
        standardWeightKg: "13.500",
        searchText: code.toLowerCase(),
      })),
    )
    .returning({ id: item.id });
  itemId = finished?.id ?? "";
  materialId = material?.id ?? "";
  const [yard] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  yardId = yard?.id ?? "";
});

type OrderValues = Partial<typeof productionOrder.$inferInsert>;

async function insertOrder(values: OrderValues = {}) {
  const [row] = await db
    .insert(productionOrder)
    .values({
      code: "LSX-2026-004",
      workshopId: yardId,
      toLocationId: yardId,
      createdBy: userId,
      ...values,
    })
    .returning({ id: productionOrder.id });
  return row?.id ?? "";
}

async function insertLine(orderId: string, planned = "100") {
  const [row] = await db
    .insert(productionOrderLine)
    .values({ orderId, position: 1, itemId, quantityPlanned: planned })
    .returning({ id: productionOrderLine.id });
  return row?.id ?? "";
}

async function post(orderId: string) {
  await db
    .update(productionOrder)
    .set({
      status: "POSTED",
      postedBy: userId,
      postedAt: new Date(),
      postingId: crypto.randomUUID(),
    })
    .where(eq(productionOrder.id, orderId));
}

async function cancel(orderId: string) {
  await db
    .update(productionOrder)
    .set({
      status: "CANCELLED",
      cancelledBy: userId,
      cancelledAt: new Date(),
      cancelReason: "Khách đổi đơn",
    })
    .where(eq(productionOrder.id, orderId));
}

async function failure(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } })
      .cause;
    return {
      code: cause?.code ?? "unknown",
      message: cause?.message ?? (error as Error).message,
    };
  }
  return { code: "none", message: "" };
}

describe("production checks", () => {
  it.each<[string, OrderValues]>([
    ["an unknown status", { status: "DONE" }],
    ["posted without who and when", { status: "POSTED" }],
    ["cancelled without a reason", { status: "CANCELLED" }],
    ["an empty team", { team: "" }],
    ["a note over 500 characters", { note: "x".repeat(501) }],
    ["a zero scrap price", { scrapPriceUsed: 0 }],
  ])("refuses an order with %s", async (_name, values) => {
    expect((await failure(() => insertOrder(values))).code).toBe("23514");
  });

  it("refuses a planned quantity that is 0 or fractional", async () => {
    const orderId = await insertOrder();
    expect((await failure(() => insertLine(orderId, "0"))).code).toBe("23514");
    expect((await failure(() => insertLine(orderId, "10.500"))).code).toBe(
      "23514",
    );
  });

  it("keeps one item per line, one BOM per item, one settings row", async () => {
    const orderId = await insertOrder();
    await insertLine(orderId);
    expect((await failure(() => insertLine(orderId))).code).toBe("23505");
    const values = {
      itemId,
      laborRate: 35_000,
      createdBy: userId,
      updatedBy: userId,
    };
    const [bom] = await db
      .insert(productionBom)
      .values(values)
      .returning({ id: productionBom.id });
    expect(
      (await failure(() => db.insert(productionBom).values(values))).code,
    ).toBe("23505");
    expect(
      (
        await failure(() =>
          db.insert(productionBomMaterial).values({
            bomId: bom?.id ?? "",
            itemId: materialId,
            quantityPerUnit: "0",
            position: 1,
          }),
        )
      ).code,
    ).toBe("23514");
    expect(
      (
        await failure(() =>
          db.insert(productionSetting).values({ id: 2, updatedBy: userId }),
        )
      ).code,
    ).toBe("23514");
  });

  it("will not delete an item a BOM uses", async () => {
    await db.insert(productionBom).values({
      itemId,
      laborRate: 0,
      createdBy: userId,
      updatedBy: userId,
    });
    expect(
      (await failure(() => db.delete(item).where(eq(item.id, itemId)))).code,
    ).toBe("23503");
  });
});

describe("production_order_frozen", () => {
  it("lets a draft change and be deleted with its lines", async () => {
    const orderId = await insertOrder();
    await insertLine(orderId);
    await db
      .update(productionOrder)
      .set({ team: "tổ anh Lực" })
      .where(eq(productionOrder.id, orderId));
    await db.delete(productionOrder).where(eq(productionOrder.id, orderId));
    expect(await db.select().from(productionOrderLine)).toHaveLength(0);
  });

  it("freezes a posted order, its lines and its materials", async () => {
    const orderId = await insertOrder();
    const lineId = await insertLine(orderId);
    await db
      .insert(productionOrderMaterial)
      .values({ lineId, itemId: materialId, quantity: "10" });
    await post(orderId);
    const admin = getAdminDatabase();
    const refused = "Lệnh đã ghi sổ, không sửa hay xóa được";
    expect(
      await failure(() =>
        admin
          .update(productionOrder)
          .set({ team: "x" })
          .where(eq(productionOrder.id, orderId)),
      ),
    ).toEqual({ code: "P0001", message: refused });
    expect(
      await failure(() =>
        admin
          .update(productionOrderLine)
          .set({ laborRate: 1 })
          .where(eq(productionOrderLine.id, lineId)),
      ),
    ).toEqual({ code: "P0001", message: refused });
    expect(
      await failure(() =>
        admin
          .delete(productionOrderMaterial)
          .where(eq(productionOrderMaterial.lineId, lineId)),
      ),
    ).toEqual({ code: "P0001", message: refused });
    expect(
      await failure(() =>
        admin.delete(productionOrder).where(eq(productionOrder.id, orderId)),
      ),
    ).toEqual({ code: "P0001", message: refused });
  });

  describe.each([
    ["posted", post, "Lệnh đã ghi sổ, không sửa hay xóa được"],
    ["cancelled", cancel, "Lệnh đã hủy, không sửa hay xóa được"],
  ] as const)("a %s parent", (_name, freeze, refused) => {
    async function frozenAndDraft() {
      const frozenId = await insertOrder();
      const frozenLine = await insertLine(frozenId);
      await freeze(frozenId);
      const draftId = await insertOrder({ code: "LSX-2026-005" });
      const draftLine = await insertLine(draftId);
      await db
        .insert(productionOrderMaterial)
        .values({ lineId: draftLine, itemId: materialId, quantity: "10" });
      return { frozenId, frozenLine, draftId, draftLine };
    }

    it("takes no line or material moved into it", async () => {
      const { frozenId, frozenLine, draftLine } = await frozenAndDraft();
      const admin = getAdminDatabase();
      expect(
        await failure(() =>
          admin
            .update(productionOrderLine)
            .set({ orderId: frozenId })
            .where(eq(productionOrderLine.id, draftLine)),
        ),
      ).toEqual({ code: "P0001", message: refused });
      expect(
        await failure(() =>
          admin
            .update(productionOrderMaterial)
            .set({ lineId: frozenLine })
            .where(eq(productionOrderMaterial.lineId, draftLine)),
        ),
      ).toEqual({ code: "P0001", message: refused });
    });

    it("gives up no line or material moved out of it", async () => {
      const { frozenLine, draftId } = await frozenAndDraft();
      const admin = getAdminDatabase();
      expect(
        await failure(() =>
          admin
            .update(productionOrderLine)
            .set({ orderId: draftId, position: 2 })
            .where(eq(productionOrderLine.id, frozenLine)),
        ),
      ).toEqual({ code: "P0001", message: refused });
    });

    it("takes no new line or material", async () => {
      const { frozenId, frozenLine } = await frozenAndDraft();
      const admin = getAdminDatabase();
      expect(
        await failure(() =>
          admin.insert(productionOrderLine).values({
            orderId: frozenId,
            position: 2,
            itemId: materialId,
            quantityPlanned: "1",
          }),
        ),
      ).toEqual({ code: "P0001", message: refused });
      expect(
        await failure(() =>
          admin
            .insert(productionOrderMaterial)
            .values({ lineId: frozenLine, itemId: materialId, quantity: "1" }),
        ),
      ).toEqual({ code: "P0001", message: refused });
    });
  });

  it("still moves a line between two drafts", async () => {
    const first = await insertOrder();
    const line = await insertLine(first);
    const second = await insertOrder({ code: "LSX-2026-005" });
    await db
      .update(productionOrderLine)
      .set({ orderId: second })
      .where(eq(productionOrderLine.id, line));
    const [row] = await db
      .select({ orderId: productionOrderLine.orderId })
      .from(productionOrderLine);
    expect(row?.orderId).toBe(second);
  });

  it("freezes a cancelled order", async () => {
    const orderId = await insertOrder();
    await insertLine(orderId);
    await cancel(orderId);
    expect(
      await failure(() =>
        db
          .update(productionOrder)
          .set({ team: "x" })
          .where(eq(productionOrder.id, orderId)),
      ),
    ).toEqual({
      code: "P0001",
      message: "Lệnh đã hủy, không sửa hay xóa được",
    });
  });
});

describe("production_order_submission", () => {
  async function submission() {
    const orderId = await insertOrder();
    const draftId = crypto.randomUUID();
    await db.insert(productionOrderSubmission).values({
      orderId,
      step: "RECEIVE",
      draftId,
      createdBy: userId,
    });
    return { orderId, draftId };
  }

  it("refuses UPDATE and DELETE even for the owner", async () => {
    const { draftId } = await submission();
    const admin = getAdminDatabase();
    const where = eq(productionOrderSubmission.draftId, draftId);
    const refused = {
      code: "P0001",
      message: "Lượt gửi của lệnh sản xuất chỉ ghi thêm",
    };
    expect(
      await failure(() =>
        admin
          .update(productionOrderSubmission)
          .set({ step: "COUNT" })
          .where(where),
      ),
    ).toEqual(refused);
    expect(
      await failure(() => admin.delete(productionOrderSubmission).where(where)),
    ).toEqual(refused);
  });

  it("gives the app role no UPDATE", async () => {
    const [row] = await db.execute<{ allowed: boolean }>(
      sql`select has_table_privilege(current_user, 'production_order_submission', 'UPDATE') as allowed`,
    );
    expect(row?.allowed).toBe(false);
  });

  it("refuses the same draft id twice", async () => {
    const { orderId, draftId } = await submission();
    expect(
      (
        await failure(() =>
          db.insert(productionOrderSubmission).values({
            orderId,
            step: "REPORT",
            draftId,
            createdBy: userId,
          }),
        )
      ).code,
    ).toBe("23505");
  });
});

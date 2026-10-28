import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { resetCatalogTables } from "@/test/catalog";
import { resetInventoryTables, truncateWithLedger } from "@/test/inventory";

import { user } from "./auth";
import { item, itemGroup, location } from "./catalog";
import { stocktake, stocktakeGroup, stocktakeLine } from "./stocktakes";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

const userId = "stocktake-schema-user";
let itemId = "";
let groupId = "";
let yardId = "";
let workshopId = "";

beforeEach(async () => {
  await truncateWithLedger(db, sql`truncate table "user" cascade`);
  await resetInventoryTables(handle);
  await resetCatalogTables(handle);
  await db.insert(user).values({
    id: userId,
    name: "Văn Tùng",
    email: "vantung@users.invalid",
    username: "vantung",
    role: "WAREHOUSE",
  });
  const [group] = await db
    .insert(itemGroup)
    .values({ name: "Giàn giáo", nameKey: "gian giao" })
    .returning({ id: itemGroup.id });
  groupId = group?.id ?? "";
  const [row] = await db
    .insert(item)
    .values({
      code: "GG-K17",
      name: "Khung giàn giáo 1,7m",
      groupId,
      unit: "PIECE",
      standardWeightKg: "13.500",
      searchText: "khung gian giao 1,7m gg-k17",
    })
    .returning({ id: item.id });
  itemId = row?.id ?? "";
  const places = await db
    .select({ id: location.id, code: location.code })
    .from(location);
  yardId = places.find((place) => place.code === "BAI-01")?.id ?? "";
  workshopId = places.find((place) => place.code === "XUONG-01")?.id ?? "";
});

type SessionValues = Partial<typeof stocktake.$inferInsert>;
type LineValues = Partial<typeof stocktakeLine.$inferInsert>;

async function insertSession(values: SessionValues = {}) {
  const [row] = await db
    .insert(stocktake)
    .values({
      code: "KK-2026-003",
      locationId: yardId,
      scopeAll: true,
      clientStartId: crypto.randomUUID(),
      startedBy: userId,
      ...values,
    })
    .returning({ id: stocktake.id });
  return row?.id ?? "";
}

async function insertLine(stocktakeId: string, values: LineValues = {}) {
  await db.insert(stocktakeLine).values({
    stocktakeId,
    itemId,
    condition: "GOOD",
    origin: "LISTED",
    ...values,
  });
}

const counted: LineValues = {
  countedAt: new Date(),
  countedQuantity: "1226",
  bookQuantity: "1230",
};

async function approve(stocktakeId: string) {
  await db
    .update(stocktake)
    .set({ status: "DONE", approvedBy: userId, approvedAt: new Date() })
    .where(eq(stocktake.id, stocktakeId));
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

describe("stocktake checks", () => {
  it.each<[string, SessionValues]>([
    ["unknown status", { status: "OPEN" }],
    ["round 0", { round: 0 }],
    ["done without approver", { status: "DONE" }],
    ["approver while counting", { approvedBy: userId, approvedAt: new Date() }],
    ["cancelled without reason", { status: "CANCELLED" }],
    [
      "cancelled with an empty reason",
      {
        status: "CANCELLED",
        cancelledBy: userId,
        cancelledAt: new Date(),
        cancelReason: "",
      },
    ],
    ["posting while counting", { postingId: crypto.randomUUID() }],
    ["return reason over 500 characters", { returnedReason: "x".repeat(501) }],
  ])("refuses a session with %s", async (_name, values) => {
    expect(await errorCode(() => insertSession(values))).toBe("23514");
  });

  it("refuses two codes alike and two starts with one request id", async () => {
    const clientStartId = crypto.randomUUID();
    await insertSession({ clientStartId });
    expect(
      await errorCode(() =>
        insertSession({ code: "KK-2026-004", locationId: workshopId }),
      ),
    ).toBe("none");
    expect(
      await errorCode(() =>
        insertSession({ code: "KK-2026-005", clientStartId }),
      ),
    ).toBe("23505");
    expect(
      await errorCode(() =>
        insertSession({ locationId: workshopId, status: "CANCELLED" }),
      ),
    ).toBe("23514");
  });

  it("allows one open session per place", async () => {
    const first = await insertSession();
    expect(await errorCode(() => insertSession({ code: "KK-2026-004" }))).toBe(
      "23505",
    );
    await db
      .update(stocktake)
      .set({ status: "SUBMITTED" })
      .where(eq(stocktake.id, first));
    expect(await errorCode(() => insertSession({ code: "KK-2026-004" }))).toBe(
      "23505",
    );
    await approve(first);
    expect(await errorCode(() => insertSession({ code: "KK-2026-004" }))).toBe(
      "none",
    );
  });
});

describe("stocktake_line checks", () => {
  it.each<[string, LineValues]>([
    ["unknown condition", { condition: "BROKEN" }],
    ["unknown origin", { origin: "SCANNED" }],
    ["count without time", { countedQuantity: "10", bookQuantity: "10" }],
    ["time without book", { countedAt: new Date(), countedQuantity: "10" }],
    ["negative count", { ...counted, countedQuantity: "-1" }],
    ["unknown flag", { flags: ["LOST"] }],
    ["negative unit cost", { unitCost: -1 }],
  ])("refuses a line with %s", async (_name, values) => {
    const id = await insertSession();
    expect(await errorCode(() => insertLine(id, values))).toBe("23514");
  });

  it("accepts a counted line with flags and a negative book", async () => {
    const id = await insertSession();
    expect(
      await errorCode(() =>
        insertLine(id, {
          ...counted,
          bookQuantity: "-2",
          flags: ["MOVED", "OVER_PCT"],
        }),
      ),
    ).toBe("none");
  });

  it("refuses the same item and condition twice in a session", async () => {
    const id = await insertSession();
    await insertLine(id);
    expect(await errorCode(() => insertLine(id))).toBe("23505");
    expect(
      await errorCode(() => insertLine(id, { condition: "NEEDS_REPAIR" })),
    ).toBe("none");
  });

  it("keeps an item, a place and a group a session refers to", async () => {
    const id = await insertSession({ scopeAll: false });
    await db.insert(stocktakeGroup).values({ stocktakeId: id, groupId });
    await insertLine(id);
    expect(
      await errorCode(() => db.delete(item).where(eq(item.id, itemId))),
    ).toBe("23503");
    expect(
      await errorCode(() => db.delete(location).where(eq(location.id, yardId))),
    ).toBe("23503");
    expect(
      await errorCode(() =>
        db.delete(itemGroup).where(eq(itemGroup.id, groupId)),
      ),
    ).toBe("23503");
  });
});

describe("approved stocktakes", () => {
  it("deletes an open session with its lines and groups", async () => {
    const id = await insertSession({ scopeAll: false });
    await db.insert(stocktakeGroup).values({ stocktakeId: id, groupId });
    await insertLine(id);
    await db.delete(stocktake).where(eq(stocktake.id, id));
    expect(await db.select().from(stocktakeLine)).toHaveLength(0);
    expect(await db.select().from(stocktakeGroup)).toHaveLength(0);
  });

  it("freezes an approved session and its lines", async () => {
    const id = await insertSession();
    await insertLine(id, counted);
    await approve(id);
    const frozen = "Phiên kiểm kê đã ghi sổ, không sửa được";
    expect(
      await errorMessage(() =>
        db.update(stocktake).set({ round: 2 }).where(eq(stocktake.id, id)),
      ),
    ).toContain(frozen);
    expect(
      await errorMessage(() =>
        db.delete(stocktake).where(eq(stocktake.id, id)),
      ),
    ).toContain(frozen);
    expect(
      await errorMessage(() =>
        db.update(stocktakeLine).set({ countedQuantity: "1230" }),
      ),
    ).toContain(frozen);
    expect(await errorMessage(() => db.delete(stocktakeLine))).toContain(
      frozen,
    );
    expect(
      await errorMessage(() => insertLine(id, { condition: "SCRAP" })),
    ).toContain(frozen);
    const [line] = await db.select().from(stocktakeLine);
    expect(line?.countedQuantity).toBe("1226.000");
  });
});

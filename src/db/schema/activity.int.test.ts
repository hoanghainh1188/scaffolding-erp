import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { getAdminDatabase } from "@/test/admin";
import { truncateWithLedger } from "@/test/inventory";

import { activityLog } from "./activity";
import { user } from "./auth";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

const userId = "activity-schema-user";

type Values = Partial<typeof activityLog.$inferInsert>;

function row(values: Values = {}): typeof activityLog.$inferInsert {
  return {
    createdAt: new Date("2026-10-28T15:47:13Z"),
    userId,
    role: "ACCOUNTANT",
    device: "DESKTOP",
    browser: "EDGE",
    action: "UPDATE",
    documentType: "PURCHASE_ORDER",
    documentId: "00000000-0000-4000-8000-000000000055",
    documentCode: "PO-2026-055",
    summary: "Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫",
    changes: [
      {
        field: "lines.GG-K17.unitPrice",
        label: "Đơn giá GG-K17",
        before: "190.000 ₫",
        after: "185.000 ₫",
      },
    ],
    flags: ["OFF_HOURS"],
    ...values,
  };
}

async function errorOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } })
      .cause;
    return `${cause?.code ?? "?"} ${cause?.message ?? (error as Error).message}`;
  }
  return "none";
}

beforeEach(async () => {
  await truncateWithLedger(sql`truncate table "user" cascade`);
  await db.insert(user).values({
    id: userId,
    name: "Thu Hà",
    email: "thuha@users.invalid",
    username: "thuha",
    role: "ACCOUNTANT",
  });
});

describe("activity_log checks", () => {
  it("stores a valid row", async () => {
    const [saved] = await db.insert(activityLog).values(row()).returning();
    expect(saved?.changes).toHaveLength(1);
    expect(saved?.flags).toEqual(["OFF_HOURS"]);
  });

  it("stores a sign-in without a document", async () => {
    await db.insert(activityLog).values(
      row({
        action: "SIGN_IN",
        documentType: null,
        documentId: null,
        documentCode: null,
        summary: "Đăng nhập thành công",
        changes: [],
        flags: [],
      }),
    );
    expect(await db.$count(activityLog)).toBe(1);
  });

  it.each<[string, Values]>([
    ["role", { role: "ADMIN" }],
    ["device", { device: "TABLET" }],
    ["browser", { browser: "OPERA" }],
    ["action", { action: "VIEW" }],
    ["document type", { documentType: "INVOICE" }],
    ["sign-in with a document", { action: "SIGN_IN" }],
    ["document action without a type", { documentType: null }],
    ["empty summary", { summary: "" }],
    ["summary over 300", { summary: "x".repeat(301) }],
    ["changes not an array", { changes: {} as never }],
    ["unknown flag", { flags: ["LATE"] }],
  ])("rejects a bad %s", async (_name, values) => {
    expect(
      await errorOf(() => db.insert(activityLog).values(row(values))),
    ).toMatch(/^23514 /);
  });

  it("keeps the user: deleting someone with log rows fails", async () => {
    await db.insert(activityLog).values(row());
    expect(
      await errorOf(() => db.delete(user).where(eq(user.id, userId))),
    ).toMatch(/^23503 /);
  });
});

// The app role is refused by its privileges before the trigger runs
// (src/db/privileges.int.test.ts); the owner shows the trigger still holds.
const admin = getAdminDatabase();

describe("activity_log is append only", () => {
  beforeEach(async () => {
    await db.insert(activityLog).values(row());
  });

  it("blocks UPDATE", async () => {
    expect(
      await errorOf(() =>
        admin
          .update(activityLog)
          .set({ summary: "x" })
          .where(sql`true`),
      ),
    ).toBe("P0001 Nhật ký thao tác chỉ ghi thêm");
    const [kept] = await db.select().from(activityLog);
    expect(kept?.summary).toBe("Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫");
  });

  it("blocks DELETE", async () => {
    expect(await errorOf(() => admin.delete(activityLog))).toBe(
      "P0001 Nhật ký thao tác chỉ ghi thêm",
    );
    expect(await db.$count(activityLog)).toBe(1);
  });

  it("blocks TRUNCATE without the test flag", async () => {
    expect(
      await errorOf(() => admin.execute(sql`truncate table "activity_log"`)),
    ).toBe("P0001 Nhật ký thao tác chỉ ghi thêm");
    expect(await db.$count(activityLog)).toBe(1);
  });

  it("lets TRUNCATE through on a _test database with the flag", async () => {
    await truncateWithLedger(sql`truncate table "activity_log"`);
    expect(await db.$count(activityLog)).toBe(0);
  });
});

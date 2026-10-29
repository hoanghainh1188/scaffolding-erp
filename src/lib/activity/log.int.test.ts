import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { activityLog } from "@/db/schema";
import { activityRows } from "@/test/activity";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
  type TestUser,
} from "@/test/auth";

import { systemActor } from "./actor";
import { logActivity, type ActivityEntry } from "./log";

const ctx = createTestContext();
afterAll(ctx.close);

let thuha: TestUser;

beforeEach(async () => {
  await resetAuthTables(ctx);
  thuha = await createTestUser(ctx, { role: "ACCOUNTANT", username: "thuha" });
});

const price = {
  field: "lines.GG-K17.unitPrice",
  label: "Đơn giá GG-K17",
  before: "190.000 ₫",
  after: "185.000 ₫",
};

const edit: ActivityEntry = {
  action: "UPDATE",
  document: {
    type: "PURCHASE_ORDER",
    id: "00000000-0000-4000-8000-000000000055",
    code: "PO-2026-055",
  },
  summary: "Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫",
  changes: [price],
};

const at = (iso: string) => ({ now: new Date(iso) });

describe("logActivity", () => {
  it("writes every column of the row", async () => {
    const actor = systemActor(thuha, { device: "DESKTOP", browser: "EDGE" });
    await ctx.db.transaction((tx) =>
      logActivity(tx, actor, edit, at("2026-10-28T22:47:13+07:00")),
    );
    const [row] = await activityRows(ctx.db);
    expect(row).toMatchObject({
      createdAt: new Date("2026-10-28T15:47:13Z"),
      userId: thuha.id,
      role: "ACCOUNTANT",
      device: "DESKTOP",
      browser: "EDGE",
      action: "UPDATE",
      documentType: "PURCHASE_ORDER",
      documentCode: "PO-2026-055",
      summary: "Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫",
      changes: [price],
      flags: ["OFF_HOURS"],
    });
  });

  it("leaves no row when the action rolls back", async () => {
    await expect(
      ctx.db.transaction(async (tx) => {
        await logActivity(tx, thuha, edit);
        throw new Error("Không đủ hàng");
      }),
    ).rejects.toThrow("Không đủ hàng");
    expect(await ctx.db.$count(activityLog)).toBe(0);
  });

  it("writes nothing for an edit that changed nothing", async () => {
    await ctx.db.transaction((tx) =>
      logActivity(tx, thuha, { ...edit, changes: [] }),
    );
    expect(await ctx.db.$count(activityLog)).toBe(0);
  });

  it("flags off hours from the time it is given, Vietnam time", async () => {
    await ctx.db.transaction(async (tx) => {
      await logActivity(tx, thuha, edit, at("2026-10-28T20:59:59+07:00"));
      await logActivity(tx, thuha, edit, at("2026-10-28T21:00:00+07:00"));
      await logActivity(tx, thuha, edit, at("2026-10-28T06:00:00+07:00"));
      await logActivity(tx, thuha, edit, at("2026-10-28T05:59:59+07:00"));
    });
    expect((await activityRows(ctx.db)).map((row) => row.flags)).toEqual([
      [],
      ["OFF_HOURS"],
      [],
      ["OFF_HOURS"],
    ]);
  });

  it("carries several flags on one row", async () => {
    await ctx.db.transaction((tx) =>
      logActivity(
        tx,
        thuha,
        { ...edit, sensitive: true, anomaly: true },
        at("2026-10-27T23:05:00+07:00"),
      ),
    );
    expect((await activityRows(ctx.db))[0]?.flags).toEqual([
      "OFF_HOURS",
      "SENSITIVE",
      "ANOMALY",
    ]);
  });

  it("clamps a long summary and folds many changes", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      ...price,
      field: `f${i}`,
    }));
    await ctx.db.transaction((tx) =>
      logActivity(tx, thuha, {
        ...edit,
        summary: "x".repeat(400),
        changes: many,
      }),
    );
    const [row] = await activityRows(ctx.db);
    expect(row?.summary).toHaveLength(300);
    expect(row?.changes).toHaveLength(50);
    expect(row?.changes.at(-1)?.label).toBe("Và 11 thay đổi khác");
  });

  it("logs a sign-in without a document", async () => {
    await ctx.db.transaction((tx) =>
      logActivity(tx, thuha, {
        action: "SIGN_IN",
        summary: "Đăng nhập thành công",
      }),
    );
    expect((await activityRows(ctx.db))[0]).toMatchObject({
      action: "SIGN_IN",
      documentType: null,
      documentCode: null,
      changes: [],
    });
  });

  it("refuses a document action without its document", async () => {
    await expect(
      ctx.db.transaction((tx) =>
        logActivity(tx, thuha, { action: "CREATE", summary: "x" }),
      ),
    ).rejects.toThrow("activity CREATE needs a document");
  });
});

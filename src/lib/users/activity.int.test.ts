// Users and passwords in the activity log (activity-log tasks 5.7).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { changePassword } from "@/lib/auth/change-password";
import { activityRows, lastActivity } from "@/test/activity";
import {
  TEST_PASSWORD,
  createTestContext,
  createTestUser,
  resetAuthTables,
  type TestUser,
} from "@/test/auth";

import {
  changeRole,
  createUser,
  lockUser,
  resetPassword,
  unlockUser,
} from "./service";

const ctx = createTestContext();
afterAll(ctx.close);

let minhanh: TestUser;
let thuha: TestUser;

beforeEach(async () => {
  await resetAuthTables();
  minhanh = await createTestUser(ctx, {
    role: "DIRECTOR",
    username: "minhanh",
  });
  thuha = await createTestUser(ctx, { role: "ACCOUNTANT", username: "thuha" });
});

const everything = async () => JSON.stringify(await activityRows(ctx.db));

describe("user changes in the activity log", () => {
  it("never stores a temporary password", async () => {
    const created = await createUser(ctx, minhanh, {
      name: "Ngọc Lam",
      username: "ngoclam",
      role: "SALES",
    });
    const reset = await resetPassword(ctx, minhanh, thuha.id);
    await lockUser(ctx, minhanh, thuha.id);
    const unlocked = await unlockUser(ctx, minhanh, thuha.id);
    if (!created.ok || !reset.ok || !unlocked.ok) throw new Error("setup");
    const text = await everything();
    for (const secret of [
      created.data.tempPassword,
      reset.data.tempPassword,
      unlocked.data.tempPassword,
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(await lastActivity(ctx.db, "ngoclam")).toMatchObject({
      action: "CREATE",
      documentType: "USER",
      summary: "Ngọc Lam · Kinh doanh",
    });
  });

  it("flags role, lock, unlock and reset as sensitive", async () => {
    await changeRole(ctx, minhanh, thuha.id, "SALES");
    await lockUser(ctx, minhanh, thuha.id);
    await unlockUser(ctx, minhanh, thuha.id);
    await resetPassword(ctx, minhanh, thuha.id);
    const rows = await activityRows(ctx.db, "thuha");
    expect(rows.map((row) => row.summary)).toEqual([
      "Vai trò thuha: Kế toán → Kinh doanh",
      "Khóa tài khoản thuha",
      "Mở khóa thuha, cấp mật khẩu tạm mới",
      "Đặt lại mật khẩu cho thuha",
    ]);
    expect(rows.every((row) => row.flags.includes("SENSITIVE"))).toBe(true);
    expect(rows[0]?.changes).toEqual([
      {
        field: "role",
        label: "Vai trò",
        before: "Kế toán",
        after: "Kinh doanh",
      },
    ]);
    expect(rows[1]?.changes).toEqual([
      {
        field: "status",
        label: "Trạng thái",
        before: "Đang dùng",
        after: "Đã khóa",
      },
    ]);
  });

  it("logs nothing for a refused change or the same role", async () => {
    // Demoting the last director is refused.
    expect((await changeRole(ctx, thuha, minhanh.id, "SALES")).ok).toBe(false);
    await changeRole(ctx, minhanh, thuha.id, "ACCOUNTANT");
    expect(await activityRows(ctx.db)).toEqual([]);
  });

  it("logs a password change without the password", async () => {
    const result = await changePassword(ctx, {
      actor: thuha,
      currentSessionId: "none",
      currentPassword: TEST_PASSWORD,
      newPassword: "Giàn giáo 2026!",
      confirmPassword: "Giàn giáo 2026!",
    });
    expect(result.ok).toBe(true);
    expect(await lastActivity(ctx.db, "thuha")).toMatchObject({
      action: "UPDATE",
      summary: "Đổi mật khẩu",
      userId: thuha.id,
      flags: expect.not.arrayContaining(["SENSITIVE"]),
    });
    const text = await everything();
    expect(text).not.toContain("Giàn giáo 2026!");
    expect(text).not.toContain(TEST_PASSWORD);
  });
});

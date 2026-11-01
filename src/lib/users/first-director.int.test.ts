import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { user } from "@/db/schema";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
  signInAs,
} from "@/test/auth";

import { createFirstDirector } from "./first-director";

const ctx = createTestContext();

afterAll(ctx.close);
beforeEach(() => resetAuthTables());

describe("createFirstDirector", () => {
  it("creates Giám đốc on an empty database", async () => {
    const result = await createFirstDirector(ctx, {
      name: "Minh Anh",
      username: "minhanh",
    });
    expect(result.ok).toBe(true);
    const [row] = await ctx.db.select().from(user);
    expect(row).toMatchObject({
      username: "minhanh",
      name: "Minh Anh",
      role: "DIRECTOR",
      mustChangePassword: true,
    });
    const password = result.ok ? result.data.tempPassword : "";
    await expect(
      signInAs(ctx, { username: "minhanh", password }),
    ).resolves.toBeTruthy();
  });

  it("refuses when an active director exists", async () => {
    await createTestUser(ctx, { role: "DIRECTOR", username: "minhanh" });
    expect(
      await createFirstDirector(ctx, {
        name: "Giám đốc 2",
        username: "giamdoc2",
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Đã có tài khoản Giám đốc. Dùng màn Người dùng để thêm tài khoản",
    });
    expect(await ctx.db.select().from(user)).toHaveLength(1);
  });

  it("creates only one director when run twice at once", async () => {
    const results = await Promise.all([
      createFirstDirector(ctx, { name: "Minh Anh", username: "minhanh" }),
      createFirstDirector(ctx, { name: "Giám đốc 2", username: "giamdoc2" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await ctx.db.select().from(user)).toHaveLength(1);
  });

  it("validates the login name", async () => {
    expect(
      await createFirstDirector(ctx, {
        name: "Minh Anh",
        username: "minh anh",
      }),
    ).toMatchObject({
      status: 400,
      error: "Chữ thường không dấu, không khoảng trắng",
    });
  });
});

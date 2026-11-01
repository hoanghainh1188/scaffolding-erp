// The activity log API (activity-log tasks 6.3, spec "Quyền xem nhật ký").
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { logActivity } from "@/lib/activity/log";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  resetAuthTables,
  signInAs,
  type TestUser,
} from "@/test/auth";

import * as exportRoute from "./export/route";
import * as listRoute from "./route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let minhanh: TestUser;
let thuha: TestUser;
let vantung: TestUser;

beforeEach(async () => {
  await resetAuthTables();
  minhanh = await createTestUser(ctx, {
    role: "DIRECTOR",
    username: "minhanh",
  });
  thuha = await createTestUser(ctx, { role: "ACCOUNTANT", username: "thuha" });
  vantung = await createTestUser(ctx, {
    role: "WAREHOUSE",
    username: "vantung",
  });
  await ctx.db.transaction((tx) =>
    logActivity(tx, thuha, {
      action: "UPDATE",
      document: { type: "SUPPLIER", id: "s", code: "NCC-0004" },
      summary: "Số tài khoản: •••• 1234 → •••• 5678",
      sensitive: true,
    }),
  );
});

const list = (query: string, cookie?: string) =>
  listRoute.GET(appRequest(`/api/activity${query}`, { cookie }));
const download = (query: string, cookie?: string) =>
  exportRoute.GET(appRequest(`/api/activity/export${query}`, { cookie }));

describe("who may read the activity log", () => {
  it("refuses the accountant and the storekeeper with 403", async () => {
    for (const person of [thuha, vantung]) {
      const cookie = await signInAs(ctx, person);
      for (const response of [
        await list("", cookie),
        await download("", cookie),
      ]) {
        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body).toEqual({
          success: false,
          data: null,
          error: "Bạn không có quyền thực hiện thao tác này",
        });
      }
    }
  });

  it("asks a signed-out visitor to sign in", async () => {
    expect((await list("")).status).toBe(401);
    expect((await download("")).status).toBe(401);
  });

  it("has no route that writes or deletes", () => {
    for (const route of [listRoute, exportRoute]) {
      expect(
        Object.keys(route).filter((name) =>
          ["POST", "PUT", "PATCH", "DELETE"].includes(name),
        ),
      ).toEqual([]);
    }
  });
});

describe("the director reads and exports", () => {
  it("lists the filter with tiles and days", async () => {
    const cookie = await signInAs(ctx, minhanh);
    const response = await list("?code=ncc-0004", cookie);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({
      documentCode: "NCC-0004",
      username: "thuha",
      flags: expect.arrayContaining(["SENSITIVE"]),
    });
    expect(data.summary.total).toBe(1);
    expect(data.nextCursor).toBeNull();
  });

  it("answers 400 for a bad filter", async () => {
    const cookie = await signInAs(ctx, minhanh);
    const response = await list("?from=2026-10-28&to=2026-10-27", cookie);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Từ ngày phải trước hoặc bằng đến ngày",
    );
  });

  it("downloads an .xlsx named after the range", async () => {
    const cookie = await signInAs(ctx, minhanh);
    const response = await download("?from=2026-10-01&to=2026-12-31", cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="nhat-ky-2026-10-01-2026-12-31.xlsx"',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

// GET /api/reports/export (management-reports tasks 4.1; spec
// management-reports "Ai xem Báo cáo", "Xuất Excel báo cáo").
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toBusinessDate } from "@/domain/business-date";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  signInAs,
  TEST_PASSWORD,
} from "@/test/auth";
import { setupInventoryFixture } from "@/test/inventory";

import * as exported from "./export/route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

const cookies = new Map<string, string>();
const month = toBusinessDate(new Date()).slice(0, 7);

beforeAll(async () => {
  await setupInventoryFixture(ctx);
  for (const [role, username] of [
    ["SALES", "quocbao"],
    ["WAREHOUSE", "vantung"],
    ["WORKSHOP", "xuong"],
  ] as const) {
    await createTestUser(ctx, { role, username });
  }
  for (const name of ["minhanh", "thuha", "quocbao", "vantung", "xuong"]) {
    cookies.set(
      name,
      await signInAs(ctx, { username: name, password: TEST_PASSWORD }),
    );
  }
});

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

const get = (path: string, as: string) =>
  (exported.GET as unknown as Handler)(
    appRequest(path, { cookie: cookies.get(as) }),
    { params: Promise.resolve({}) },
  );

describe("/api/reports/export", () => {
  it("lets the director and the accountant download, nobody else", async () => {
    for (const [as, status] of [
      ["minhanh", 200],
      ["thuha", 200],
      ["quocbao", 403],
      ["vantung", 403],
      ["xuong", 403],
    ] as const) {
      const response = await get(
        `/api/reports/export?period=month&value=${month}`,
        as,
      );
      expect(response.status).toBe(status);
      if (status === 200) {
        expect(response.headers.get("content-disposition")).toContain(
          `bao-cao-${month}.xlsx`,
        );
      } else {
        expect(await response.text()).not.toMatch(/\d{1,3}(\.\d{3})+ ₫/);
      }
    }
  });

  it.each([
    "period=week&value=2026-10",
    "period=month&value=2026-13",
    "period=month&value=2099-01",
    "period=month",
  ])("refuses %s", async (query) => {
    const response = await get(`/api/reports/export?${query}`, "minhanh");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Kỳ báo cáo không hợp lệ",
    });
  });
});

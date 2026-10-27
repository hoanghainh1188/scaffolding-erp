// Receiving API (goods-receipt task 5.1, design D11, D13).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ROLES, type Role } from "@/domain/role";
import { postReceipt } from "@/lib/receiving/post";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  signInAs,
} from "@/test/auth";
import {
  OCT_26,
  orderLineIds,
  placedOrder,
  setupReceivingFixture,
  tripOne,
  type ReceivingFixture,
} from "@/test/receiving";

import * as purchasingOrders from "../purchasing/orders/route";
import * as scrapPrice from "../settings/scrap-price/route";
import * as stockLookup from "../stock/lookup/route";
import * as arrivals from "./arrivals/route";
import * as orderOne from "./orders/[code]/route";
import * as receiptOne from "./receipts/[code]/route";
import * as receipts from "./receipts/route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let fx: ReceivingFixture;
const cookies = new Map<Role, string>();
let code = "";
let lines = new Map<string, string>();

beforeEach(async () => {
  fx = await setupReceivingFixture(ctx);
  cookies.clear();
  for (const role of ROLES) {
    const person = await createTestUser(ctx, {
      role,
      username: `u${role.toLowerCase()}`,
    });
    cookies.set(role, await signInAs(ctx, person));
  }
  code = await placedOrder(ctx, fx);
  lines = await orderLineIds(ctx, code);
});

type Handler = (
  request: Request,
  context: { params: Promise<{ code: string }> },
) => Promise<Response>;

function call(
  handler: unknown,
  path: string,
  options: { method?: string; role?: Role; body?: unknown; code?: string } = {},
) {
  return (handler as Handler)(
    appRequest(path, {
      method: options.method ?? "GET",
      cookie: options.role ? cookies.get(options.role) : undefined,
      body: options.body,
    }),
    { params: Promise.resolve({ code: options.code ?? "" }) },
  );
}

async function postedReceipt(): Promise<string> {
  const result = await postReceipt(ctx.db, fx.warehouse, tripOne(code, lines), {
    now: OCT_26,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.code;
}

describe("signed out", () => {
  it.each([
    ["arrivals", arrivals.GET, "/api/receiving/arrivals", "GET"],
    ["receipts", receipts.POST, "/api/receiving/receipts", "POST"],
    ["stock", stockLookup.GET, "/api/stock/lookup?code=GG-K17", "GET"],
    ["scrap price", scrapPrice.GET, "/api/settings/scrap-price", "GET"],
  ])("%s answers 401", async (_name, handler, path, method) => {
    const response = await call(handler, path, {
      method,
      body: method === "POST" ? {} : undefined,
    });
    expect(response.status).toBe(401);
  });
});

describe("permissions (design D13)", () => {
  it("lets the storekeeper post a receipt and refuses sales", async () => {
    const body = tripOne(code, lines);
    const sales = await call(receipts.POST, "/api/receiving/receipts", {
      method: "POST",
      role: "SALES",
      body,
    });
    expect(sales.status).toBe(403);
    expect(await sales.json()).toMatchObject({
      error: "Bạn không có quyền thực hiện thao tác này",
    });
    const created = await call(receipts.POST, "/api/receiving/receipts", {
      method: "POST",
      role: "WAREHOUSE",
      body,
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      data: { code: "PN-2026-001", tripNo: 1, replayed: false },
    });
    const again = await call(receipts.POST, "/api/receiving/receipts", {
      method: "POST",
      role: "WAREHOUSE",
      body,
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({
      data: { code: "PN-2026-001", replayed: true },
    });
  });

  it("lets office roles read a receipt and refuses the workshop", async () => {
    const receipt = await postedReceipt();
    const path = `/api/receiving/receipts/${receipt}`;
    for (const role of [
      "ACCOUNTANT",
      "SALES",
      "DIRECTOR",
      "WAREHOUSE",
    ] as const) {
      const response = await call(receiptOne.GET, path, {
        role,
        code: receipt,
      });
      expect(response.status).toBe(200);
    }
    const workshop = await call(receiptOne.GET, path, {
      role: "WORKSHOP",
      code: receipt,
    });
    expect(workshop.status).toBe(403);
    const missing = await call(
      receiptOne.GET,
      "/api/receiving/receipts/PN-2026-999",
      {
        role: "ACCOUNTANT",
        code: "PN-2026-999",
      },
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: "Không tìm thấy phiếu nhập",
    });
  });

  it("only lets the director change the scrap price", async () => {
    const accountant = await call(
      scrapPrice.POST,
      "/api/settings/scrap-price",
      {
        method: "POST",
        role: "ACCOUNTANT",
        body: { pricePerKg: 9_000 },
      },
    );
    expect(accountant.status).toBe(403);
    const director = await call(scrapPrice.POST, "/api/settings/scrap-price", {
      method: "POST",
      role: "DIRECTOR",
      body: { pricePerKg: 7_800 },
    });
    expect(director.status).toBe(201);
    const read = await call(scrapPrice.GET, "/api/settings/scrap-price", {
      role: "DIRECTOR",
    });
    expect(await read.json()).toMatchObject({
      data: { current: { pricePerKg: 7_800 } },
    });
  });

  it("keeps the office order list closed to the storekeeper", async () => {
    const response = await call(
      purchasingOrders.GET,
      "/api/purchasing/orders",
      {
        role: "WAREHOUSE",
      },
    );
    expect(response.status).toBe(403);
  });

  it("gives the storekeeper the order to receive without prices", async () => {
    const response = await call(orderOne.GET, `/api/receiving/orders/${code}`, {
      role: "WAREHOUSE",
      code,
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("GG-K17");
    expect(text).not.toContain("unitPrice");
    expect(text).not.toContain("185000");
    const sales = await call(orderOne.GET, `/api/receiving/orders/${code}`, {
      role: "SALES",
      code,
    });
    expect(sales.status).toBe(403);
  });

  it("lets every role look up stock, without cost", async () => {
    await postedReceipt();
    for (const role of ROLES) {
      const response = await call(
        stockLookup.GET,
        "/api/stock/lookup?code=gg-k17",
        { role },
      );
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("Khung giàn giáo 1,7m");
      expect(text).not.toMatch(/avg|cost|value/i);
    }
    const missing = await call(
      stockLookup.GET,
      "/api/stock/lookup?code=GG-X99",
      {
        role: "WAREHOUSE",
      },
    );
    expect(await missing.json()).toMatchObject({
      error: "Không tìm thấy mã GG-X99",
    });
  });
});

describe("bodies and lists", () => {
  it("answers a field error for a bad body", async () => {
    const response = await call(receipts.POST, "/api/receiving/receipts", {
      method: "POST",
      role: "WAREHOUSE",
      body: { ...tripOne(code, lines), draftId: "nháp-1" },
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "Mã nháp không hợp lệ",
      data: { field: "draftId" },
    });
    const wrongType = await call(receipts.POST, "/api/receiving/receipts", {
      method: "POST",
      role: "WAREHOUSE",
      body: { lines: "x" },
    });
    expect(wrongType.status).toBe(400);
  });

  it("lists arrivals and receipts by day", async () => {
    const list = await call(arrivals.GET, "/api/receiving/arrivals", {
      role: "WAREHOUSE",
    });
    expect(list.status).toBe(200);
    expect(
      (await list.json()).data.cards.map((card: { code: string }) => card.code),
    ).toContain(code);
    await postedReceipt();
    const page = await call(receipts.GET, "/api/receiving/receipts?days=2", {
      role: "WAREHOUSE",
    });
    expect((await page.json()).data.days[0].receipts[0].code).toBe(
      "PN-2026-001",
    );
  });
});

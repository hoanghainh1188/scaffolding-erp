// /api/production and /api/m/production (production-orders tasks 3.1, 3.2,
// 3.7, 3.9, 3.11): who may take each step, and that the phone never gets a
// price.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { productionOrder } from "@/db/schema";
import { can, type Permission } from "@/domain/permissions";
import { ROLES, type Role } from "@/domain/role";
import { createGroup } from "@/lib/catalog/item-groups";
import { createItem } from "@/lib/catalog/items";
import { createBom } from "@/lib/production/boms";
import {
  assignProductionOrder,
  createProductionOrder,
} from "@/lib/production/orders";
import { receiveProductionOrder } from "@/lib/production/floor";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  signInAs,
  type TestUser,
} from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import * as phoneOne from "../m/production/[code]/route";
import * as phoneCount from "../m/production/[code]/count/route";
import * as phoneReceive from "../m/production/[code]/receive/route";
import * as phoneReport from "../m/production/[code]/report/route";
import * as phoneMaterials from "../m/production/materials/route";
import * as phoneList from "../m/production/route";
import * as bomOne from "./boms/[itemCode]/route";
import * as boms from "./boms/route";
import * as approve from "./orders/[code]/approve/route";
import * as assign from "./orders/[code]/assign/route";
import * as cancel from "./orders/[code]/cancel/route";
import * as post from "./orders/[code]/post/route";
import * as recall from "./orders/[code]/recall/route";
import * as returned from "./orders/[code]/return/route";
import * as orderOne from "./orders/[code]/route";
import * as orders from "./orders/route";
import * as settings from "./settings/route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let fx: InventoryFixture;
let workshop: TestUser;
const cookies = new Map<Role, string>();
let code = "";
let scrapId = "";
let materialId = "";

function must<T>(
  result: { ok: true; data: T } | { ok: false; error: string },
): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const as = (role: Role) => cookies.get(role) ?? "";

async function newDraft(): Promise<string> {
  return must(
    await createProductionOrder(ctx.db, fx.accountant, {
      workshopId: fx.place("XUONG-01"),
      toLocationId: fx.place("BAI-01"),
      team: "tổ anh Lực",
      lines: [{ itemId: fx.item("GG-CH"), quantity: "10" }],
    }),
  ).code;
}

async function stamp(order = code): Promise<string> {
  const [row] = await ctx.db
    .select({ updatedAt: productionOrder.updatedAt })
    .from(productionOrder)
    .where(eq(productionOrder.code, order));
  return row?.updatedAt.toISOString() ?? "";
}

beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
  cookies.clear();
  for (const role of ROLES) {
    const person = await createTestUser(ctx, {
      role,
      username: `p${role.toLowerCase()}`,
    });
    if (role === "WORKSHOP") workshop = person;
    cookies.set(role, await signInAs(ctx, person));
  }
  const group = must(
    await createGroup(ctx.db, fx.director, {
      name: "Nguyên liệu",
      category: "MATERIAL",
    }),
  );
  materialId = must(
    await createItem(ctx.db, fx.director, {
      groupId: group.id,
      code: "VT-ONG27",
      name: "Ống D27",
      unit: "KG",
      standardWeightKg: null,
    }),
  ).id;
  scrapId = must(
    await createItem(ctx.db, fx.director, {
      groupId: group.id,
      code: "PL-SATVUN",
      name: "Sắt vụn",
      unit: "KG",
      standardWeightKg: null,
    }),
  ).id;
  must(
    await createBom(ctx.db, fx.accountant, "GG-CH", {
      laborRate: 8_000,
      materials: [{ itemId: materialId, quantity: "2.9" }],
    }),
  );
  code = await newDraft();
});

type Handler<P> = (
  request: Request,
  context: { params: Promise<P> },
) => Promise<Response>;

const call = <P>(
  handler: Handler<P>,
  params: P,
  path: string,
  init: { method?: string; body?: unknown; cookie: string },
) =>
  handler(appRequest(path, init), {
    params: Promise.resolve(params),
  });

const OFFICE_STEPS: [string, Handler<{ code: string }>, Permission][] = [
  ["assign", assign.POST, "production.manage"],
  ["recall", recall.POST, "production.manage"],
  ["return", returned.POST, "production.manage"],
  ["cancel", cancel.POST, "production.manage"],
  ["post", post.POST, "production.manage"],
  ["approve", approve.POST, "production.approve"],
];

describe("office steps", () => {
  it.each(OFFICE_STEPS)(
    "%s is 403 for everyone without the permission",
    async (name, handler, permission) => {
      for (const role of ROLES) {
        if (can(role, permission)) continue;
        const response = await call(
          handler,
          { code },
          `/api/production/orders/${code}/${name}`,
          { method: "POST", body: {}, cookie: as(role) },
        );
        expect(response.status).toBe(403);
      }
    },
  );

  it("lets Kinh doanh read an order but not assign it", async () => {
    const read = await call(
      orderOne.GET,
      { code },
      `/api/production/orders/${code}`,
      { cookie: as("SALES") },
    );
    expect(read.status).toBe(200);
    const assigned = await call(
      assign.POST,
      { code },
      `/api/production/orders/${code}/assign`,
      {
        method: "POST",
        body: { updatedAt: await stamp() },
        cookie: as("SALES"),
      },
    );
    expect(assigned.status).toBe(403);
  });

  it("keeps the list from the phone roles", async () => {
    for (const role of ["WAREHOUSE", "WORKSHOP"] as const) {
      const response = await orders.GET(
        appRequest("/api/production/orders", { cookie: as(role) }),
        { params: Promise.resolve({}) },
      );
      expect(response.status).toBe(403);
    }
    const response = await orders.GET(
      appRequest("/api/production/orders?status=draft", {
        cookie: as("ACCOUNTANT"),
      }),
      { params: Promise.resolve({}) },
    );
    const json = (await response.json()) as { data: { code: string }[] };
    expect(json.data.map((row) => row.code)).toEqual([code]);
  });

  it("creates an order through the API", async () => {
    const response = await orders.POST(
      appRequest("/api/production/orders", {
        method: "POST",
        cookie: as("ACCOUNTANT"),
        body: {
          workshopId: fx.place("XUONG-01"),
          toLocationId: fx.place("XUONG-01"),
          lines: [{ itemId: fx.item("GG-CH"), quantity: "1" }],
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
    const json = (await response.json()) as {
      error: string;
      data: { field: string };
    };
    expect(json.error).toBe("Thành phẩm phải nhập về một bãi");
    expect(json.data).toEqual({ field: "toLocationId" });
  });
});

describe("BOM and scrap item", () => {
  const bom = { itemCode: "GG-K17" };
  const body = () => ({
    laborRate: 1_000,
    materials: [{ itemId: materialId, quantity: "1" }],
  });

  it("is written by Giám đốc and Kế toán only", async () => {
    const response = await call(
      bomOne.PUT,
      bom,
      "/api/production/boms/GG-K17",
      { method: "PUT", body: body(), cookie: as("SALES") },
    );
    expect(response.status).toBe(403);
    const created = await call(bomOne.PUT, bom, "/api/production/boms/GG-K17", {
      method: "PUT",
      body: body(),
      cookie: as("ACCOUNTANT"),
    });
    expect(created.status).toBe(200);
  });

  it("is read by the office, not the workshop", async () => {
    const list = await boms.GET(
      appRequest("/api/production/boms", { cookie: as("SALES") }),
      { params: Promise.resolve({}) },
    );
    expect(list.status).toBe(200);
    const refused = await boms.GET(
      appRequest("/api/production/boms", { cookie: as("WORKSHOP") }),
      { params: Promise.resolve({}) },
    );
    expect(refused.status).toBe(403);
  });

  it("lets only the director change the scrap item", async () => {
    const put = (role: Role) =>
      settings.PUT(
        appRequest("/api/production/settings", {
          method: "PUT",
          cookie: as(role),
          body: { itemId: scrapId },
        }),
        { params: Promise.resolve({}) },
      );
    expect((await put("ACCOUNTANT")).status).toBe(403);
    expect((await put("DIRECTOR")).status).toBe(200);
  });
});

function moneyKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) moneyKeys(entry, found);
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (/price|cost|amount|rate|labor|value/i.test(key)) found.push(key);
      moneyKeys(entry, found);
    }
  }
  return found;
}

describe("the phone API", () => {
  beforeEach(async () => {
    must(
      await assignProductionOrder(ctx.db, fx.accountant, code, {
        updatedAt: await stamp(),
      }),
    );
  });

  it("is closed to the office roles", async () => {
    for (const role of ["ACCOUNTANT", "SALES"] as const) {
      const list = await phoneList.GET(
        appRequest("/api/m/production", { cookie: as(role) }),
        { params: Promise.resolve({}) },
      );
      expect(list.status).toBe(403);
      const one = await call(
        phoneOne.GET,
        { code },
        `/api/m/production/${code}`,
        { cookie: as(role) },
      );
      expect(one.status).toBe(403);
      const materials = await phoneMaterials.GET(
        appRequest("/api/m/production/materials", { cookie: as(role) }),
        { params: Promise.resolve({}) },
      );
      expect(materials.status).toBe(403);
    }
  });

  it("never answers a key that looks like money", async () => {
    const list = await phoneList.GET(
      appRequest("/api/m/production", { cookie: as("WORKSHOP") }),
      { params: Promise.resolve({}) },
    );
    const listJson = (await list.json()) as { data: unknown[] };
    expect(listJson.data).toHaveLength(1);
    expect(moneyKeys(listJson)).toEqual([]);
    const one = await call(
      phoneOne.GET,
      { code },
      `/api/m/production/${code}`,
      { cookie: as("WORKSHOP") },
    );
    const json = (await one.json()) as {
      data: { lines: { materials: { normPerUnit: string }[] }[] };
    };
    expect(json.data.lines[0]?.materials[0]?.normPerUnit).toBe("2.900");
    expect(moneyKeys(json)).toEqual([]);
  });

  it("splits who receives, reports and counts", async () => {
    const receive = (role: Role) =>
      call(phoneReceive.POST, { code }, `/api/m/production/${code}/receive`, {
        method: "POST",
        cookie: as(role),
        body: { draftId: randomUUID(), updatedAt: "x" },
      });
    expect((await receive("WAREHOUSE")).status).toBe(403);
    must(
      await receiveProductionOrder(ctx.db, workshop, code, {
        draftId: randomUUID(),
        updatedAt: await stamp(),
      }),
    );
    const report = await call(
      phoneReport.POST,
      { code },
      `/api/m/production/${code}/report`,
      {
        method: "POST",
        cookie: as("WAREHOUSE"),
        body: { draftId: randomUUID(), updatedAt: await stamp(), lines: [] },
      },
    );
    expect(report.status).toBe(403);
    const count = await call(
      phoneCount.POST,
      { code },
      `/api/m/production/${code}/count`,
      {
        method: "POST",
        cookie: as("WORKSHOP"),
        body: { draftId: randomUUID(), updatedAt: await stamp(), lines: [] },
      },
    );
    expect(count.status).toBe(403);
  });

  it("answers 422 when a line reports equipment as a material", async () => {
    must(
      await receiveProductionOrder(ctx.db, workshop, code, {
        draftId: randomUUID(),
        updatedAt: await stamp(),
      }),
    );
    const response = await call(
      phoneReport.POST,
      { code },
      `/api/m/production/${code}/report`,
      {
        method: "POST",
        cookie: as("WORKSHOP"),
        body: {
          draftId: randomUUID(),
          updatedAt: await stamp(),
          lines: [
            {
              itemId: fx.item("GG-CH"),
              finished: "10",
              offcutKg: "0",
              materials: [{ itemId: fx.item("GG-K17"), quantity: "1" }],
            },
          ],
        },
      },
    );
    expect(response.status).toBe(422);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe("Nguyên liệu phải là mã nhóm Vật tư");
  });
});

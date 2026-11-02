// Purchasing API permissions (purchase-orders task 4.2, design D10, D12).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { can, type Permission } from "@/domain/permissions";
import { PURCHASE_MESSAGES } from "@/domain/purchase-order";
import { ROLES, type Role } from "@/domain/role";
import { createOrder } from "@/lib/purchasing/orders";
import { getOrderByCode } from "@/lib/purchasing/queries";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  signInAs,
} from "@/test/auth";
import {
  d3Order,
  setupPurchasingFixture,
  type PurchasingFixture,
} from "@/test/purchasing";

import * as formOptions from "./form-options/route";
import * as orderCancel from "./orders/[code]/cancel/route";
import * as orderClose from "./orders/[code]/close/route";
import * as orderPlace from "./orders/[code]/place/route";
import * as orderOne from "./orders/[code]/route";
import * as orders from "./orders/route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let fx: PurchasingFixture;
const cookies = new Map<Role, string>();
let draft = "";
let placed = "";

async function make(place: boolean): Promise<string> {
  const result = await createOrder(ctx.db, fx.sales, d3Order(fx), { place });
  if (!result.ok) throw new Error(result.error);
  return result.data.code;
}

beforeEach(async () => {
  fx = await setupPurchasingFixture(ctx);
  cookies.clear();
  for (const role of ROLES) {
    const person = await createTestUser(ctx, {
      role,
      username: `u${role.toLowerCase()}`,
    });
    cookies.set(role, await signInAs(ctx, person));
  }
  draft = await make(false);
  placed = await make(true);
});

type Handler = (
  request: Request,
  context: { params: Promise<{ code: string }> },
) => Promise<Response>;

const on =
  (
    handler: unknown,
    method: string,
    path: (code: string) => string,
    code: () => string,
    payload?: unknown | (() => Promise<unknown>),
  ) =>
  async (cookie: string) => {
    const body =
      typeof payload === "function"
        ? await (payload as () => Promise<unknown>)()
        : payload;
    return (handler as Handler)(
      appRequest(path(code()), { method, cookie, body }),
      { params: Promise.resolve({ code: code() }) },
    );
  };

interface Call {
  name: string;
  permission: Permission;
  run: (cookie: string) => Promise<Response>;
}

const base = "/api/purchasing/orders";
const edit = async () => ({
  ...d3Order(fx),
  note: "Sửa qua API",
  updatedAt: (await getOrderByCode(ctx.db, placed))?.updatedAt.toISOString(),
});

const WRITES: Call[] = [
  {
    name: "POST orders",
    permission: "purchasing.manage",
    run: (cookie) =>
      orders.POST(
        appRequest(base, {
          method: "POST",
          cookie,
          body: { ...d3Order(fx), place: true },
        }),
      ),
  },
  {
    name: "PATCH order",
    permission: "purchasing.manage",
    run: on(
      orderOne.PATCH,
      "PATCH",
      (c) => `${base}/${c}`,
      () => placed,
      edit,
    ),
  },
  {
    name: "POST place",
    permission: "purchasing.manage",
    run: on(
      orderPlace.POST,
      "POST",
      (c) => `${base}/${c}/place`,
      () => draft,
    ),
  },
  {
    name: "POST close",
    permission: "purchasing.manage",
    run: on(
      orderClose.POST,
      "POST",
      (c) => `${base}/${c}/close`,
      () => placed,
      {
        reason: null,
      },
    ),
  },
  {
    name: "POST cancel",
    permission: "purchasing.manage",
    run: on(
      orderCancel.POST,
      "POST",
      (c) => `${base}/${c}/cancel`,
      () => placed,
      { reason: "Người bán bán cho chỗ khác" },
    ),
  },
  {
    name: "DELETE order",
    permission: "purchasing.manage",
    run: on(
      orderOne.DELETE,
      "DELETE",
      (c) => `${base}/${c}`,
      () => draft,
    ),
  },
];

async function snapshot() {
  const tables = [
    "purchase_order",
    "purchase_order_line",
    "purchase_order_cost",
    "purchase_order_event",
    "document_counter",
    "inventory_ledger",
  ];
  const rows = await Promise.all(
    tables.map((table) =>
      ctx.db.execute(sql.raw(`select * from "${table}" order by 1`)),
    ),
  );
  return JSON.stringify(rows);
}

const FORBIDDEN = {
  success: false,
  data: null,
  error: "Bạn không có quyền thực hiện thao tác này",
};

describe("purchasing API permissions", () => {
  it.each(ROLES)("%s: writes only with purchasing.manage", async (role) => {
    const cookie = cookies.get(role) ?? "";
    for (const call of WRITES) {
      const before = await snapshot();
      const response = await call.run(cookie);
      if (can(role, call.permission)) {
        expect(response.status, `${role} ${call.name}`).not.toBe(403);
        expect(response.status, `${role} ${call.name}`).not.toBe(401);
        expect(response.status, `${role} ${call.name}`).toBeLessThan(500);
      } else {
        expect(response.status, `${role} ${call.name}`).toBe(403);
        expect(await response.json(), `${role} ${call.name}`).toEqual(
          FORBIDDEN,
        );
        expect(await snapshot(), `${role} ${call.name} changed data`).toBe(
          before,
        );
      }
    }
  });

  it.each(ROLES)("%s: reads only with purchasing.view", async (role) => {
    const cookie = cookies.get(role) ?? "";
    const reads = [
      () => orders.GET(appRequest(`${base}?tab=waiting`, { cookie })),
      on(
        orderOne.GET,
        "GET",
        (c) => `${base}/${c}`,
        () => placed,
      ),
      () =>
        formOptions.GET(appRequest("/api/purchasing/form-options", { cookie })),
    ];
    for (const [index, read] of reads.entries()) {
      const response = await read(cookie);
      expect(response.status, `${role} read ${index}`).toBe(
        can(role, "purchasing.view") ? 200 : 403,
      );
    }
  });

  it("answers 401 without a session", async () => {
    expect((await orders.GET(appRequest(base))).status).toBe(401);
  });

  it("answers a rule break with its field", async () => {
    const response = await orders.POST(
      appRequest(base, {
        method: "POST",
        cookie: cookies.get("SALES"),
        body: {
          ...d3Order(fx),
          lines: [
            {
              itemId: fx.item("GG-K17"),
              unit: "PIECE",
              quantity: "0",
              unitPrice: 1,
            },
          ],
        },
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      success: false,
      data: { field: "lines.0.quantity" },
      error: "Số lượng phải lớn hơn 0",
    });
  });

  it("answers a stale edit with 409", async () => {
    const response = await on(
      orderOne.PATCH,
      "PATCH",
      (c) => `${base}/${c}`,
      () => placed,
      { ...d3Order(fx), updatedAt: "2020-01-01T00:00:00.000Z" },
    )(cookies.get("SALES") ?? "");
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(PURCHASE_MESSAGES.stale);
  });

  it("answers 404 for an unknown or malformed code", async () => {
    for (const code of ["PO-2026-999", "abc"]) {
      const response = await on(
        orderOne.GET,
        "GET",
        (c) => `${base}/${c}`,
        () => code,
      )(cookies.get("SALES") ?? "");
      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe(PURCHASE_MESSAGES.notFound);
    }
  });

  it("lists the tab of the URL with its counts", async () => {
    const response = await orders.GET(
      appRequest(`${base}?tab=waiting`, { cookie: cookies.get("ACCOUNTANT") }),
    );
    const { data } = await response.json();
    expect(data.rows.map((row: { code: string }) => row.code)).toEqual([
      placed,
    ]);
    expect(data.counts).toMatchObject({ all: 2, draft: 1, waiting: 1 });
  });
});

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { can, type Permission } from "@/domain/permissions";
import { ROLES, type Role } from "@/domain/role";
import {
  createAdjustment,
  submitAdjustment,
  type AdjustmentBody,
} from "@/lib/inventory/adjustments";
import { postMovements } from "@/lib/inventory/post";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  signInAs,
} from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import * as adjustmentApprove from "./adjustments/[id]/approve/route";
import * as adjustmentReturn from "./adjustments/[id]/return/route";
import * as adjustmentOne from "./adjustments/[id]/route";
import * as adjustmentSubmit from "./adjustments/[id]/submit/route";
import * as adjustments from "./adjustments/route";
import * as card from "./items/[code]/card/route";
import * as sites from "./items/[code]/sites/route";
import * as stock from "./stock/route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let fx: InventoryFixture;
const cookies = new Map<Role, string>();
let draftId = "";
let pendingId = "";

const body = (): AdjustmentBody => ({
  kind: "ADJUSTMENT",
  reason: "Sửa PTH-2026-064: 10 cái thực tế là Chờ sửa",
  lines: [
    {
      lineType: "CONDITION",
      itemId: fx.item("GG-K17"),
      condition: "GOOD",
      toCondition: "NEEDS_REPAIR",
      locationId: fx.place("BAI-01"),
      quantity: "10",
    },
  ],
});

beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
  cookies.clear();
  for (const role of ROLES) {
    const person = await createTestUser(ctx, {
      role,
      username: `u${role.toLowerCase()}`,
    });
    cookies.set(role, await signInAs(ctx, person));
  }
  await ctx.db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "TEST",
        documentId: null,
        documentCode: "TEST",
        businessDate: "2026-10-01" as BusinessDate,
        lines: [
          {
            itemId: fx.item("GG-K17"),
            condition: "GOOD",
            locationId: fx.place("BAI-01"),
            movement: "OPENING",
            quantityMilli: 100_000,
            amount: 100 * 195_000,
            description: "x",
          },
        ],
      },
      "2026-10-27" as BusinessDate,
    ),
  );
  const draft = await createAdjustment(ctx.db, fx.accountant, body());
  const pending = await createAdjustment(ctx.db, fx.accountant, body());
  draftId = draft.ok ? draft.data.id : "";
  pendingId = pending.ok ? pending.data.id : "";
  await submitAdjustment(ctx.db, fx.accountant, pendingId);
});

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const on =
  (
    handler: Handler,
    method: string,
    path: (id: string) => string,
    id: () => string,
    payload?: unknown,
  ) =>
  (cookie: string) =>
    handler(
      appRequest(path(id()), { method, cookie, body: payload }),
      params(id()),
    );

interface Call {
  name: string;
  permission: Permission;
  run: (cookie: string) => Promise<Response>;
}

const base = "/api/inventory/adjustments";
const WRITES: Call[] = [
  {
    name: "POST adjustments",
    permission: "inventory.adjust",
    run: (cookie) =>
      adjustments.POST(
        appRequest(base, { method: "POST", cookie, body: body() }),
      ),
  },
  {
    name: "PATCH adjustment",
    permission: "inventory.adjust",
    run: on(
      adjustmentOne.PATCH,
      "PATCH",
      (id) => `${base}/${id}`,
      () => draftId,
      {
        reason: "Lý do mới",
        lines: [],
      },
    ),
  },
  {
    name: "POST submit",
    permission: "inventory.adjust",
    run: on(
      adjustmentSubmit.POST,
      "POST",
      (id) => `${base}/${id}/submit`,
      () => draftId,
    ),
  },
  {
    name: "POST return",
    permission: "inventory.approve",
    run: on(
      adjustmentReturn.POST,
      "POST",
      (id) => `${base}/${id}/return`,
      () => pendingId,
      {
        reason: "Ghi rõ số phiếu",
      },
    ),
  },
  {
    name: "POST approve",
    permission: "inventory.approve",
    run: on(
      adjustmentApprove.POST,
      "POST",
      (id) => `${base}/${id}/approve`,
      () => pendingId,
    ),
  },
  {
    name: "DELETE adjustment",
    permission: "inventory.adjust",
    run: on(
      adjustmentOne.DELETE,
      "DELETE",
      (id) => `${base}/${id}`,
      () => draftId,
    ),
  },
];

async function snapshot() {
  const tables = [
    "inventory_ledger",
    "inventory_cost",
    "stock_adjustment",
    "stock_adjustment_line",
    "document_counter",
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

describe("inventory API permissions", () => {
  it.each(ROLES)(
    "%s: writes only where the permission table allows",
    async (role) => {
      const cookie = cookies.get(role) ?? "";
      for (const call of WRITES) {
        const before = await snapshot();
        const response = await call.run(cookie);
        if (can(role, call.permission)) {
          expect(response.status, `${role} ${call.name}`).not.toBe(403);
          expect(response.status, `${role} ${call.name}`).not.toBe(401);
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
    },
  );

  it.each(ROLES)("%s: reads stock only with inventory.view", async (role) => {
    const cookie = cookies.get(role) ?? "";
    const reads = [
      () => stock.GET(appRequest("/api/inventory/stock", { cookie })),
      () =>
        (sites.GET as unknown as Handler)(
          appRequest("/api/inventory/items/GG-K17/sites", { cookie }),
          { params: Promise.resolve({ code: "GG-K17" }) } as never,
        ),
      () =>
        (card.GET as unknown as Handler)(
          appRequest("/api/inventory/items/GG-K17/card", { cookie }),
          { params: Promise.resolve({ code: "GG-K17" }) } as never,
        ),
      () => adjustments.GET(appRequest(base, { cookie })),
      () =>
        on(
          adjustmentOne.GET,
          "GET",
          (id) => `${base}/${id}`,
          () => draftId,
        )(cookie),
    ];
    for (const [index, read] of reads.entries()) {
      const response = await read();
      expect(response.status, `${role} read ${index}`).toBe(
        can(role, "inventory.view") ? 200 : 403,
      );
    }
  });

  it("lets the accountant draft but not approve", async () => {
    const cookie = cookies.get("ACCOUNTANT") ?? "";
    const created = await WRITES[0]!.run(cookie);
    expect(created.status).toBe(201);
    const { data } = await created.json();
    await on(
      adjustmentSubmit.POST,
      "POST",
      (id) => `${base}/${id}/submit`,
      () => data.id,
    )(cookie);
    const approve = await on(
      adjustmentApprove.POST,
      "POST",
      (id) => `${base}/${id}/approve`,
      () => data.id,
    )(cookie);
    expect(approve.status).toBe(403);
  });

  it("serves the stock card with the filters of the URL", async () => {
    const response = await (card.GET as unknown as Handler)(
      appRequest(
        "/api/inventory/items/gg-k17/card?condition=GOOD&place=yard&from=2026-10-01&to=2026-10-31",
        { cookie: cookies.get("SALES") },
      ),
      { params: Promise.resolve({ code: "gg-k17" }) } as never,
    );
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({
      opening: 0,
      inflow: 100_000,
      closing: 100_000,
    });
    const missing = await (card.GET as unknown as Handler)(
      appRequest("/api/inventory/items/KHONG-CO/card", {
        cookie: cookies.get("SALES"),
      }),
      { params: Promise.resolve({ code: "KHONG-CO" }) } as never,
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe("Không tìm thấy mã hàng");
  });

  it("answers 401 when signed out", async () => {
    expect((await stock.GET(appRequest("/api/inventory/stock"))).status).toBe(
      401,
    );
    expect((await WRITES[0]!.run("")).status).toBe(401);
  });
});

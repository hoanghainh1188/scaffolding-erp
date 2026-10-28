// /api/repairs (simple-repair task 5.1): who may read, draft and post, and
// that a refused call changes nothing.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { can, type Permission } from "@/domain/permissions";
import { ROLES, type Role } from "@/domain/role";
import { postMovements } from "@/lib/inventory/post";
import { createRepairDraft, type RepairBody } from "@/lib/repairs/orders";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  signInAs,
} from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import * as awaiting from "./awaiting/route";
import * as post from "./[code]/post/route";
import * as one from "./[code]/route";
import * as list from "./route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let fx: InventoryFixture;
const cookies = new Map<Role, string>();
let draftCode = "";

const body = (): RepairBody => ({
  repairDate: new Date().toISOString().slice(0, 10),
  fromLocationId: fx.place("BAI-01"),
  toLocationId: fx.place("BAI-01"),
  lines: [
    {
      itemId: fx.item("GG-CH"),
      quantityTaken: "20",
      quantityGood: "20",
      quantityScrap: "0",
      repairCost: 240_000,
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
            itemId: fx.item("GG-CH"),
            condition: "NEEDS_REPAIR",
            locationId: fx.place("BAI-01"),
            movement: "OPENING",
            quantityMilli: 63_000,
            amount: 63 * 30_000,
            description: "x",
          },
        ],
      },
      "2026-10-01" as BusinessDate,
    ),
  );
  const draft = await createRepairDraft(ctx.db, fx.accountant, body());
  draftCode = draft.ok ? draft.data.code : "";
});

type Handler = (
  request: Request,
  context: { params: Promise<{ code: string }> },
) => Promise<Response>;
const call =
  (handler: Handler, method: string, suffix = "", payload?: unknown) =>
  (cookie: string) =>
    handler(
      appRequest(`/api/repairs/${draftCode}${suffix}`, {
        method,
        cookie,
        body: payload,
      }),
      { params: Promise.resolve({ code: draftCode }) },
    );

interface Call {
  name: string;
  permission: Permission;
  run: (cookie: string) => Promise<Response>;
}

const READS: Call[] = [
  {
    name: "GET repairs",
    permission: "repairs.view",
    run: (cookie) => list.GET(appRequest("/api/repairs", { cookie })),
  },
  {
    name: "GET repair",
    permission: "repairs.view",
    run: call(one.GET, "GET"),
  },
  {
    name: "GET awaiting",
    permission: "repairs.view",
    run: (cookie) =>
      awaiting.GET(
        appRequest(`/api/repairs/awaiting?locationId=${fx.place("BAI-01")}`, {
          cookie,
        }),
      ),
  },
];

const WRITES: Call[] = [
  {
    name: "POST repairs",
    permission: "repairs.manage",
    run: (cookie) =>
      list.POST(
        appRequest("/api/repairs", { method: "POST", cookie, body: body() }),
      ),
  },
  {
    name: "POST post",
    permission: "repairs.manage",
    run: call(post.POST, "POST", "/post", {}),
  },
  {
    name: "DELETE repair",
    permission: "repairs.manage",
    run: call(one.DELETE, "DELETE"),
  },
];

describe("/api/repairs access", () => {
  it.each([...READS, ...WRITES].map((c) => [c.name, c]))(
    "%s needs a signed-in user",
    async (_name, c) => {
      expect((await c.run("")).status).toBe(401);
    },
  );

  for (const role of ROLES) {
    it.each(READS.map((c) => [c.name, c]))(
      `%s for ${role}`,
      async (_name, c) => {
        const response = await c.run(cookies.get(role) ?? "");
        expect(response.status).toBe(can(role, c.permission) ? 200 : 403);
      },
    );
    it.each(WRITES.map((c) => [c.name, c]))(
      `%s for ${role}`,
      async (_name, c) => {
        const response = await c.run(cookies.get(role) ?? "");
        if (can(role, c.permission)) {
          expect(response.status).toBeLessThan(300);
        } else {
          expect(response.status).toBe(403);
        }
      },
    );
  }

  it("lets sales read a slip but not post it, and keeps the workshop out", async () => {
    const sales = cookies.get("SALES") ?? "";
    expect((await call(one.GET, "GET")(sales)).status).toBe(200);
    expect((await call(post.POST, "POST", "/post", {})(sales)).status).toBe(
      403,
    );
    expect(
      (
        await list.GET(
          appRequest("/api/repairs", { cookie: cookies.get("WORKSHOP") }),
        )
      ).status,
    ).toBe(403);
  });
});

describe("/api/repairs bodies", () => {
  const accountant = () => cookies.get("ACCOUNTANT") ?? "";

  it("refuses a body of the wrong shape", async () => {
    const response = await list.POST(
      appRequest("/api/repairs", {
        method: "POST",
        cookie: accountant(),
        body: { lines: "GG-CH" },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("answers field errors with the field", async () => {
    const response = await list.POST(
      appRequest("/api/repairs", {
        method: "POST",
        cookie: accountant(),
        body: {
          ...body(),
          lines: [{ ...body().lines?.[0], quantityGood: "10" }],
        },
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "GG-CH: sửa xong + phế liệu (10) phải bằng số lấy ra (20)",
      data: { field: "lines.0.quantityGood" },
    });
  });

  it("posts, then shows the slip as posted and answers 404 for a strange code", async () => {
    const posted = await call(post.POST, "POST", "/post", {})(accountant());
    expect(posted.status).toBe(200);
    const read = await call(one.GET, "GET")(accountant());
    expect((await read.json()).data).toMatchObject({ status: "POSTED" });
    const odd = await one.GET(
      appRequest("/api/repairs/PN-2026-001", { cookie: accountant() }),
      { params: Promise.resolve({ code: "PN-2026-001" }) },
    );
    expect(odd.status).toBe(404);
  });
});

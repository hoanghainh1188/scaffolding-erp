// /api/repairs work-order steps and /api/m/repairs (repair-work-orders tasks
// 6.1, 6.2): who may take each step, 409 on a stale step, and that the
// phone never gets a price.
import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { can, type Permission } from "@/domain/permissions";
import { ROLES, type Role } from "@/domain/role";
import { setRepairLaborRate } from "@/lib/catalog/items";
import { postMovements } from "@/lib/inventory/post";
import { createWorkOrder } from "@/lib/repairs/work-orders";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  signInAs,
} from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import * as phoneOne from "../m/repairs/[code]/route";
import * as phoneCount from "../m/repairs/[code]/count/route";
import * as phoneReceive from "../m/repairs/[code]/receive/route";
import * as phoneReport from "../m/repairs/[code]/report/route";
import * as phoneMaterials from "../m/repairs/materials/route";
import * as phoneList from "../m/repairs/route";
import * as itemOne from "../catalog/items/[id]/route";
import * as laborRate from "../catalog/items/[id]/repair-labor-rate/route";
import * as assign from "./[code]/assign/route";
import * as cancel from "./[code]/cancel/route";
import * as post from "./[code]/post/route";
import * as recall from "./[code]/recall/route";
import * as returned from "./[code]/return/route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let fx: InventoryFixture;
const cookies = new Map<Role, string>();
let code = "";

beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
  cookies.clear();
  for (const role of ROLES) {
    const person = await createTestUser(ctx, {
      role,
      username: `w${role.toLowerCase()}`,
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
  const rate = await setRepairLaborRate(
    ctx.db,
    fx.director,
    fx.item("GG-CH"),
    10_000,
  );
  if (!rate.ok) throw new Error(rate.error);
  const made = await createWorkOrder(ctx.db, fx.accountant, {
    workshopId: fx.place("XUONG-01"),
    fromLocationId: fx.place("BAI-01"),
    repairedBy: "Tổ anh Lực",
    lines: [{ itemId: fx.item("GG-CH"), quantityTaken: "20" }],
  });
  if (!made.ok) throw new Error(made.error);
  code = made.data.code;
});

type Handler = (
  request: Request,
  context: { params: Promise<{ code: string }> },
) => Promise<Response>;

const send =
  (handler: Handler, path: string, payload: unknown) =>
  async (cookie: string) =>
    handler(
      appRequest(path.replace(":code", code), {
        method: "POST",
        cookie,
        body:
          typeof payload === "function"
            ? await (payload as () => Promise<unknown>)()
            : payload,
      }),
      { params: Promise.resolve({ code }) },
    );

const get = (handler: Handler, path: string) => (cookie: string) =>
  handler(appRequest(path.replace(":code", code), { cookie }), {
    params: Promise.resolve({ code }),
  });

async function seen() {
  const response = await phoneOne.GET(
    appRequest(`/api/m/repairs/${code}`, {
      cookie: cookies.get("DIRECTOR"),
    }),
    { params: Promise.resolve({ code }) },
  );
  const json = (await response.json()) as { data: { updatedAt: string } };
  return json.data.updatedAt;
}

const as = (role: Role) => cookies.get(role) ?? "";

interface Step {
  name: string;
  permission: Permission;
  run: (cookie: string) => Promise<Response>;
}

const STEPS: Step[] = [
  {
    name: "assign",
    permission: "repairs.manage",
    run: send(assign.POST, "/api/repairs/:code/assign", async () => ({
      updatedAt: await seen(),
    })),
  },
  {
    name: "recall",
    permission: "repairs.manage",
    run: send(recall.POST, "/api/repairs/:code/recall", async () => ({
      updatedAt: await seen(),
    })),
  },
  {
    name: "return",
    permission: "repairs.manage",
    run: send(returned.POST, "/api/repairs/:code/return", async () => ({
      updatedAt: await seen(),
      reason: "Kiểm lại",
    })),
  },
  {
    name: "cancel",
    permission: "repairs.manage",
    run: send(cancel.POST, "/api/repairs/:code/cancel", async () => ({
      updatedAt: await seen(),
      reason: "Lập nhầm",
    })),
  },
  {
    name: "post",
    permission: "repairs.manage",
    run: send(post.POST, "/api/repairs/:code/post", async () => ({
      updatedAt: await seen(),
    })),
  },
  {
    name: "phone receive",
    permission: "repairs.work",
    run: send(phoneReceive.POST, "/api/m/repairs/:code/receive", async () => ({
      draftId: randomUUID(),
      updatedAt: await seen(),
    })),
  },
  {
    name: "phone report",
    permission: "repairs.work",
    run: send(phoneReport.POST, "/api/m/repairs/:code/report", async () => ({
      draftId: randomUUID(),
      updatedAt: await seen(),
      lines: [],
    })),
  },
  {
    name: "phone count",
    permission: "repairs.count",
    run: send(phoneCount.POST, "/api/m/repairs/:code/count", async () => ({
      draftId: randomUUID(),
      updatedAt: await seen(),
      lines: [],
    })),
  },
];

describe("who may take each step (spec: quyền lệnh sửa)", () => {
  for (const role of ROLES) {
    it.each(STEPS.map((step) => [step.name, step]))(
      `%s for ${role}`,
      async (_name, step) => {
        const response = await step.run(as(role));
        if (can(role, step.permission)) {
          expect(response.status).not.toBe(403);
        } else {
          expect(response.status).toBe(403);
        }
      },
    );
  }

  it("refuses the workshop and the storekeeper on posting", async () => {
    for (const role of ["WORKSHOP", "WAREHOUSE"] as const) {
      const response = await send(
        post.POST,
        "/api/repairs/:code/post",
        {},
      )(as(role));
      expect(response.status).toBe(403);
    }
  });
});

describe("a work order through the API", () => {
  it("assigns, answers 409 to a stale step and walks the phone steps", async () => {
    const assigned = await send(
      assign.POST,
      "/api/repairs/:code/assign",
      async () => ({
        updatedAt: await seen(),
      }),
    )(as("ACCOUNTANT"));
    expect(assigned.status).toBe(200);
    const stale = await send(recall.POST, "/api/repairs/:code/recall", {
      updatedAt: new Date(0).toISOString(),
    })(as("ACCOUNTANT"));
    expect(stale.status).toBe(409);
    const received = await send(
      phoneReceive.POST,
      "/api/m/repairs/:code/receive",
      async () => ({ draftId: randomUUID(), updatedAt: await seen() }),
    )(as("WORKSHOP"));
    expect(received.status).toBe(200);
    const early = await send(
      post.POST,
      "/api/repairs/:code/post",
      async () => ({
        updatedAt: await seen(),
      }),
    )(as("ACCOUNTANT"));
    expect(early.status).toBe(409);
  });
});

/** Every key of a JSON value, nested. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => [
      key,
      ...keysOf(inner),
    ]);
  }
  return [];
}

const MONEY_KEY = /price|cost|amount|rate|labor|value/i;

describe("the phone never gets a price (spec repair-mobile)", () => {
  it("lists, reads and offers supplies without a money key, even to the director", async () => {
    await send(assign.POST, "/api/repairs/:code/assign", async () => ({
      updatedAt: await seen(),
    }))(as("ACCOUNTANT"));
    for (const role of ["DIRECTOR", "WORKSHOP"] as const) {
      const listed = await phoneList.GET(
        appRequest("/api/m/repairs", { cookie: as(role) }),
      );
      expect(listed.status).toBe(200);
      const one = await get(phoneOne.GET, "/api/m/repairs/:code")(as(role));
      expect(one.status).toBe(200);
      const supplies = await phoneMaterials.GET(
        appRequest("/api/m/repairs/materials", { cookie: as(role) }),
      );
      expect(supplies.status).toBe(200);
      for (const response of [listed, one, supplies]) {
        const keys = keysOf(await response.json());
        expect(keys.filter((key) => MONEY_KEY.test(key))).toEqual([]);
      }
    }
  });

  it("refuses the office and sales on the phone API", async () => {
    for (const role of ["ACCOUNTANT", "SALES"] as const) {
      expect(
        (
          await phoneList.GET(
            appRequest("/api/m/repairs", { cookie: as(role) }),
          )
        ).status,
      ).toBe(403);
      expect(
        (await get(phoneOne.GET, "/api/m/repairs/:code")(as(role))).status,
      ).toBe(403);
    }
  });

  it("lists the storekeeper's orders only when they wait for a count", async () => {
    const listed = await phoneList.GET(
      appRequest("/api/m/repairs", { cookie: as("WAREHOUSE") }),
    );
    expect((await listed.json()).data).toEqual([]);
  });
});

describe("repair labour rate routes (spec item-catalog)", () => {
  const id = () => fx.item("GG-CH");
  const params = () => ({ params: Promise.resolve({ id: id() }) });

  it("lets the accountant set it on its own route, not sales", async () => {
    const put = (cookie: string) =>
      laborRate.PUT(
        appRequest(`/api/catalog/items/${id()}/repair-labor-rate`, {
          method: "PUT",
          cookie,
          body: { repairLaborRate: 12_000 },
        }),
        params(),
      );
    expect((await put(as("ACCOUNTANT"))).status).toBe(200);
    expect((await put(as("SALES"))).status).toBe(403);
  });

  it("refuses sales sending the rate with an item edit", async () => {
    const response = await itemOne.PATCH(
      appRequest(`/api/catalog/items/${id()}`, {
        method: "PATCH",
        cookie: as("SALES"),
        body: { repairLaborRate: 50_000 },
      }),
      params(),
    );
    expect(response.status).toBe(403);
  });
});

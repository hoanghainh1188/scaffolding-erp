// /api/stocktakes (stocktake task 5.2): who may start, count, read D13 and
// approve; that a refused call changes nothing; and the blind count view.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { inventoryLedger, stocktake } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { can, type Permission } from "@/domain/permissions";
import { ROLES, type Role } from "@/domain/role";
import { postMovements } from "@/lib/inventory/post";
import { startStocktake, submitStocktake } from "@/lib/stocktakes/sessions";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  signInAs,
} from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import * as approve from "./[code]/approve/route";
import * as cancel from "./[code]/cancel/route";
import * as count from "./[code]/count/route";
import * as recount from "./[code]/recount/route";
import * as returned from "./[code]/return/route";
import * as one from "./[code]/route";
import * as submit from "./[code]/submit/route";
import * as list from "./route";
import * as options from "./start-options/route";

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
  const people = new Map<Role, { id: string }>();
  for (const role of ROLES) {
    const person = await createTestUser(ctx, {
      role,
      username: `u${role.toLowerCase()}`,
    });
    people.set(role, person);
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
          ["GG-K17", "BAI-01", 1_230],
          ["GG-CH", "XUONG-01", 40],
        ].map(([item, place, pieces]) => ({
          itemId: fx.item(String(item)),
          condition: "GOOD" as const,
          locationId: fx.place(String(place)),
          movement: "OPENING" as const,
          quantityMilli: Number(pieces) * 1000,
          amount: Number(pieces) * 195_282,
          description: "x",
        })),
      },
      "2026-10-01" as BusinessDate,
    ),
  );
  const keeper = people.get("WAREHOUSE") ?? { id: "" };
  const started = await startStocktake(ctx.db, keeper, {
    clientStartId: crypto.randomUUID(),
    locationId: fx.place("BAI-01"),
    groupIds: null,
  });
  code = started.ok ? started.data.code : "";
  const now = new Date().toISOString();
  await submitStocktake(ctx.db, keeper, code, {
    submissionId: crypto.randomUUID(),
    deviceNow: now,
    items: [
      {
        itemId: fx.item("GG-K17"),
        startedAt: now,
        countedAt: now,
        lines: [{ condition: "GOOD", quantity: "1226" }],
      },
    ],
  });
});

type Handler = (
  request: Request,
  context: { params: Promise<{ code: string }> },
) => Promise<Response>;
const call =
  (handler: Handler, method: string, suffix = "", payload?: unknown) =>
  (cookie: string) =>
    handler(
      appRequest(`/api/stocktakes/${code}${suffix}`, {
        method,
        cookie,
        body: payload,
      }),
      { params: Promise.resolve({ code }) },
    );

interface Call {
  name: string;
  permission: Permission;
  run: (cookie: string) => Promise<Response>;
}

const READS: Call[] = [
  {
    name: "GET stocktakes",
    permission: "inventory.view",
    run: (cookie) => list.GET(appRequest("/api/stocktakes", { cookie })),
  },
  {
    name: "GET stocktake",
    permission: "inventory.view",
    run: call(one.GET, "GET"),
  },
  {
    name: "GET count",
    permission: "stocktake.count",
    run: call(count.GET, "GET", "/count"),
  },
  {
    name: "GET start-options",
    permission: "stocktake.count",
    run: (cookie) =>
      options.GET(appRequest("/api/stocktakes/start-options", { cookie })),
  },
];

const WRITES: Call[] = [
  {
    name: "POST stocktakes",
    permission: "stocktake.count",
    run: (cookie) =>
      list.POST(
        appRequest("/api/stocktakes", {
          method: "POST",
          cookie,
          body: {
            clientStartId: crypto.randomUUID(),
            locationId: fx.place("XUONG-01"),
            groupIds: null,
          },
        }),
      ),
  },
  {
    name: "POST approve",
    permission: "inventory.approve",
    run: call(approve.POST, "POST", "/approve", {}),
  },
  {
    name: "POST return",
    permission: "inventory.approve",
    run: call(returned.POST, "POST", "/return", { reason: "Đếm lại" }),
  },
];

async function ledgerLines() {
  return ctx.db
    .select({ id: inventoryLedger.id })
    .from(inventoryLedger)
    .where(eq(inventoryLedger.documentCode, code));
}

describe("/api/stocktakes access", () => {
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

  it("lets the accountant read D13 but not approve", async () => {
    const accountant = cookies.get("ACCOUNTANT") ?? "";
    expect((await call(one.GET, "GET")(accountant)).status).toBe(200);
    expect(
      (await call(approve.POST, "POST", "/approve", {})(accountant)).status,
    ).toBe(403);
    expect(await ledgerLines()).toHaveLength(0);
  });

  it("keeps sales from starting a session", async () => {
    const before = await ctx.db.select().from(stocktake);
    const response = await WRITES[0]?.run(cookies.get("SALES") ?? "");
    expect(response?.status).toBe(403);
    expect(await ctx.db.select().from(stocktake)).toHaveLength(before.length);
  });

  it("lets the storekeeper count but not read D13 nor approve", async () => {
    const keeper = cookies.get("WAREHOUSE") ?? "";
    expect((await call(one.GET, "GET")(keeper)).status).toBe(403);
    expect((await WRITES[0]?.run(keeper))?.status).toBe(201);
    expect(
      (await call(approve.POST, "POST", "/approve", {})(keeper)).status,
    ).toBe(403);
    expect(
      (await call(recount.POST, "POST", "/recount", { lineIds: [] })(keeper))
        .status,
    ).toBe(403);
    expect(await ledgerLines()).toHaveLength(0);
  });

  it("lets counters and the director cancel, nobody else", async () => {
    for (const role of ["ACCOUNTANT", "SALES", "WORKSHOP"] as const) {
      expect(
        (
          await call(cancel.POST, "POST", "/cancel", { reason: "x" })(
            cookies.get(role) ?? "",
          )
        ).status,
      ).toBe(403);
    }
    expect(
      (
        await call(cancel.POST, "POST", "/cancel", { reason: "x" })(
          cookies.get("WAREHOUSE") ?? "",
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(cancel.POST, "POST", "/cancel", { reason: "Đếm nhầm" })(
          cookies.get("DIRECTOR") ?? "",
        )
      ).status,
    ).toBe(200);
  });
});

describe("/api/stocktakes bodies", () => {
  it("gives the phone no book, cost or difference", async () => {
    const response = await call(
      count.GET,
      "GET",
      "/count",
    )(cookies.get("WAREHOUSE") ?? "");
    const text = await response.text();
    expect(text).toContain("1226.000");
    expect(text).not.toMatch(/book|cost|difference|flags|1230/i);
  });

  it("answers a bad quantity with its field", async () => {
    const director = cookies.get("DIRECTOR") ?? "";
    await call(returned.POST, "POST", "/return", { reason: "Đếm lại" })(
      director,
    );
    const now = new Date().toISOString();
    const response = await call(submit.POST, "POST", "/submit", {
      submissionId: crypto.randomUUID(),
      deviceNow: now,
      items: [
        {
          itemId: fx.item("GG-K17"),
          startedAt: now,
          countedAt: now,
          lines: [{ condition: "GOOD", quantity: "abc" }],
        },
      ],
    })(cookies.get("WAREHOUSE") ?? "");
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Số lượng không hợp lệ",
      data: { field: "items.0.lines.0.quantity" },
    });
  });

  it("refuses a negative unit cost before the service", async () => {
    const response = await call(approve.POST, "POST", "/approve", {
      unitCosts: { [crypto.randomUUID()]: -1 },
    })(cookies.get("DIRECTOR") ?? "");
    expect(response.status).toBe(400);
    expect(await ledgerLines()).toHaveLength(0);
  });

  it("answers 404 for a code that cannot exist", async () => {
    const response = await one.GET(
      appRequest("/api/stocktakes/PSC-2026-001", {
        cookie: cookies.get("DIRECTOR"),
      }),
      { params: Promise.resolve({ code: "PSC-2026-001" }) },
    );
    expect(response.status).toBe(404);
  });
});

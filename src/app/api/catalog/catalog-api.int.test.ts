import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ROLES, type Role } from "@/domain/role";
import { can, type Permission } from "@/domain/permissions";
import { createGroup } from "@/lib/catalog/item-groups";
import { createItem } from "@/lib/catalog/items";
import { createCustomer, createSupplier } from "@/lib/catalog/partners";
import { listLocations } from "@/lib/catalog/places";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  resetAuthTables,
  signInAs,
} from "@/test/auth";
import { resetCatalogTables } from "@/test/catalog";

import * as customerOne from "./customers/[id]/route";
import * as customers from "./customers/route";
import * as groupOne from "./item-groups/[id]/route";
import * as groups from "./item-groups/route";
import * as itemOne from "./items/[id]/route";
import * as items from "./items/route";
import * as kitOne from "./kits/[id]/route";
import * as kits from "./kits/route";
import * as locationOne from "./locations/[id]/route";
import * as locations from "./locations/route";
import * as siteOne from "./sites/[id]/route";
import * as sites from "./sites/route";
import * as supplierEdit from "./suppliers/[id]/edit/route";
import * as supplierOne from "./suppliers/[id]/route";
import * as suppliers from "./suppliers/route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);

afterAll(async () => {
  uninstall();
  await ctx.close();
});

interface Fixture {
  groupId: string;
  itemId: string;
  customerId: string;
  supplierId: string;
  yardId: string;
}

let fixture: Fixture;
const cookies = new Map<Role, string>();

beforeEach(async () => {
  await resetAuthTables();
  await resetCatalogTables();
  cookies.clear();
  for (const role of ROLES) {
    const person = await createTestUser(ctx, {
      role,
      username: `u${role.toLowerCase()}`,
    });
    cookies.set(role, await signInAs(ctx, person));
  }
  const owner = await createTestUser(ctx, {
    role: "DIRECTOR",
    username: "owner",
  });
  const group = await createGroup(ctx.db, owner, { name: "Giàn giáo" });
  const groupId = group.ok ? group.data.id : "";
  const frame = await createItem(ctx.db, owner, {
    code: "GG-K17",
    name: "Khung 1,7m",
    groupId,
    unit: "PIECE",
    standardWeightKg: "13.5",
  });
  const buyer = await createCustomer(ctx.db, owner, {
    kind: "COMPANY",
    name: "Minh Phát",
  });
  const seller = await createSupplier(ctx.db, owner, {
    kind: "PERSON",
    name: "Chú Ba ve chai",
    idNumber: "001203012345",
    bankAccount: "0451000312345678",
  });
  const [yard] = await listLocations(ctx.db, { type: "WORKSHOP" });
  fixture = {
    groupId,
    itemId: frame.ok ? frame.data.id : "",
    customerId: buyer.ok ? buyer.data.id : "",
    supplierId: seller.ok ? seller.data.id : "",
    yardId: yard?.id ?? "",
  };
});

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

interface WriteCall {
  name: string;
  permission: Permission;
  run: (cookie: string) => Promise<Response>;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const post =
  (handler: (r: Request) => Promise<Response>, path: string, body: unknown) =>
  (cookie: string) =>
    handler(appRequest(path, { method: "POST", cookie, body }));
const patch =
  (handler: Handler, path: string, id: () => string, body: unknown) =>
  (cookie: string) =>
    handler(
      appRequest(`${path}/${id()}`, { method: "PATCH", cookie, body }),
      params(id()),
    );
const remove =
  (handler: Handler, path: string, id: () => string) => (cookie: string) =>
    handler(
      appRequest(`${path}/${id()}`, { method: "DELETE", cookie }),
      params(id()),
    );

// Every write route; deletes target rows that are in use, so an allowed role
// gets 409 and still changes nothing.
const WRITES: WriteCall[] = [
  {
    name: "POST items",
    permission: "items.manage",
    run: post(items.POST, "/api/catalog/items", {
      code: "PK-CX",
      name: "Cùm xoay",
      groupId: "",
      unit: "PIECE",
      standardWeightKg: "1.1",
    }),
  },
  {
    name: "PATCH items",
    permission: "items.manage",
    run: patch(itemOne.PATCH, "/api/catalog/items", () => fixture.itemId, {
      dailyRentalPrice: 1300,
    }),
  },
  {
    name: "DELETE items",
    permission: "items.manage",
    run: remove(itemOne.DELETE, "/api/catalog/items", () => fixture.itemId),
  },
  {
    name: "POST item-groups",
    permission: "items.manage",
    run: post(groups.POST, "/api/catalog/item-groups", { name: "Ống thép" }),
  },
  {
    name: "PATCH item-groups",
    permission: "items.manage",
    run: patch(
      groupOne.PATCH,
      "/api/catalog/item-groups",
      () => fixture.groupId,
      { name: "Giàn giáo khung" },
    ),
  },
  {
    name: "DELETE item-groups",
    permission: "items.manage",
    run: remove(
      groupOne.DELETE,
      "/api/catalog/item-groups",
      () => fixture.groupId,
    ),
  },
  {
    name: "POST kits",
    permission: "items.manage",
    run: (cookie) =>
      kits.POST(
        appRequest("/api/catalog/kits", {
          method: "POST",
          cookie,
          body: {
            code: "BO-K",
            name: "Bộ khung",
            components: [{ itemId: fixture.itemId, quantity: 2 }],
          },
        }),
      ),
  },
  {
    name: "POST customers",
    permission: "partners.manage",
    run: post(customers.POST, "/api/catalog/customers", {
      kind: "COMPANY",
      name: "Sông Hồng",
    }),
  },
  {
    name: "PATCH customers",
    permission: "partners.manage",
    run: patch(
      customerOne.PATCH,
      "/api/catalog/customers",
      () => fixture.customerId,
      { paymentTermsDays: 45 },
    ),
  },
  {
    name: "POST suppliers",
    permission: "partners.manage",
    run: post(suppliers.POST, "/api/catalog/suppliers", {
      kind: "PERSON",
      name: "Cô Tư",
    }),
  },
  {
    name: "PATCH suppliers",
    permission: "partners.manage",
    run: patch(
      supplierOne.PATCH,
      "/api/catalog/suppliers",
      () => fixture.supplierId,
      { phone: "0987654321" },
    ),
  },
  {
    name: "POST sites",
    permission: "partners.manage",
    run: (cookie) =>
      sites.POST(
        appRequest("/api/catalog/sites", {
          method: "POST",
          cookie,
          body: { name: "An Phú", customerId: fixture.customerId },
        }),
      ),
  },
  {
    name: "POST locations",
    permission: "locations.manage",
    run: post(locations.POST, "/api/catalog/locations", {
      code: "BAI-02",
      name: "Bãi 2",
      type: "YARD",
    }),
  },
  {
    name: "PATCH locations",
    permission: "locations.manage",
    run: patch(
      locationOne.PATCH,
      "/api/catalog/locations",
      () => fixture.yardId,
      { status: "ARCHIVED" },
    ),
  },
  {
    name: "DELETE customers",
    permission: "partners.manage",
    run: remove(
      customerOne.DELETE,
      "/api/catalog/customers",
      () => fixture.customerId,
    ),
  },
  {
    name: "DELETE suppliers",
    permission: "partners.manage",
    run: remove(
      supplierOne.DELETE,
      "/api/catalog/suppliers",
      () => fixture.supplierId,
    ),
  },
  {
    name: "PATCH kits",
    permission: "items.manage",
    run: patch(
      kitOne.PATCH,
      "/api/catalog/kits",
      () => "00000000-0000-0000-0000-000000000000",
      { name: "X" },
    ),
  },
  {
    name: "DELETE kits",
    permission: "items.manage",
    run: remove(
      kitOne.DELETE,
      "/api/catalog/kits",
      () => "00000000-0000-0000-0000-000000000000",
    ),
  },
  {
    name: "PATCH sites",
    permission: "partners.manage",
    run: patch(
      siteOne.PATCH,
      "/api/catalog/sites",
      () => "00000000-0000-0000-0000-000000000000",
      { name: "X" },
    ),
  },
  {
    name: "DELETE sites",
    permission: "partners.manage",
    run: remove(
      siteOne.DELETE,
      "/api/catalog/sites",
      () => "00000000-0000-0000-0000-000000000000",
    ),
  },
  {
    name: "DELETE locations",
    permission: "locations.manage",
    run: remove(
      locationOne.DELETE,
      "/api/catalog/locations",
      () => "00000000-0000-0000-0000-000000000000",
    ),
  },
];

/** Every catalog row, to prove a refused call changed nothing. */
async function snapshot() {
  const tables = [
    "item_group",
    "item",
    "kit",
    "kit_component",
    "customer",
    "supplier",
    "site",
    "location",
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

describe("catalog API permissions", () => {
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

  it.each(ROLES)("%s reads every list", async (role) => {
    const cookie = cookies.get(role) ?? "";
    for (const [name, handler] of [
      ["items", items.GET],
      ["kits", kits.GET],
      ["item-groups", groups.GET],
      ["customers", customers.GET],
      ["suppliers", suppliers.GET],
      ["sites", sites.GET],
      ["locations", locations.GET],
    ] as const) {
      const response = await handler(
        appRequest(`/api/catalog/${name}`, { cookie }),
      );
      expect(response.status, `${role} GET ${name}`).toBe(200);
    }
  });

  it("answers 401 when signed out", async () => {
    expect((await items.GET(appRequest("/api/catalog/items"))).status).toBe(
      401,
    );
    expect((await WRITES[0]!.run("")).status).toBe(401);
  });

  it("lets an allowed role delete an unused item", async () => {
    const response = await WRITES.find(
      (call) => call.name === "DELETE items",
    )!.run(cookies.get("SALES") ?? "");
    expect(response.status).toBe(200);
  });
});

describe("supplier CCCD", () => {
  it("never leaves the shared read in full", async () => {
    const response = await suppliers.GET(
      appRequest("/api/catalog/suppliers", {
        cookie: cookies.get("WAREHOUSE"),
      }),
    );
    const text = await response.text();
    expect(text).toContain("•••• •••• 2345");
    expect(text).not.toContain("001203012345");
    expect(text).toContain("•••• 5678");
    expect(text).not.toContain("0451000312345678");
  });

  it("gives the edit form the full number for partners.manage only", async () => {
    for (const role of ROLES) {
      const response = await supplierEdit.GET(
        appRequest(`/api/catalog/suppliers/${fixture.supplierId}/edit`, {
          cookie: cookies.get(role),
        }),
        params(fixture.supplierId),
      );
      if (can(role, "partners.manage")) {
        expect(response.status, role).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        const { data } = await response.json();
        expect(data.idNumber).toBe("001203012345");
        expect(data.bankAccount).toBe("0451000312345678");
      } else {
        expect(response.status, role).toBe(403);
      }
    }
  });
});

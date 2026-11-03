// Delivery routes (deliveries tasks 4.1, 4.2; spec "Quyền với phiếu xuất",
// delivery-picking "M5 không hiện giá"; design D11, D12).
import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  signInAs,
  TEST_PASSWORD,
} from "@/test/auth";
import {
  approvedContract,
  approvedRental,
  planned,
  setupDeliveryFixture,
  type DeliveryFixture,
} from "@/test/deliveries";
import { d5Rental } from "@/test/contracts";

import * as contractDeliveries from "../contracts/[id]/deliveries/route";
import * as mobileOne from "../m/deliveries/[code]/route";
import * as mobilePost from "../m/deliveries/[code]/post/route";
import * as mobileStart from "../m/deliveries/[code]/start/route";
import * as noteOne from "./[id]/route";
import * as deliveries from "./route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let fx: DeliveryFixture;
const cookies = new Map<string, string>();

const signIn = async (username: string) =>
  cookies.set(
    username,
    await signInAs(ctx, { username, password: TEST_PASSWORD }),
  );

beforeEach(async () => {
  fx = await setupDeliveryFixture(ctx);
  cookies.clear();
  await fx.seller("thuyvy", "SALE");
  await createTestUser(ctx, { role: "WORKSHOP", username: "thoxuong" });
  for (const name of [
    "quocbao",
    "minhanh",
    "thuha",
    "vantung",
    "thuyvy",
    "thoxuong",
  ]) {
    await signIn(name);
  }
});

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

function call(
  handler: unknown,
  path: string,
  options: {
    method?: string;
    as?: string;
    body?: unknown;
    params?: Record<string, string>;
  } = {},
) {
  return (handler as Handler)(
    appRequest(path, {
      method: options.method ?? "GET",
      cookie: options.as ? cookies.get(options.as) : undefined,
      body: options.body,
    }),
    { params: Promise.resolve(options.params ?? {}) },
  );
}

const kits = (quantity: number) => [{ kitId: fx.kit("BO-17"), quantity }];

describe("office routes", () => {
  it("refuses a rental batch to a sale-only seller", async () => {
    const deal = await approvedRental(ctx, fx);
    const response = await call(deliveries.POST, "/api/deliveries", {
      method: "POST",
      as: "thuyvy",
      body: { contractId: deal.id, kits: kits(10) },
    });
    expect(response.status).toBe(403);
    const d6 = await call(
      contractDeliveries.GET,
      `/api/contracts/${deal.id}/deliveries`,
      {
        as: "thuyvy",
        params: { id: deal.id },
      },
    );
    expect(d6.status).toBe(403);
  });

  it("refuses the storekeeper planning a batch", async () => {
    const deal = await approvedRental(ctx, fx);
    const response = await call(deliveries.POST, "/api/deliveries", {
      method: "POST",
      as: "vantung",
      body: { contractId: deal.id, kits: kits(10) },
    });
    expect(response.status).toBe(403);
  });

  it("lets the accountant read but not edit", async () => {
    const deal = await approvedRental(ctx, fx);
    const note = await planned(ctx, fx, {
      contractId: deal.id,
      kits: kits(10),
    });
    const read = await call(noteOne.GET, `/api/deliveries/${note.id}`, {
      as: "thuha",
      params: { id: note.id },
    });
    expect(read.status).toBe(200);
    const edit = await call(noteOne.PUT, `/api/deliveries/${note.id}`, {
      method: "PUT",
      as: "thuha",
      body: { kits: kits(12), updatedAt: note.updatedAt },
      params: { id: note.id },
    });
    expect(edit.status).toBe(403);
  });

  it("creates a batch for the seller with 201", async () => {
    const deal = await approvedRental(ctx, fx);
    const response = await call(deliveries.POST, "/api/deliveries", {
      method: "POST",
      as: "quocbao",
      body: { contractId: deal.id, kits: kits(10) },
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      data: { code: "PX-2026-001", batchNo: 1 },
    });
  });
});

describe("phone routes", () => {
  async function note() {
    const deal = await approvedContract(ctx, fx, {
      ...d5Rental(fx),
      companyTruck: true,
      freightPerTrip: 1_800_000,
    });
    return planned(ctx, fx, {
      contractId: deal.id,
      lines: [{ itemId: fx.item("PK-KU"), quantity: "10" }],
    });
  }

  it("answers M5 with no price, freight or money", async () => {
    const saved = await note();
    const response = await call(
      mobileOne.GET,
      `/api/m/deliveries/${saved.code}`,
      {
        as: "vantung",
        params: { code: saved.code },
      },
    );
    expect(response.status).toBe(200);
    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
          keys.push(key);
          walk(inner);
        }
      }
    };
    walk(await response.json());
    expect(
      keys.filter((key) => /price|freight|amount|rent|cost/i.test(key)),
    ).toEqual([]);
  });

  it("refuses a seller confirming the truck, and the workshop starting", async () => {
    const saved = await note();
    const post = await call(
      mobilePost.POST,
      `/api/m/deliveries/${saved.code}/post`,
      {
        method: "POST",
        as: "quocbao",
        body: {
          clientDraftId: randomUUID(),
          startedVersion: saved.updatedAt,
          picks: [],
        },
        params: { code: saved.code },
      },
    );
    expect(post.status).toBe(403);
    const start = await call(
      mobileStart.POST,
      `/api/m/deliveries/${saved.code}/start`,
      {
        method: "POST",
        as: "thoxuong",
        body: {},
        params: { code: saved.code },
      },
    );
    expect(start.status).toBe(403);
  });

  it("posts with 201, answers a resend with 200 and a stale version with 409", async () => {
    const saved = await note();
    const start = await call(
      mobileStart.POST,
      `/api/m/deliveries/${saved.code}/start`,
      {
        method: "POST",
        as: "vantung",
        body: {},
        params: { code: saved.code },
      },
    );
    expect(start.status).toBe(200);
    const view = await (
      await call(mobileOne.GET, `/api/m/deliveries/${saved.code}`, {
        as: "vantung",
        params: { code: saved.code },
      })
    ).json();
    const lineId = view.data.lines[0].id as string;
    const body = {
      clientDraftId: randomUUID(),
      startedVersion: view.data.version as string,
      vehiclePlate: "51X-000.01",
      picks: [{ lineId, condition: "NEW", quantity: "10" }],
    };
    const stale = await call(
      mobilePost.POST,
      `/api/m/deliveries/${saved.code}/post`,
      {
        method: "POST",
        as: "vantung",
        body: {
          ...body,
          clientDraftId: randomUUID(),
          startedVersion: saved.updatedAt,
        },
        params: { code: saved.code },
      },
    );
    expect(stale.status).toBe(409);
    const first = await call(
      mobilePost.POST,
      `/api/m/deliveries/${saved.code}/post`,
      {
        method: "POST",
        as: "vantung",
        body,
        params: { code: saved.code },
      },
    );
    expect(first.status).toBe(201);
    const again = await call(
      mobilePost.POST,
      `/api/m/deliveries/${saved.code}/post`,
      {
        method: "POST",
        as: "vantung",
        body,
        params: { code: saved.code },
      },
    );
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({
      data: { code: saved.code, replayed: true },
    });
  });
});

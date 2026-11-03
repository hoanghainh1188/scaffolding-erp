// Buy-back routes (site-operations task 4.3; spec buy-backs "Quyền với phiếu
// mua lại").
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  appRequest,
  createTestContext,
  installTestContext,
  signInAs,
  TEST_PASSWORD,
} from "@/test/auth";
import { setupSiteFixture, type SiteFixture } from "@/test/site-operations";

import * as approve from "./[id]/approve/route";
import * as buyBacks from "./route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let fx: SiteFixture;
const cookies = new Map<string, string>();

beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
  cookies.clear();
  await fx.seller("thuyvy", "SALE");
  for (const name of ["quocbao", "minhanh", "thuyvy", "vantung"]) {
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

function call(
  handler: unknown,
  path: string,
  options: { as: string; body?: unknown; params?: Record<string, string> },
) {
  return (handler as Handler)(
    appRequest(path, {
      method: "POST",
      cookie: cookies.get(options.as),
      body: options.body,
    }),
    { params: Promise.resolve(options.params ?? {}) },
  );
}

const body = () => ({
  contractId: fx.from.id,
  reason: "Đã đổ bê tông",
  lines: [{ itemId: fx.item("GG-CH"), quantity: "20" }],
});

describe("/api/buy-backs", () => {
  it("lets sales make a note and only the director approve it", async () => {
    const made = await call(buyBacks.POST, "/api/buy-backs", {
      as: "quocbao",
      body: body(),
    });
    expect(made.status).toBe(201);
    const { data } = (await made.json()) as { data: { id: string } };
    const path = `/api/buy-backs/${data.id}/approve`;
    const bySales = await call(approve.POST, path, {
      as: "quocbao",
      body: {},
      params: { id: data.id },
    });
    expect(bySales.status).toBe(403);
    const byDirector = await call(approve.POST, path, {
      as: "minhanh",
      body: {},
      params: { id: data.id },
    });
    expect(byDirector.status).toBe(200);
  });

  it("refuses sales scoped to sale contracts and the storekeeper", async () => {
    for (const who of ["thuyvy", "vantung"]) {
      const response = await call(buyBacks.POST, "/api/buy-backs", {
        as: who,
        body: body(),
      });
      expect(response.status).toBe(403);
    }
  });
});

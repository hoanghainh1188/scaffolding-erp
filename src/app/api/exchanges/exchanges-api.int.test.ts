// Exchange routes (site-operations task 5.3; spec site-exchanges
// "Quyền và nhật ký đổi hàng").
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  appRequest,
  createTestContext,
  installTestContext,
  signInAs,
  TEST_PASSWORD,
} from "@/test/auth";
import { setupSiteFixture, type SiteFixture } from "@/test/site-operations";

import * as exchanges from "./route";

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
  for (const name of ["quocbao", "minhanh", "thuha", "vantung", "thuyvy"]) {
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

describe("POST /api/exchanges", () => {
  const body = () => ({
    contractId: fx.from.id,
    lines: [{ itemId: fx.item("PK-KU"), quantity: "100" }],
    expected: [{ itemId: fx.item("GG-CH"), quantity: "100" }],
    overContractConfirmed: true,
  });

  it("lets sales make an exchange", async () => {
    const response = await call(exchanges.POST, "/api/exchanges", {
      method: "POST",
      as: "quocbao",
      body: body(),
    });
    expect(response.status).toBe(201);
  });

  it("refuses the storekeeper and sales scoped to sale contracts", async () => {
    for (const who of ["vantung", "thuyvy"]) {
      const response = await call(exchanges.POST, "/api/exchanges", {
        method: "POST",
        as: who,
        body: body(),
      });
      expect(response.status).toBe(403);
    }
  });
});

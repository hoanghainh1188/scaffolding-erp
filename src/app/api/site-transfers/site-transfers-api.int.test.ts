// Site transfer routes (site-operations task 3.7; spec site-transfers
// "Quyền với phiếu chuyển", "M9 không hiện giá").
import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  appRequest,
  createTestContext,
  installTestContext,
  signInAs,
  TEST_PASSWORD,
} from "@/test/auth";
import {
  draftTransfer,
  setupSiteFixture,
  transferBody,
  type SiteFixture,
} from "@/test/site-operations";

import * as phonePost from "../m/site-transfers/[code]/post/route";
import * as phoneOne from "../m/site-transfers/[code]/route";
import * as send from "./[id]/send/route";
import * as transfers from "./route";

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

describe("POST /api/site-transfers", () => {
  it("lets sales save a draft", async () => {
    const response = await call(transfers.POST, "/api/site-transfers", {
      method: "POST",
      as: "quocbao",
      body: transferBody(fx, { "GG-K17": 50 }),
    });
    expect(response.status).toBe(201);
  });

  it("refuses sales scoped to sale contracts and the storekeeper", async () => {
    for (const who of ["thuyvy", "vantung", "thuha"]) {
      const response = await call(transfers.POST, "/api/site-transfers", {
        method: "POST",
        as: who,
        body: { ...transferBody(fx, { "GG-K17": 50 }), confirm: true },
      });
      expect(response.status).toBe(403);
    }
  });
});

describe("M9", () => {
  async function sentCode() {
    const draft = await draftTransfer(ctx, fx, { "GG-K17": 50 });
    const response = await call(
      send.POST,
      `/api/site-transfers/${draft.id}/send`,
      {
        method: "POST",
        as: "quocbao",
        body: { updatedAt: draft.updatedAt },
        params: { id: draft.id },
      },
    );
    expect(response.status).toBe(200);
    return draft.code;
  }

  it("reads a transfer without any price", async () => {
    const code = await sentCode();
    const response = await call(phoneOne.GET, `/api/m/site-transfers/${code}`, {
      as: "vantung",
      params: { code },
    });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { data: unknown };
    const keys = keysOf(json.data);
    expect(keys).toContain("planned");
    expect(keys.filter((key) => /price|cost|amount|money/i.test(key))).toEqual(
      [],
    );
  });

  it("lets the storekeeper confirm and refuses sales", async () => {
    const code = await sentCode();
    const body = {
      clientDraftId: randomUUID(),
      lines: [{ itemId: fx.item("GG-K17"), moved: "50" }],
    };
    const refused = await call(
      phonePost.POST,
      `/api/m/site-transfers/${code}/post`,
      {
        method: "POST",
        as: "quocbao",
        body,
        params: { code },
      },
    );
    expect(refused.status).toBe(403);
    const posted = await call(
      phonePost.POST,
      `/api/m/site-transfers/${code}/post`,
      {
        method: "POST",
        as: "vantung",
        body,
        params: { code },
      },
    );
    expect(posted.status).toBe(201);
  });
});

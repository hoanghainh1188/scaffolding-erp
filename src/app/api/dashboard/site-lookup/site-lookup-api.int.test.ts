// GET /api/dashboard/site-lookup (dashboard-basic task 4.1, design D9):
// 401 signed out, 403 for the phone roles, sales get goods without money,
// a sales account working on sales only gets nothing, 400 when too long.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  appRequest,
  createTestContext,
  installTestContext,
  signInAs,
  TEST_PASSWORD,
} from "@/test/auth";
import {
  closedPeriod,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";

import { GET } from "./route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let fx: ReceivableFixture;
const cookies = new Map<string, string>();

beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
  await fx.seller("bansi", "SALE");
  await closedPeriod(ctx, fx, "2026-10", 1_000_000, { terms: 15 });
  cookies.clear();
  for (const name of ["quocbao", "minhanh", "thuha", "vantung", "bansi"]) {
    cookies.set(
      name,
      await signInAs(ctx, { username: name, password: TEST_PASSWORD }),
    );
  }
});

interface Found {
  sites: {
    name: string;
    contracts: { onSite: { piecesMilli: number }; money?: unknown }[];
  }[];
}

async function lookup(q: string, as?: string) {
  return GET(
    appRequest(`/api/dashboard/site-lookup?q=${encodeURIComponent(q)}`, {
      cookie: as ? cookies.get(as) : undefined,
    }),
  );
}

describe("GET /api/dashboard/site-lookup", () => {
  it("answers 401 signed out and 403 to the storekeeper", async () => {
    expect((await lookup("duong noi")).status).toBe(401);
    expect((await lookup("duong noi", "vantung")).status).toBe(403);
  });

  it("gives the director goods and money", async () => {
    const response = await lookup("duong noi", "minhanh");
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: Found };
    expect(data.sites.map((row) => row.name)).toEqual([
      "Trường THCS Dương Nội",
    ]);
    expect(data.sites[0]?.contracts[0]?.money).toBeDefined();
  });

  it("gives sales goods without money", async () => {
    const response = await lookup("duong noi", "quocbao");
    const text = await response.text();
    expect(response.status).toBe(200);
    const { data } = JSON.parse(text) as { data: Found };
    expect(data.sites[0]?.contracts[0]?.onSite.piecesMilli).toBe(440_000);
    expect(text).not.toContain('"money"');
    expect(text).not.toContain("1000000");
  });

  it("gives a sales-only account nothing", async () => {
    const response = await lookup("duong noi", "bansi");
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: Found }).data.sites).toEqual([]);
  });

  it("answers empty under two characters and 400 over 100", async () => {
    const short = await lookup("d", "thuha");
    expect(((await short.json()) as { data: Found }).data.sites).toEqual([]);
    expect((await lookup("x".repeat(101), "thuha")).status).toBe(400);
  });
});

// Billing and holiday routes (rental-billing tasks 5.1–5.3): who may read,
// close, adjust and edit holidays, and the Excel download. Dates here are
// the real today, so the cases hold whatever day CI runs on.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  appRequest,
  createTestContext,
  installTestContext,
  signInAs,
  TEST_PASSWORD,
} from "@/test/auth";
import { setupSiteFixture, type SiteFixture } from "@/test/site-operations";

import * as holidays from "../holidays/route";
import * as adjustments from "./adjustments/route";
import * as statement from "./periods/[month]/contracts/[id]/route";
import * as close from "./periods/[month]/contracts/[id]/close/route";
import * as exported from "./periods/[month]/export/route";
import * as period from "./periods/[month]/route";

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
  for (const name of ["quocbao", "minhanh", "thuha", "thuyvy", "vantung"]) {
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
    as: string;
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
  },
) {
  return (handler as Handler)(
    appRequest(path, {
      method: options.method ?? "GET",
      cookie: cookies.get(options.as),
      body: options.body,
    }),
    { params: Promise.resolve(options.params ?? {}) },
  );
}

describe("/api/billing/periods", () => {
  it("lists November for the accountant and sales, not the storekeeper", async () => {
    const path = "/api/billing/periods/2026-11";
    const params = { month: "2026-11" };
    const byAccountant = await call(period.GET, path, { as: "thuha", params });
    expect(byAccountant.status).toBe(200);
    const { data } = (await byAccountant.json()) as {
      data: { contracts: { code: string }[] };
    };
    expect(data.contracts.map((entry) => entry.code)).toContain(fx.from.code);
    expect(
      (await call(period.GET, path, { as: "quocbao", params })).status,
    ).toBe(200);
    expect(
      (await call(period.GET, path, { as: "vantung", params })).status,
    ).toBe(403);
  });

  it("refuses a sales account working on sales only", async () => {
    const response = await call(period.GET, "/api/billing/periods/2026-11", {
      as: "thuyvy",
      params: { month: "2026-11" },
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toBe(
      "Tài khoản của bạn chỉ làm hợp đồng bán nên không xem được tiền thuê.",
    );
  });

  it("answers 400 to a malformed month and 404 to an unknown contract", async () => {
    expect(
      (
        await call(period.GET, "/api/billing/periods/2026-13", {
          as: "thuha",
          params: { month: "2026-13" },
        })
      ).status,
    ).toBe(400);
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect(
      (
        await call(statement.GET, "/x", {
          as: "thuha",
          params: { month: "2026-11", id: unknown },
        })
      ).status,
    ).toBe(404);
  });

  it("shows the statement of one contract", async () => {
    const response = await call(statement.GET, "/x", {
      as: "quocbao",
      params: { month: "2026-11", id: fx.from.id },
    });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { contract: { code: string } };
    };
    expect(data.contract.code).toBe(fx.from.code);
  });
});

describe("closing and adjustments", () => {
  it("lets only the accountant and the director close", async () => {
    const params = { month: "2026-10", id: fx.from.id };
    const bySales = await call(close.POST, "/x", {
      as: "quocbao",
      method: "POST",
      body: { expectedTotal: 0 },
      params,
    });
    expect(bySales.status).toBe(403);
    const byAccountant = await call(close.POST, "/x", {
      as: "thuha",
      method: "POST",
      body: { expectedTotal: 0 },
      params,
    });
    expect(byAccountant.status).toBe(409);
    expect(((await byAccountant.json()) as { error: string }).error).toBe(
      "Kỳ 10/2026 của hợp đồng này không có tiền thuê, cước hay điều chỉnh nên không cần chốt.",
    );
  });

  it("refuses adjustments to sales and checks the fields", async () => {
    const body = {
      contractId: fx.from.id,
      month: "2026-12",
      refMonth: "2026-11",
      amount: 0,
      reason: "x",
    };
    expect(
      (
        await call(adjustments.POST, "/api/billing/adjustments", {
          as: "quocbao",
          method: "POST",
          body,
        })
      ).status,
    ).toBe(403);
    const response = await call(adjustments.POST, "/api/billing/adjustments", {
      as: "thuha",
      method: "POST",
      body,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "Số tiền điều chỉnh phải khác 0 ₫.",
      data: { field: "amount" },
    });
  });
});

describe("/api/billing/periods/[month]/export", () => {
  it("downloads the month as tien-thue-2026-11.xlsx", async () => {
    const response = await call(exported.GET, "/x", {
      as: "thuha",
      params: { month: "2026-11" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="tien-thue-2026-11.xlsx"',
    );
  });
});

describe("/api/holidays", () => {
  const body = {
    name: "Nghỉ thử",
    startDate: "2099-02-05",
    endDate: "2099-02-06",
  };

  it("is written by the director only and read by the office", async () => {
    expect(
      (
        await call(holidays.POST, "/api/holidays", {
          as: "thuha",
          method: "POST",
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(holidays.POST, "/api/holidays", {
          as: "minhanh",
          method: "POST",
          body,
        })
      ).status,
    ).toBe(201);
    const read = await call(holidays.GET, "/api/holidays?year=2099", {
      as: "thuha",
    });
    expect(read.status).toBe(200);
    const { data } = (await read.json()) as { data: { name: string }[] };
    expect(data.map((row) => row.name)).toEqual(["Nghỉ thử"]);
    expect(
      (await call(holidays.GET, "/api/holidays?year=2099", { as: "vantung" }))
        .status,
    ).toBe(403);
  });
});

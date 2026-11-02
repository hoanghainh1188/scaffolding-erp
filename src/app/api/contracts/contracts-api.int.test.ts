// Contract API: permissions per type and account scope, checked on the
// server (contracts spec "Quyền theo loại hợp đồng", auth delta; tasks 6.1,
// 6.2).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { documentCounter } from "@/db/schema";
import { approveContract, submitContract } from "@/lib/contracts/approval";
import { createContract } from "@/lib/contracts/service";
import {
  appRequest,
  createTestContext,
  installTestContext,
  signInAs,
  TEST_PASSWORD,
} from "@/test/auth";
import {
  d5Rental,
  kgSale,
  setupContractFixture,
  type ContractFixture,
} from "@/test/contracts";

import * as approve from "./[id]/approve/route";
import * as amendments from "./[id]/amendments/route";
import * as one from "./[id]/route";
import * as terms from "./[id]/terms/route";
import * as preview from "./code-preview/route";
import * as list from "./route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let fx: ContractFixture;
let rental = { id: "", code: "", updatedAt: "" };
let sale = { id: "", code: "", updatedAt: "" };

const cookieOf = (username: string) =>
  signInAs(ctx, { username, password: TEST_PASSWORD });

beforeEach(async () => {
  fx = await setupContractFixture(ctx);
  const a = await createContract(ctx.db, fx.director, d5Rental(fx));
  const b = await createContract(ctx.db, fx.director, kgSale(fx));
  if (!a.ok || !b.ok) throw new Error("setup");
  rental = a.data;
  sale = b.data;
});

type Ctx = { params: Promise<{ id: string; n?: string }> };
const call = (
  handler: unknown,
  method: string,
  path: string,
  cookie: string,
  params: { id: string; n?: string },
  body?: unknown,
) =>
  (handler as (request: Request, context: Ctx) => Promise<Response>)(
    appRequest(path, { method, cookie, body }),
    { params: Promise.resolve(params) },
  );

const getOne = (cookie: string, id: string) =>
  call(one.GET, "GET", `/api/contracts/${id}`, cookie, { id });

const putOne = (cookie: string, id: string, body: unknown) =>
  call(one.PUT, "PUT", `/api/contracts/${id}`, cookie, { id }, body);

describe("contract API: rental and sale apart", () => {
  it("lets a rental-only seller read and edit rentals, nothing of sales", async () => {
    await fx.seller("thuyvy", "RENTAL");
    const cookie = await cookieOf("thuyvy");
    expect((await getOne(cookie, rental.id)).status).toBe(200);
    expect((await getOne(cookie, sale.id)).status).toBe(403);
    expect(
      (
        await putOne(cookie, sale.id, {
          ...kgSale(fx),
          updatedAt: sale.updatedAt,
        })
      ).status,
    ).toBe(403);
    const created = await list.POST(
      appRequest("/api/contracts", {
        method: "POST",
        cookie,
        body: kgSale(fx),
      }),
    );
    expect(created.status).toBe(403);
    const page = await list.GET(appRequest("/api/contracts", { cookie }));
    const { data } = (await page.json()) as {
      data: { rows: { code: string }[]; counts: { all: number } };
    };
    expect(data.rows.map((row) => row.code)).toEqual([rental.code]);
    expect(data.counts.all).toBe(1);
  });

  it("lets a sale-only seller do the opposite", async () => {
    await fx.seller("lanphuong", "SALE");
    const cookie = await cookieOf("lanphuong");
    expect((await getOne(cookie, sale.id)).status).toBe(200);
    expect((await getOne(cookie, rental.id)).status).toBe(403);
    expect(
      (
        await putOne(cookie, rental.id, {
          ...d5Rental(fx),
          updatedAt: rental.updatedAt,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          terms.GET,
          "GET",
          `/api/contracts/${rental.id}/terms?date=2026-12-01`,
          cookie,
          { id: rental.id },
        )
      ).status,
    ).toBe(403);
  });

  it("lets the accountant read both and edit none", async () => {
    const cookie = await cookieOf("thuha");
    expect((await getOne(cookie, rental.id)).status).toBe(200);
    expect((await getOne(cookie, sale.id)).status).toBe(200);
    expect(
      (
        await putOne(cookie, rental.id, {
          ...d5Rental(fx),
          updatedAt: rental.updatedAt,
        })
      ).status,
    ).toBe(403);
  });

  it("closes the contract API to the storekeeper", async () => {
    const cookie = await cookieOf("vantung");
    const response = await list.GET(appRequest("/api/contracts", { cookie }));
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toBe(
      "Bạn không có quyền thực hiện thao tác này",
    );
  });

  it("refuses an approval from a seller", async () => {
    await submitContract(ctx.db, fx.director, rental.id);
    const cookie = await cookieOf("quocbao");
    const response = await call(
      approve.POST,
      "POST",
      `/api/contracts/${rental.id}/approve`,
      cookie,
      { id: rental.id },
      {},
    );
    expect(response.status).toBe(403);
  });

  it("answers 409 to a stale edit", async () => {
    const cookie = await cookieOf("quocbao");
    const response = await putOne(cookie, rental.id, {
      ...d5Rental(fx),
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(response.status).toBe(409);
  });

  it("opens an amendment once the rental is approved", async () => {
    await submitContract(ctx.db, fx.director, rental.id);
    await approveContract(ctx.db, fx.director, rental.id, null);
    const cookie = await cookieOf("quocbao");
    const response = await call(
      amendments.POST,
      "POST",
      `/api/contracts/${rental.id}/amendments`,
      cookie,
      { id: rental.id },
      {},
    );
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: { code: string } };
    expect(data.code).toBe(`${rental.code}/01`);
  });
});

describe("terms and number preview (tasks 6.2)", () => {
  it("refuses a malformed date", async () => {
    const cookie = await cookieOf("thuha");
    const response = await call(
      terms.GET,
      "GET",
      `/api/contracts/${rental.id}/terms?date=01/12/2026`,
      cookie,
      { id: rental.id },
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe(
      "Ngày không hợp lệ",
    );
  });

  it("previews the next number without taking it", async () => {
    const cookie = await cookieOf("quocbao");
    const before = await ctx.db.select().from(documentCounter);
    const response = await preview.GET(
      appRequest(
        `/api/contracts/code-preview?customerId=${fx.customer("NT-0001")}&startDate=2026-11-20&customerToken=Minh%20Ph%C3%A1t`,
        { cookie },
      ),
    );
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: { code: string } };
    expect(data.code).toBe("112026/ANPHAT-MINHPHAT-2");
    expect(await ctx.db.select().from(documentCounter)).toEqual(before);
  });
});

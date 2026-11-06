// Payables routes (payables task 6.1, design D6, D8): only the accountant
// and the director read D14c and record or cancel supplier payments; 409
// and 422 answers carry the message; the Excel downloads.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  appRequest,
  createTestContext,
  installTestContext,
  signInAs,
  TEST_PASSWORD,
} from "@/test/auth";
import { receiptFor } from "@/test/payables";
import { setupReceivingFixture, type ReceivingFixture } from "@/test/receiving";

import * as exported from "./export/route";
import * as cancel from "./payments/[id]/cancel/route";
import * as preview from "./payments/preview/route";
import * as payments from "./payments/route";
import * as one from "./suppliers/[id]/route";
import * as suppliers from "./suppliers/route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let fx: ReceivingFixture;
let seller = "";
const cookies = new Map<string, string>();

const today = () =>
  new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

beforeEach(async () => {
  fx = await setupReceivingFixture(ctx);
  seller = fx.supplier("NCC-0002");
  await receiptFor(ctx, fx, { quantity: "10", price: 100_000, day: today() });
  cookies.clear();
  for (const name of ["quocbao", "minhanh", "thuha", "vantung"]) {
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

const paymentBody = (amount: number) => ({
  requestId: crypto.randomUUID(),
  supplierId: seller,
  kind: "PAYMENT",
  amount,
  method: "CASH",
  paidDate: today(),
});

describe("/api/payables reading", () => {
  it("lets the accountant and the director read, nobody else", async () => {
    for (const [as, status] of [
      ["thuha", 200],
      ["minhanh", 200],
      ["quocbao", 403],
      ["vantung", 403],
    ] as const) {
      const list = await call(suppliers.GET, "/api/payables/suppliers", { as });
      expect(list.status).toBe(status);
      const detail = await call(one.GET, `/api/payables/suppliers/${seller}`, {
        as,
        params: { id: seller },
      });
      expect(detail.status).toBe(status);
      const file = await call(exported.GET, "/api/payables/export", { as });
      expect(file.status).toBe(status);
    }
    const list = await call(suppliers.GET, "/api/payables/suppliers", {
      as: "thuha",
    });
    const json = (await list.json()) as {
      data: { totals: { owed: number }; rows: { code: string }[] };
    };
    expect(json.data.totals.owed).toBe(1_000_000);
    expect(json.data.rows.map((row) => row.code)).toEqual(["NCC-0002"]);
  });

  it("downloads the workbook", async () => {
    const file = await call(exported.GET, "/api/payables/export?filter=all", {
      as: "thuha",
    });
    expect(file.headers.get("content-disposition")).toContain(
      "cong-no-phai-tra-",
    );
  });

  it("answers 404 for an unknown seller", async () => {
    const id = crypto.randomUUID();
    const detail = await call(one.GET, `/api/payables/suppliers/${id}`, {
      as: "thuha",
      params: { id },
    });
    expect(detail.status).toBe(404);
  });
});

describe("/api/payables payments", () => {
  it("records, previews and cancels for the accountant and the director", async () => {
    const seen = await call(preview.POST, "/api/payables/payments/preview", {
      as: "thuha",
      method: "POST",
      body: paymentBody(400_000),
    });
    expect(seen.status).toBe(200);
    const saved = await call(payments.POST, "/api/payables/payments", {
      as: "thuha",
      method: "POST",
      body: paymentBody(400_000),
    });
    expect(saved.status).toBe(201);
    const { data } = (await saved.json()) as { data: { id: string } };
    const missing = await call(
      cancel.POST,
      `/api/payables/payments/${data.id}/cancel`,
      { as: "minhanh", method: "POST", body: {}, params: { id: data.id } },
    );
    expect(missing.status).toBe(422);
    const done = await call(
      cancel.POST,
      `/api/payables/payments/${data.id}/cancel`,
      {
        as: "minhanh",
        method: "POST",
        body: { reason: "Ghi nhầm" },
        params: { id: data.id },
      },
    );
    expect(done.status).toBe(200);
    const again = await call(
      cancel.POST,
      `/api/payables/payments/${data.id}/cancel`,
      {
        as: "thuha",
        method: "POST",
        body: { reason: "lần nữa" },
        params: { id: data.id },
      },
    );
    expect(again.status).toBe(409);
  });

  it("refuses sales and the warehouse", async () => {
    for (const as of ["quocbao", "vantung"]) {
      const saved = await call(payments.POST, "/api/payables/payments", {
        as,
        method: "POST",
        body: paymentBody(1_000),
      });
      expect(saved.status).toBe(403);
      const id = crypto.randomUUID();
      const cancelled = await call(
        cancel.POST,
        `/api/payables/payments/${id}/cancel`,
        { as, method: "POST", body: { reason: "x" }, params: { id } },
      );
      expect(cancelled.status).toBe(403);
    }
  });

  it("answers 422 with the message for an advance while owing", async () => {
    const saved = await call(payments.POST, "/api/payables/payments", {
      as: "thuha",
      method: "POST",
      body: { ...paymentBody(1_000), kind: "ADVANCE" },
    });
    expect(saved.status).toBe(422);
    const json = (await saved.json()) as { error: string };
    expect(json.error).toContain("còn phải trả 1.000.000 ₫");
  });
});

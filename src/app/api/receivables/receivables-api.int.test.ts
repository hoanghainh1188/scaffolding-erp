// Receivables routes (receivables task 6.1, design D6, D7): who reads D14,
// who records and cancels receipts, who settles, 409 and 422 answers, and
// the Excel download. Dates are the real today, so the cases hold whatever
// day CI runs on.
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
  requestId,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";

import * as settlement from "./contracts/[id]/settlement/route";
import * as customer from "./customers/[id]/route";
import * as customers from "./customers/route";
import * as exported from "./export/route";
import * as cancel from "./receipts/[id]/cancel/route";
import * as preview from "./receipts/preview/route";
import * as receipts from "./receipts/route";

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

const today = () =>
  new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

const receiptBody = (amount: number) => ({
  requestId: requestId(),
  customerId: fx.customerId,
  kind: "PAYMENT",
  amount,
  method: "TRANSFER",
  receivedDate: today(),
});

describe("/api/receivables reading", () => {
  it("lets the accountant and the director read, nobody else", async () => {
    await closedPeriod(ctx, fx, "2026-01", 1_000_000);
    const path = "/api/receivables/customers?filter=overdue";
    const byAccountant = await call(customers.GET, path, { as: "thuha" });
    expect(byAccountant.status).toBe(200);
    const { data } = (await byAccountant.json()) as {
      data: { rows: { id: string }[]; counts: { overdue: number } };
    };
    expect(data.rows.map((row) => row.id)).toEqual([fx.customerId]);
    expect(data.counts.overdue).toBe(1);
    expect((await call(customers.GET, path, { as: "minhanh" })).status).toBe(
      200,
    );
    expect((await call(customers.GET, path, { as: "quocbao" })).status).toBe(
      403,
    );
    expect((await call(customers.GET, path, { as: "vantung" })).status).toBe(
      403,
    );
    const one = await call(customer.GET, `/api/receivables/customers/x`, {
      as: "thuha",
      params: { id: fx.customerId },
    });
    expect(one.status).toBe(200);
    expect(
      (
        await call(customer.GET, `/api/receivables/customers/x`, {
          as: "quocbao",
          params: { id: fx.customerId },
        })
      ).status,
    ).toBe(403);
  });

  it("downloads the Excel for the accountant only", async () => {
    const path = "/api/receivables/export?filter=all";
    const response = await call(exported.GET, path, { as: "thuha" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="cong-no-${today()}.xlsx"`,
    );
    expect((await call(exported.GET, path, { as: "quocbao" })).status).toBe(
      403,
    );
  });
});

describe("/api/receivables/receipts", () => {
  it("records, previews and cancels for the accountant; 403 for sales", async () => {
    await closedPeriod(ctx, fx, "2026-01", 1_000_000);
    const shown = await call(
      preview.POST,
      "/api/receivables/receipts/preview",
      {
        as: "thuha",
        method: "POST",
        body: receiptBody(400_000),
      },
    );
    expect(shown.status).toBe(200);
    const saved = await call(receipts.POST, "/api/receivables/receipts", {
      as: "thuha",
      method: "POST",
      body: receiptBody(400_000),
    });
    expect(saved.status).toBe(201);
    const { data } = (await saved.json()) as { data: { id: string } };
    const refused = await call(receipts.POST, "/api/receivables/receipts", {
      as: "quocbao",
      method: "POST",
      body: receiptBody(1),
    });
    expect(refused.status).toBe(403);
    const noReason = await call(
      cancel.POST,
      "/api/receivables/receipts/x/cancel",
      {
        as: "thuha",
        method: "POST",
        body: { reason: "" },
        params: { id: data.id },
      },
    );
    expect(noReason.status).toBe(422);
    const done = await call(cancel.POST, "/api/receivables/receipts/x/cancel", {
      as: "minhanh",
      method: "POST",
      body: { reason: "Trùng phiếu" },
      params: { id: data.id },
    });
    expect(done.status).toBe(200);
    const again = await call(
      cancel.POST,
      "/api/receivables/receipts/x/cancel",
      {
        as: "thuha",
        method: "POST",
        body: { reason: "Trùng phiếu" },
        params: { id: data.id },
      },
    );
    expect(again.status).toBe(409);
  });

  it("refuses settling without the refund that was shown", async () => {
    const response = await call(
      settlement.POST,
      `/api/receivables/contracts/${fx.deal.id}/settlement`,
      { as: "thuha", method: "POST", body: {}, params: { id: fx.deal.id } },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error:
        "Thiếu số hoàn cọc đã xem. Bạn tải lại trang thanh lý rồi bấm lại.",
    });
  });

  it("answers 422 with the field for a bad amount", async () => {
    const response = await call(receipts.POST, "/api/receivables/receipts", {
      as: "thuha",
      method: "POST",
      body: receiptBody(0),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "Số tiền phải lớn hơn 0 ₫.",
      data: { field: "amount" },
    });
  });
});

describe("/api/receivables/contracts/[id]/settlement", () => {
  it("shows the conditions and refuses settling for sales and while goods are on site", async () => {
    const params = { id: fx.deal.id };
    const path = `/api/receivables/contracts/${fx.deal.id}/settlement`;
    const view = await call(settlement.GET, path, { as: "thuha", params });
    expect(view.status).toBe(200);
    const { data } = (await view.json()) as {
      data: { ready: boolean; checks: { key: string; ok: boolean }[] };
    };
    expect(data.ready).toBe(false);
    expect(
      (
        await call(settlement.POST, path, {
          as: "quocbao",
          method: "POST",
          body: {},
          params,
        })
      ).status,
    ).toBe(403);
    const blocked = await call(settlement.POST, path, {
      as: "thuha",
      method: "POST",
      body: { expectedRefund: 0 },
      params,
    });
    expect(blocked.status).toBe(409);
  });
});

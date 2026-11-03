// On-site exchanges (site-operations spec site-exchanges; tasks 5.1–5.3):
// one batch out, the old items back on a linked return note.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import {
  deliveryExchange,
  deliveryNote,
  deliveryNoteLine,
  inventoryLedger,
} from "@/db/schema";
import { changeDeliveryStatus } from "@/lib/deliveries/service";
import { returnContract } from "@/lib/returns/queries";
import { postReturn } from "@/lib/returns/post";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { confirm, started } from "@/test/deliveries";
import { lineBody, RETURN_NOW } from "@/test/returns";
import {
  movedNow,
  setupSiteFixture,
  SITE_NOW,
  type SiteFixture,
} from "@/test/site-operations";

import { cancelExchange, createExchange, type ExchangeBody } from "./service";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

let fx: SiteFixture;
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

const body = (overrides: Partial<ExchangeBody> = {}): ExchangeBody => ({
  contractId: fx.from.id,
  lines: [{ itemId: fx.item("PK-KU"), quantity: "100" }],
  expected: [{ itemId: fx.item("GG-CH"), quantity: "100" }],
  overContractConfirmed: true,
  ...overrides,
});

async function made(overrides: Partial<ExchangeBody> = {}) {
  const result = await createExchange(ctx.db, fx.sales, body(overrides), {
    now: SITE_NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function exchangeRow(id: string) {
  const [row] = await ctx.db
    .select()
    .from(deliveryExchange)
    .where(eq(deliveryExchange.id, id));
  return row;
}

function returnWith(
  exchangeId: string | null,
  good: number,
  db = ctx.db,
  contractId = fx.from.id,
) {
  return postReturn(
    db,
    fx.warehouse,
    {
      clientDraftId: randomUUID(),
      contractId,
      yardLocationId: fx.yard,
      lines: [lineBody(fx.item("GG-CH"), [good, 0, 0, 0])],
      exchangeId,
    },
    { now: RETURN_NOW },
  );
}

describe("making an exchange", () => {
  it("makes a waiting batch and the link, writing no ledger line", async () => {
    const exchange = await made();
    const [note] = await ctx.db
      .select()
      .from(deliveryNote)
      .where(eq(deliveryNote.id, exchange.deliveryNoteId));
    expect(note?.status).toBe("PLANNED");
    expect((await exchangeRow(exchange.id))?.status).toBe("WAITING");
    expect(
      await ctx.db
        .select()
        .from(inventoryLedger)
        .where(eq(inventoryLedger.documentCode, exchange.deliveryCode)),
    ).toEqual([]);
    const rows = await activityRows(ctx.db, exchange.deliveryCode);
    expect(rows.map((row) => row.action)).toEqual(["CREATE"]);
    expect(rows[0]?.summary).toBe(
      `Đổi hàng · Đợt ${exchange.batchNo} · giao 100 kích · nhận về dự kiến 100 chéo`,
    );
  });

  it("refuses an item missing on the contract", async () => {
    const result = await createExchange(
      ctx.db,
      fx.sales,
      body({ lines: [{ itemId: fx.item("GG-K15"), quantity: "10" }] }),
      { now: SITE_NOW },
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("refuses more back than is on site and nothing back", async () => {
    const tooMany = await createExchange(
      ctx.db,
      fx.sales,
      body({ expected: [{ itemId: fx.item("GG-CH"), quantity: "300" }] }),
      { now: SITE_NOW },
    );
    expect(tooMany).toMatchObject({
      ok: false,
      error:
        "GG-CH: dự kiến nhận về (300 cái) nhiều hơn số đang ở công trình (260 cái).",
    });
    const nothing = await createExchange(
      ctx.db,
      fx.sales,
      body({ expected: [] }),
      { now: SITE_NOW },
    );
    expect(nothing).toMatchObject({
      ok: false,
      error:
        "Đổi hàng cần ít nhất một mã nhận về. Chỉ giao thêm thì tạo đợt xuất thường.",
    });
  });

  it("refuses a contract not running and the storekeeper", async () => {
    const notRunning = await createExchange(
      ctx.db,
      fx.sales,
      body({ contractId: fx.to.id }),
      { now: SITE_NOW },
    );
    expect(notRunning).toMatchObject({
      ok: false,
      error: "Chỉ đổi hàng cho hợp đồng thuê đang thực hiện.",
    });
    const storekeeper = await createExchange(ctx.db, fx.warehouse, body(), {
      now: SITE_NOW,
    });
    expect(storekeeper).toMatchObject({ ok: false, status: 403 });
  });

  it("drops the link when its batch is cancelled", async () => {
    const exchange = await made();
    const cancelled = await changeDeliveryStatus(
      ctx.db,
      fx.sales,
      exchange.deliveryNoteId,
      "CANCEL",
      "Khách hoãn đổi",
      { now: SITE_NOW },
    );
    expect(cancelled.ok).toBe(true);
    expect((await exchangeRow(exchange.id))?.status).toBe("CANCELLED");
  });

  it("is given up with a reason, the batch staying", async () => {
    const exchange = await made();
    const blank = await cancelExchange(ctx.db, fx.sales, exchange.id, " ");
    expect(blank).toMatchObject({
      ok: false,
      error: "Bạn ghi lý do bỏ chờ thu hồi.",
    });
    const result = await cancelExchange(
      ctx.db,
      fx.sales,
      exchange.id,
      "Khách giữ chéo dài dùng tiếp",
      { now: SITE_NOW },
    );
    expect(result.ok).toBe(true);
    const rows = await activityRows(ctx.db, exchange.deliveryCode);
    expect(rows.map((row) => [row.action, row.summary])).toEqual([
      ["CREATE", expect.any(String)],
      ["UPDATE", "Bỏ chờ thu hồi: Khách giữ chéo dài dùng tiếp"],
    ]);
  });
});

describe("joining a return note", () => {
  it("joins the return note and finishes the link", async () => {
    const exchange = await made();
    const result = await returnWith(exchange.id, 92);
    expect(result.ok).toBe(true);
    const row = await exchangeRow(exchange.id);
    expect(row?.status).toBe("DONE");
    expect(row?.returnNoteId).not.toBeNull();
  });

  it("leaves the link waiting without the id", async () => {
    const exchange = await made();
    expect((await returnWith(null, 10)).ok).toBe(true);
    expect((await exchangeRow(exchange.id))?.status).toBe("WAITING");
  });

  it("refuses the link of another contract, writing nothing", async () => {
    const exchange = await made();
    await confirmAll(fx.to.id);
    const result = await returnWith(exchange.id, 1, ctx.db, fx.to.id);
    expect(result).toMatchObject({
      ok: false,
      error: "Lần đổi hàng không thuộc hợp đồng này.",
    });
  });

  it("joins one of two return notes sent at once", async () => {
    const exchange = await made();
    const [a, b] = await Promise.all([
      returnWith(exchange.id, 50),
      returnWith(exchange.id, 50, other.db),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser).toMatchObject({
      ok: false,
      error: expect.stringContaining("Lần đổi hàng này đã nhận phiếu thu hồi"),
    });
  });

  it("dates both notes by their own posting", async () => {
    const exchange = await made();
    const version = await started(ctx, fx, exchange.deliveryNoteId, RETURN_NOW);
    const lines = await ctx.db
      .select({ id: deliveryNoteLine.id })
      .from(deliveryNoteLine)
      .where(eq(deliveryNoteLine.noteId, exchange.deliveryNoteId));
    const posted = await confirm(
      ctx,
      fx,
      exchange.deliveryNoteId,
      version,
      lines.map((row) => ({
        lineId: row.id,
        condition: "NEW",
        quantity: "100",
      })),
      { now: RETURN_NOW },
    );
    expect(posted).toMatchObject({
      ok: true,
      data: { businessDate: "2026-11-05" },
    });
    const back = await returnWith(exchange.id, 100);
    expect(back).toMatchObject({
      ok: true,
      data: { businessDate: "2026-11-05" },
    });
  });

  it("shows the waiting link on M4 without a price", async () => {
    const exchange = await made();
    const result = await returnContract(ctx.db, fx.from.id);
    expect(result).toMatchObject({
      ok: true,
      data: {
        exchanges: [
          {
            id: exchange.id,
            deliveryCode: exchange.deliveryCode,
            expected: [{ code: "GG-CH", milli: 100_000 }],
          },
        ],
      },
    });
  });
});

/** Puts goods at Dương Nội through one transfer so returns may run. */
async function confirmAll(contractId: string) {
  await movedNow(ctx, fx, { "GG-CH": 5 }, { toContractId: contractId });
}

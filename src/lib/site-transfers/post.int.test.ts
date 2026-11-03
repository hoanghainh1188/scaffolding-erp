// Site transfers (site-operations spec site-transfers "Ghi sổ chuyển công
// trình", "Không chuyển quá số đang ở công trình", "Người đi xe xác nhận trên
// M9", "Một lần xác nhận chỉ ghi sổ một lần", "Hợp đồng nhận chuyển Đang
// thực hiện", "Thuê tối thiểu khi chuyển công trình"; tasks 3.2–3.4, 3.6).
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  contract,
  inventoryCost,
  inventoryLedger,
  siteTransfer,
  siteTransferLine,
} from "@/db/schema";
import { quantityFromDb } from "@/domain/quantity";
import { cancelContract } from "@/lib/contracts/approval";
import { createSite } from "@/lib/catalog/places";
import { onSiteByItem } from "@/lib/deliveries/records";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { d5Rental } from "@/test/contracts";
import { approvedContract } from "@/test/deliveries";
import { deliverMore, returnOf } from "@/test/returns";
import {
  draftTransfer,
  movedNow,
  setupSiteFixture,
  SITE_NOW,
  transferBody,
  type SiteFixture,
} from "@/test/site-operations";

import {
  createAndPostSiteTransfer,
  postSiteTransfer,
  postSiteTransferFromPhone,
} from "./post";
import { changeSiteTransferStatus, updateSiteTransfer } from "./service";

const ctx = createTestContext();
afterAll(() => ctx.close());

let fx: SiteFixture;
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

const K = 1000;
const milli = (value: string) => quantityFromDb(value, "KG").milli;

async function onSite(contractId: string, code: string): Promise<number> {
  return ((await onSiteByItem(ctx.db, contractId)).get(fx.item(code)) ?? 0) / K;
}

async function ledgerOf(code: string) {
  return ctx.db
    .select()
    .from(inventoryLedger)
    .where(eq(inventoryLedger.documentCode, code))
    .orderBy(inventoryLedger.id);
}

async function avg(code: string, condition: string) {
  const [row] = await ctx.db
    .select({ avg: inventoryCost.avgCost })
    .from(inventoryCost)
    .where(
      and(
        eq(inventoryCost.itemId, fx.item(code)),
        eq(inventoryCost.condition, condition),
      ),
    );
  return row?.avg ?? null;
}

describe("posting a transfer", () => {
  it("moves goods between the two sites, Mới first, at the average", async () => {
    const avgNew = await avg("GG-K17", "NEW");
    const avgGood = await avg("GG-K17", "GOOD");
    const posted = await movedNow(ctx, fx, { "GG-K17": 50, "GG-CH": 40 });
    expect(posted.businessDate).toBe("2026-11-05");
    const lines = await ledgerOf(posted.code);
    expect(
      lines.map((line) => [
        line.movement,
        line.condition,
        line.locationId === fx.fromLocation ? "from" : "to",
        milli(line.quantity) / K,
      ]),
    ).toEqual([
      ["TRANSFER_OUT", "NEW", "from", -20],
      ["TRANSFER_IN", "NEW", "to", 20],
      ["TRANSFER_OUT", "GOOD", "from", -30],
      ["TRANSFER_IN", "GOOD", "to", 30],
      ["TRANSFER_OUT", "GOOD", "from", -40],
      ["TRANSFER_IN", "GOOD", "to", 40],
    ]);
    expect(lines.every((line) => line.businessDate === "2026-11-05")).toBe(
      true,
    );
    expect(await avg("GG-K17", "NEW")).toBe(avgNew);
    expect(await avg("GG-K17", "GOOD")).toBe(avgGood);
    expect(await reconcileInventory(ctx.db)).toEqual([]);
  });

  it("changes on site and còn phải giao of both contracts", async () => {
    await movedNow(ctx, fx, { "GG-K17": 50 });
    expect(await onSite(fx.from.id, "GG-K17")).toBe(70);
    expect(await onSite(fx.to.id, "GG-K17")).toBe(50);
  });

  it("starts the receiving contract without a contract log row", async () => {
    const before = (await activityRows(ctx.db, fx.to.code)).length;
    const posted = await movedNow(ctx, fx, { "GG-K17": 10 });
    expect(posted.contractStarted).toBe(true);
    const [row] = await ctx.db
      .select({ status: contract.status })
      .from(contract)
      .where(eq(contract.id, fx.to.id));
    expect(row?.status).toBe("ACTIVE");
    const rows = await activityRows(ctx.db, posted.code);
    expect(rows.map((r) => r.action)).toEqual(["POST"]);
    expect(await activityRows(ctx.db, fx.to.code)).toHaveLength(before);
  });

  it("refuses more than the source site has, writing nothing", async () => {
    const result = await createAndPostSiteTransfer(
      ctx.db,
      fx.sales,
      transferBody(fx, { "GG-K17": 130 }),
      { now: SITE_NOW },
    );
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error:
        "GG-K17: số chuyển (130 cái) nhiều hơn số đang ở công trình Chung cư An Phú – Block B (120 cái).",
    });
    expect(
      await ctx.db
        .select()
        .from(inventoryLedger)
        .where(eq(inventoryLedger.documentType, "SITE_TRANSFER")),
    ).toEqual([]);
  });

  it("refuses a draft once its goods went back to the yard", async () => {
    const draft = await draftTransfer(ctx, fx, { "GG-K17": 50 });
    const back = await returnOf(
      ctx,
      { ...fx, deal: fx.from, siteLocation: fx.fromLocation },
      { "GG-K17": [100, 0, 0, 0] },
      { now: SITE_NOW },
    );
    expect(back.ok).toBe(true);
    const result = await postSiteTransfer(
      ctx.db,
      fx.sales,
      draft.id,
      { updatedAt: draft.updatedAt },
      { now: SITE_NOW },
    );
    expect(result).toMatchObject({
      ok: false,
      error:
        "GG-K17: số chuyển (50 cái) nhiều hơn số đang ở công trình Chung cư An Phú – Block B (20 cái).",
    });
    const [row] = await ctx.db
      .select({ status: siteTransfer.status })
      .from(siteTransfer)
      .where(eq(siteTransfer.id, draft.id));
    expect(row?.status).toBe("DRAFT");
  });

  it("refuses an item missing on the receiving contract", async () => {
    const result = await createAndPostSiteTransfer(
      ctx.db,
      fx.sales,
      transferBody(fx, { "GG-K15": 5 }),
      { now: SITE_NOW },
    );
    expect(result.ok).toBe(false);
  });

  it("asks before going over the receiving contract and flags it", async () => {
    await deliverMore(ctx, fx, fx.to.id, [["GG-K17", "GOOD", 590]]);
    const refused = await createAndPostSiteTransfer(
      ctx.db,
      fx.sales,
      transferBody(fx, { "GG-K17": 20 }),
      { now: SITE_NOW },
    );
    expect(refused).toMatchObject({
      ok: false,
      error:
        "GG-K17: chuyển 20 cái, hợp đồng nhận chỉ còn phải giao 10 cái. Bạn xác nhận nếu đúng.",
    });
    const posted = await movedNow(
      ctx,
      fx,
      { "GG-K17": 20 },
      { overContractConfirmed: true },
    );
    const [log] = await activityRows(ctx.db, posted.code);
    expect(log?.flags).toContain("ANOMALY");
  });

  it("stores whether both contracts are one customer's", async () => {
    const posted = await movedNow(ctx, fx, { "GG-K17": 10 });
    const [row] = await ctx.db
      .select({ same: siteTransfer.sameCustomer })
      .from(siteTransfer)
      .where(eq(siteTransfer.code, posted.code));
    expect(row?.same).toBe(true);
  });
});

describe("another customer", () => {
  async function hungRental() {
    const made = await createSite(ctx.db, fx.director, {
      name: "Nhà anh Hùng",
      address: "Hà Đông, Hà Nội",
      province: "HN",
      customerId: fx.customer("NT-0002"),
    });
    if (!made.ok) throw new Error(made.error);
    return approvedContract(ctx, fx, {
      ...d5Rental(fx),
      customerId: fx.customer("NT-0002"),
      siteId: made.data.id,
      customerToken: "HUNG",
    });
  }

  it("needs the tick, then flags the log and stores it", async () => {
    const hung = await hungRental();
    const refused = await createAndPostSiteTransfer(
      ctx.db,
      fx.sales,
      transferBody(fx, { "GG-K17": 10 }, { toContractId: hung.id }),
      { now: SITE_NOW },
    );
    expect(refused).toMatchObject({
      ok: false,
      error: expect.stringContaining("Hai hợp đồng khác nhà thầu"),
    });
    const posted = await movedNow(
      ctx,
      fx,
      { "GG-K17": 10 },
      { toContractId: hung.id, otherCustomerConfirmed: true },
    );
    const [row] = await ctx.db
      .select({ same: siteTransfer.sameCustomer })
      .from(siteTransfer)
      .where(eq(siteTransfer.code, posted.code));
    expect(row?.same).toBe(false);
    const [log] = await activityRows(ctx.db, posted.code);
    expect(log?.flags).toContain("ANOMALY");
  });
});

describe("the phone", () => {
  async function sent() {
    const draft = await draftTransfer(ctx, fx, { "GG-K17": 50, "GG-CH": 40 });
    const result = await changeSiteTransferStatus(
      ctx.db,
      fx.sales,
      draft.id,
      "SEND",
      { updatedAt: draft.updatedAt },
      { now: SITE_NOW },
    );
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  const phoneBody = (
    moved: Record<string, number>,
    draftId = randomUUID(),
  ) => ({
    clientDraftId: draftId,
    vehiclePlate: "29C-456.78",
    lines: Object.entries(moved).map(([code, count]) => ({
      itemId: fx.item(code),
      moved: String(count),
    })),
  });

  it("posts what the truck carried, leaving the rest at the source", async () => {
    const transfer = await sent();
    const result = await postSiteTransferFromPhone(
      ctx.db,
      fx.warehouse,
      transfer.code,
      phoneBody({ "GG-K17": 50, "GG-CH": 36 }),
      { now: SITE_NOW },
    );
    expect(result.ok).toBe(true);
    expect(await onSite(fx.from.id, "GG-CH")).toBe(224);
    expect(await onSite(fx.to.id, "GG-CH")).toBe(36);
    const lines = await ctx.db
      .select()
      .from(siteTransferLine)
      .where(eq(siteTransferLine.transferId, transfer.id));
    expect(
      lines.map((line) => [
        milli(line.plannedQuantity),
        milli(line.movedQuantity ?? "0"),
      ]),
    ).toEqual(
      expect.arrayContaining([
        [40 * K, 36 * K],
        [50 * K, 50 * K],
      ]),
    );
    const [log] = await activityRows(ctx.db, transfer.code).then((rows) =>
      rows.filter((row) => row.action === "POST"),
    );
    expect(log?.summary).toBe(
      "Chung cư An Phú – Block B → Trường THCS Dương Nội · 50 khung, 36 chéo · chở ít hơn 4 cái",
    );
  });

  it("refuses carrying more than the office wrote", async () => {
    const transfer = await sent();
    const result = await postSiteTransferFromPhone(
      ctx.db,
      fx.warehouse,
      transfer.code,
      phoneBody({ "GG-K17": 55 }),
      { now: SITE_NOW },
    );
    expect(result).toMatchObject({
      ok: false,
      error:
        "Bạn chở 55 cái GG-K17, nhiều hơn số văn phòng ghi 50 cái. Văn phòng cần sửa phiếu nếu muốn chuyển thêm.",
    });
  });

  it("takes the posting day, not the phone's", async () => {
    const transfer = await sent();
    const result = await postSiteTransferFromPhone(
      ctx.db,
      fx.warehouse,
      transfer.code,
      {
        ...phoneBody({ "GG-K17": 50, "GG-CH": 40 }),
        confirmedOnDeviceAt: "2026-11-05T14:40:00Z",
      },
      { now: new Date("2026-11-05T23:50:00Z") },
    );
    expect(result).toMatchObject({
      ok: true,
      data: { businessDate: "2026-11-06" },
    });
  });

  it("posts once for a resent draft", async () => {
    const transfer = await sent();
    const body = phoneBody({ "GG-K17": 50, "GG-CH": 40 });
    const first = await postSiteTransferFromPhone(
      ctx.db,
      fx.warehouse,
      transfer.code,
      body,
      { now: SITE_NOW },
    );
    const again = await postSiteTransferFromPhone(
      ctx.db,
      fx.warehouse,
      transfer.code,
      body,
      { now: SITE_NOW },
    );
    expect(first.ok && again.ok).toBe(true);
    expect(again).toMatchObject({ data: { replayed: true } });
    expect(await ledgerOf(transfer.code)).toHaveLength(6);
    expect(
      (await activityRows(ctx.db, transfer.code)).filter(
        (row) => row.action === "POST",
      ),
    ).toHaveLength(1);
  });

  it("names who posted when the office pulls back too late", async () => {
    const transfer = await sent();
    await postSiteTransferFromPhone(
      ctx.db,
      fx.warehouse,
      transfer.code,
      phoneBody({ "GG-K17": 50, "GG-CH": 40 }),
      { now: SITE_NOW },
    );
    const result = await changeSiteTransferStatus(
      ctx.db,
      fx.sales,
      transfer.id,
      "PULL_BACK",
      {},
      { now: SITE_NOW },
    );
    expect(result).toMatchObject({
      ok: false,
      error: "Phiếu CCT-2026-001 đã chuyển lúc 15:30 do Văn Tùng xác nhận.",
    });
  });

  it("is refused to sales", async () => {
    const transfer = await sent();
    const result = await postSiteTransferFromPhone(
      ctx.db,
      fx.sales,
      transfer.code,
      phoneBody({ "GG-K17": 50 }),
      { now: SITE_NOW },
    );
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(await ledgerOf(transfer.code)).toEqual([]);
  });
});

describe("statuses and edits", () => {
  it("logs one row per command and none for a refused one", async () => {
    const draft = await draftTransfer(ctx, fx, { "GG-K17": 50 });
    const later = new Date(SITE_NOW.getTime() + 60_000);
    const edited = await updateSiteTransfer(
      ctx.db,
      fx.sales,
      draft.id,
      { ...transferBody(fx, { "GG-K17": 40 }), updatedAt: draft.updatedAt },
      { now: later },
    );
    expect(edited.ok).toBe(true);
    const unchanged = await updateSiteTransfer(
      ctx.db,
      fx.sales,
      draft.id,
      {
        ...transferBody(fx, { "GG-K17": 40 }),
        updatedAt: edited.ok ? edited.data.updatedAt : "",
      },
      { now: SITE_NOW },
    );
    expect(unchanged.ok).toBe(true);
    const stale = await updateSiteTransfer(
      ctx.db,
      fx.sales,
      draft.id,
      { ...transferBody(fx, { "GG-K17": 30 }), updatedAt: draft.updatedAt },
      { now: SITE_NOW },
    );
    expect(stale).toMatchObject({
      ok: false,
      status: 409,
      error: "Phiếu vừa được người khác sửa. Bạn tải lại để xem bản mới.",
    });
    const noReason = await changeSiteTransferStatus(
      ctx.db,
      fx.sales,
      draft.id,
      "CANCEL",
      { reason: " " },
      { now: SITE_NOW },
    );
    expect(noReason).toMatchObject({
      ok: false,
      error: "Bạn ghi lý do hủy phiếu chuyển.",
    });
    const cancelled = await changeSiteTransferStatus(
      ctx.db,
      fx.sales,
      draft.id,
      "CANCEL",
      { reason: "Khách hoãn" },
      { now: SITE_NOW },
    );
    expect(cancelled.ok).toBe(true);
    expect(
      (await activityRows(ctx.db, draft.code)).map((row) => row.action),
    ).toEqual(["CREATE", "UPDATE", "CANCEL"]);
  });

  it("refuses editing a sent transfer", async () => {
    const draft = await draftTransfer(ctx, fx, { "GG-K17": 50 });
    const sentResult = await changeSiteTransferStatus(
      ctx.db,
      fx.sales,
      draft.id,
      "SEND",
      { updatedAt: draft.updatedAt },
      { now: SITE_NOW },
    );
    const result = await updateSiteTransfer(
      ctx.db,
      fx.sales,
      draft.id,
      {
        ...transferBody(fx, { "GG-K17": 40 }),
        updatedAt: sentResult.ok ? sentResult.data.updatedAt : "",
      },
      { now: SITE_NOW },
    );
    expect(result).toMatchObject({
      ok: false,
      error: "Phiếu đã gửi điện thoại. Bạn rút về rồi sửa.",
    });
  });

  it("refuses sales scoped to sale contracts and the storekeeper", async () => {
    const seller = await fx.seller("thuyvy", "SALE");
    for (const actor of [seller, fx.warehouse]) {
      const result = await createAndPostSiteTransfer(
        ctx.db,
        actor,
        transferBody(fx, { "GG-K17": 10 }),
        { now: SITE_NOW },
      );
      expect(result).toMatchObject({ ok: false, status: 403 });
    }
  });

  it("blocks cancelling the receiving contract while a transfer is open", async () => {
    const draft = await draftTransfer(ctx, fx, { "GG-K17": 10 });
    const result = await cancelContract(
      ctx.db,
      fx.director,
      fx.to.id,
      "Khách thôi",
    );
    expect(result).toMatchObject({
      ok: false,
      error: `Hợp đồng còn phiếu chuyển công trình ${draft.code} chưa xong. Bạn hủy phiếu chuyển đó trước rồi hủy hợp đồng.`,
    });
  });
});

describe("two contracts at one site", () => {
  it("keeps them apart while the site's stock stays", async () => {
    const renewal = await approvedContract(ctx, fx, {
      ...d5Rental(fx),
      siteId: fx.site("Chung cư An Phú – Block B"),
    });
    await movedNow(ctx, fx, { "GG-K17": 30 }, { toContractId: renewal.id });
    expect(await onSite(fx.from.id, "GG-K17")).toBe(90);
    expect(await onSite(renewal.id, "GG-K17")).toBe(30);
    const atSite = await ctx.db
      .select({ quantity: inventoryLedger.quantity })
      .from(inventoryLedger)
      .where(
        and(
          eq(inventoryLedger.locationId, fx.fromLocation),
          eq(inventoryLedger.itemId, fx.item("GG-K17")),
        ),
      );
    expect(atSite.reduce((sum, row) => sum + milli(row.quantity), 0)).toBe(
      120 * K,
    );
  });
});

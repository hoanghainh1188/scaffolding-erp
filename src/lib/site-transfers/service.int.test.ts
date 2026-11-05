// Site transfer drafts (site-operations spec site-transfers): the checks on
// the body, unknown transfers, moving a draft to another receiving
// contract (also one at the same site), and pulling a sent transfer back to the office.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { approvedRental } from "@/test/deliveries";
import {
  draftTransfer,
  setupSiteFixture,
  SITE_NOW,
  transferBody,
  type SiteFixture,
} from "@/test/site-operations";

import { transferView } from "./queries";
import {
  changeSiteTransferStatus,
  createSiteTransfer,
  TRANSFER_SERVICE_MESSAGES,
  updateSiteTransfer,
  type TransferBody,
} from "./service";

const ctx = createTestContext();
afterAll(() => ctx.close());

let fx: SiteFixture;
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

const UNKNOWN = "00000000-0000-4000-8000-000000000000";
const LATER = new Date(SITE_NOW.getTime() + 60_000);

const create = (patch: Partial<TransferBody>) =>
  createSiteTransfer(
    ctx.db,
    fx.sales,
    { ...transferBody(fx, { "GG-CH": 10 }), ...patch },
    { now: SITE_NOW },
  );

describe("transfer body checks", () => {
  it("needs both contracts", async () => {
    expect(await create({ fromContractId: "x" })).toMatchObject({
      ok: false,
      status: 422,
      field: "fromContractId",
      error: TRANSFER_SERVICE_MESSAGES.chooseFrom,
    });
    expect(await create({ toContractId: undefined })).toMatchObject({
      ok: false,
      field: "toContractId",
      error: TRANSFER_SERVICE_MESSAGES.chooseTo,
    });
    expect(await create({ fromContractId: UNKNOWN })).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await create({ toContractId: UNKNOWN })).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("names the line with an unknown item or a bad count", async () => {
    expect(
      await create({ lines: [{ itemId: UNKNOWN, quantity: "1" }] }),
    ).toMatchObject({
      ok: false,
      field: "lines.0.itemId",
      error: TRANSFER_SERVICE_MESSAGES.item,
    });
    expect(
      await create({ lines: [{ itemId: fx.item("GG-CH"), quantity: "1,5" }] }),
    ).toMatchObject({ ok: false, field: "lines.0.quantity" });
  });

  it("refuses a plate that is too long", async () => {
    expect(await create({ vehiclePlate: "X".repeat(21) })).toMatchObject({
      ok: false,
      field: "vehiclePlate",
    });
  });
});

describe("editing a draft", () => {
  it("answers 404 for a transfer that does not exist", async () => {
    for (const ref of [UNKNOWN, "CCT-2026-999"]) {
      expect(
        await updateSiteTransfer(
          ctx.db,
          fx.sales,
          ref,
          transferBody(fx, { "GG-CH": 1 }),
          { now: SITE_NOW },
        ),
      ).toMatchObject({ ok: false, status: 404 });
    }
  });

  it("moves the draft to another receiving contract, logging the change", async () => {
    const third = await approvedRental(ctx, fx);
    const draft = await draftTransfer(ctx, fx, { "GG-CH": 10 });
    const moved = await updateSiteTransfer(
      ctx.db,
      fx.sales,
      draft.id,
      {
        ...transferBody(fx, { "GG-CH": 10 }, { toContractId: third.id }),
        updatedAt: draft.updatedAt,
      },
      { now: LATER },
    );
    expect(moved.ok).toBe(true);
    expect((await transferView(ctx.db, draft.id))?.to.contractId).toBe(
      third.id,
    );
    // Both rentals are at Dương Nội: the contract code tells them apart.
    const rows = await activityRows(ctx.db, draft.code);
    expect(rows.map((row) => row.action)).toEqual(["CREATE", "UPDATE"]);
    expect(rows[1]?.changes).toEqual([
      {
        field: "toContractId",
        label: "Công trình nhận",
        before: `Trường THCS Dương Nội · ${fx.to.code}`,
        after: `Trường THCS Dương Nội · ${third.code}`,
      },
    ]);
  });

  it("keeps the receiving contract when the body leaves it out", async () => {
    const draft = await draftTransfer(ctx, fx, { "GG-CH": 10 });
    const edited = await updateSiteTransfer(
      ctx.db,
      fx.sales,
      draft.id,
      {
        ...transferBody(fx, { "GG-CH": 5 }, { toContractId: undefined }),
        updatedAt: draft.updatedAt,
      },
      { now: LATER },
    );
    expect(edited.ok).toBe(true);
    expect((await transferView(ctx.db, draft.id))?.to.contractId).toBe(
      fx.to.id,
    );
  });
});

describe("sending and pulling back", () => {
  it("puts a pulled-back transfer back in office mode", async () => {
    const draft = await draftTransfer(ctx, fx, { "GG-CH": 10 });
    const sent = await changeSiteTransferStatus(
      ctx.db,
      fx.sales,
      draft.id,
      "SEND",
      { updatedAt: draft.updatedAt },
      { now: SITE_NOW },
    );
    expect(sent).toMatchObject({ ok: true, data: { status: "SENT" } });
    expect((await transferView(ctx.db, draft.id))?.confirmMode).toBe("PHONE");
    const back = await changeSiteTransferStatus(
      ctx.db,
      fx.sales,
      draft.code,
      "PULL_BACK",
      {},
      { now: LATER },
    );
    expect(back).toMatchObject({ ok: true, data: { status: "DRAFT" } });
    expect((await transferView(ctx.db, draft.id))?.confirmMode).toBe("OFFICE");
    expect(
      (await activityRows(ctx.db, draft.code)).map((row) => row.action),
    ).toHaveLength(3);
  });

  it("answers 404 for a transfer that does not exist", async () => {
    expect(
      await changeSiteTransferStatus(ctx.db, fx.sales, UNKNOWN, "SEND", {}),
    ).toMatchObject({ ok: false, status: 404 });
  });
});

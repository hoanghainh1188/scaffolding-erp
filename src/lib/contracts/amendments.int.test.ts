// Amendments (contract-amendments spec; tasks 5.1, 5.2, 5.3). Closed
// billing periods are real rows (rental-billing task 4.4).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { billingPeriod, contractRevision } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { CONTRACT_MESSAGES } from "@/domain/contract";
import { REVISION_MESSAGES } from "@/domain/contract-revision";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import {
  d5Rental,
  setupContractFixture,
  type ContractFixture,
} from "@/test/contracts";

import {
  approveAmendment,
  cancelAmendment,
  createAmendment,
  returnAmendment,
  submitAmendment,
  updateAmendment,
  type AmendmentBody,
} from "./amendments";
import { approveContract, cancelContract, submitContract } from "./approval";
import { lastClosedPeriodEnd } from "./billing-lock";
import { createContract, updateContract } from "./service";
import { contractTermsAt } from "./terms";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

const TODAY = "2026-11-05" as BusinessDate;

let fx: ContractFixture;
let contractId = "";
beforeEach(async () => {
  fx = await setupContractFixture(ctx);
  const saved = await createContract(ctx.db, fx.sales, d5Rental(fx));
  if (!saved.ok) throw new Error(saved.error);
  contractId = saved.data.id;
  await submitContract(ctx.db, fx.sales, contractId);
  const approved = await approveContract(ctx.db, fx.director, contractId, null);
  if (!approved.ok) throw new Error(approved.error);
});

/** A closed billing period of the contract ending on `end` (a month end). */
async function closePeriodUntil(end: string) {
  const [revision] = await ctx.db
    .select({ id: contractRevision.id })
    .from(contractRevision)
    .where(eq(contractRevision.contractId, contractId));
  const days = 30;
  const due = new Date(`${end}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + days);
  await ctx.db.insert(billingPeriod).values({
    contractId,
    month: `${end.slice(0, 7)}-01`,
    periodEnd: end,
    revisionId: revision?.id ?? "",
    rentAmount: 0,
    adjustmentAmount: 0,
    freightAmount: 0,
    vatAmount: 0,
    totalAmount: 0,
    paymentTermsDays: days,
    dueDate: due.toISOString().slice(0, 10),
    holidayDays: 0,
    lineCount: 0,
    closedBy: fx.accountant.id,
    closedAt: new Date(),
  });
}

async function open() {
  const result = await createAmendment(ctx.db, fx.sales, contractId, {
    today: TODAY,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** The D5 body with H1,7 (GG-K17) repriced, from a date. */
function repriced(
  price: number,
  effectiveFrom: string,
  extra: Partial<AmendmentBody> = {},
): AmendmentBody {
  return {
    ...d5Rental(fx),
    lines: [
      { itemId: fx.item("PK-KU"), quantity: "400" },
      { itemId: fx.item("GG-K17"), quantity: "0", price },
    ],
    effectiveFrom,
    reason: "Khách đổi giá theo thỏa thuận mới",
    ...extra,
  };
}

/** Draft → saved → sent → approved, returning the amendment. */
async function approvedAmendment(price: number, effectiveFrom: string) {
  const draft = await open();
  const saved = await updateAmendment(
    ctx.db,
    fx.sales,
    contractId,
    draft.number,
    { ...repriced(price, effectiveFrom), updatedAt: draft.updatedAt },
  );
  if (!saved.ok) throw new Error(saved.error);
  const sent = await submitAmendment(
    ctx.db,
    fx.sales,
    contractId,
    draft.number,
  );
  if (!sent.ok) throw new Error(sent.error);
  const done = await approveAmendment(
    ctx.db,
    fx.director,
    contractId,
    draft.number,
    null,
  );
  if (!done.ok) throw new Error(done.error);
  return done.data;
}

const priceOn = async (date: string, code = "GG-K17") =>
  (await contractTermsAt(ctx.db, contractId, date))?.lines.find(
    (line) => line.itemId === fx.item(code),
  )?.price;

describe("createAmendment", () => {
  it("numbers /01 and copies the approved terms", async () => {
    const draft = await open();
    expect(draft).toMatchObject({
      code: "112026/ANPHAT-MINHPHAT/01",
      number: 1,
      status: "DRAFT",
    });
  });

  it("never reuses the number of a cancelled amendment", async () => {
    const first = await open();
    await cancelAmendment(
      ctx.db,
      fx.sales,
      contractId,
      first.number,
      "Lập nhầm",
    );
    expect((await open()).code).toBe("112026/ANPHAT-MINHPHAT/02");
  });

  it("makes one /01 when two are opened at the same time", async () => {
    const results = await Promise.all([
      createAmendment(ctx.db, fx.sales, contractId, { today: TODAY }),
      createAmendment(other.db, fx.director, contractId, { today: TODAY }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({
      error: CONTRACT_MESSAGES.amendOpen("01"),
    });
  });

  it("refuses a contract not approved yet", async () => {
    const draft = await createContract(ctx.db, fx.sales, {
      ...d5Rental(fx),
      startDate: "2026-12-01",
    });
    if (!draft.ok) throw new Error(draft.error);
    await submitContract(ctx.db, fx.sales, draft.data.id);
    expect(
      await createAmendment(ctx.db, fx.sales, draft.data.id, { today: TODAY }),
    ).toEqual({
      ok: false,
      status: 409,
      error: CONTRACT_MESSAGES.amendNotApproved,
    });
  });
});

describe("no direct edit after approval (0.2 #16)", () => {
  it("refuses to edit the approved contract itself", async () => {
    const result = await updateContract(ctx.db, fx.sales, contractId, {
      ...d5Rental(fx),
      updatedAt: new Date().toISOString(),
    });
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("keeps the old price while the amendment waits", async () => {
    const draft = await open();
    await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
      ...repriced(1400, "2026-12-15"),
      updatedAt: draft.updatedAt,
    });
    await submitAmendment(ctx.db, fx.sales, contractId, draft.number);
    expect(await priceOn("2026-12-20")).toBe(1200);
    expect(
      await approveAmendment(ctx.db, fx.sales, contractId, draft.number, null),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses to edit an approved amendment", async () => {
    const done = await approvedAmendment(1400, "2026-12-15");
    expect(
      await updateAmendment(ctx.db, fx.sales, contractId, done.number, {
        ...repriced(1500, "2026-12-15"),
        updatedAt: done.updatedAt,
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: CONTRACT_MESSAGES.amendApproved,
    });
  });
});

describe("what an amendment may change", () => {
  it("refuses a new customer", async () => {
    const draft = await open();
    expect(
      await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
        ...repriced(1400, "2026-12-15"),
        customerId: fx.customer("NT-0002"),
        updatedAt: draft.updatedAt,
      }),
    ).toEqual({ ok: false, status: 409, error: REVISION_MESSAGES.fixed });
  });

  it("refuses a new start date with the same sentence", async () => {
    const draft = await open();
    expect(
      await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
        ...repriced(1400, "2026-12-15"),
        startDate: "2026-11-05",
        updatedAt: draft.updatedAt,
      }),
    ).toEqual({ ok: false, status: 409, error: REVISION_MESSAGES.fixed });
  });

  it("refuses a new end before the effective date", async () => {
    const draft = await open();
    expect(
      await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
        ...repriced(1400, "2026-12-15"),
        endDate: "2026-12-10",
        updatedAt: draft.updatedAt,
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: REVISION_MESSAGES.endBeforeEffective("2026-12-15"),
    });
  });

  it("refuses to send a copy without changes", async () => {
    const draft = await open();
    await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
      ...d5Rental(fx),
      effectiveFrom: "2026-12-15",
      reason: "Thử",
      updatedAt: draft.updatedAt,
    });
    expect(
      await submitAmendment(ctx.db, fx.sales, contractId, draft.number),
    ).toEqual({ ok: false, status: 409, error: REVISION_MESSAGES.noChange });
  });
});

describe("effective date and closed periods (0.2 #22)", () => {
  it("reads no closed period before any is closed", async () => {
    expect(await lastClosedPeriodEnd(ctx.db, contractId)).toBeNull();
  });

  it("refuses the last day of a closed period, takes the next day", async () => {
    await closePeriodUntil("2026-11-30");
    expect(await lastClosedPeriodEnd(ctx.db, contractId)).toBe("2026-11-30");
    const draft = await open();
    expect(
      await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
        ...repriced(1400, "2026-11-30"),
        updatedAt: draft.updatedAt,
      }),
    ).toMatchObject({
      ok: false,
      status: 422,
      field: "effectiveFrom",
      error: REVISION_MESSAGES.closedPeriod("2026-11-30"),
    });
    expect(
      (
        await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
          ...repriced(1400, "2026-12-01"),
          updatedAt: draft.updatedAt,
        })
      ).ok,
    ).toBe(true);
  });

  it("refuses the approval when a period closed while it waited", async () => {
    const draft = await open();
    await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
      ...repriced(1400, "2026-12-15"),
      updatedAt: draft.updatedAt,
    });
    await submitAmendment(ctx.db, fx.sales, contractId, draft.number);
    await closePeriodUntil("2026-12-31");
    expect(
      await approveAmendment(
        ctx.db,
        fx.director,
        contractId,
        draft.number,
        null,
      ),
    ).toMatchObject({
      ok: false,
      error: REVISION_MESSAGES.closedPeriod("2026-12-31"),
    });
    const [row] = await ctx.db
      .select({ status: contractRevision.status })
      .from(contractRevision)
      .where(eq(contractRevision.id, draft.id));
    expect(row?.status).toBe("PENDING");
  });
});

describe("amendments of a cancelled contract", () => {
  it("refuses every command and logs nothing", async () => {
    const draft = await open();
    await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
      ...repriced(1400, "2026-12-15"),
      updatedAt: draft.updatedAt,
    });
    await cancelContract(ctx.db, fx.director, contractId, "Khách đổi ý");
    const before = (await activityRows(ctx.db)).length;
    expect(
      await submitAmendment(ctx.db, fx.sales, contractId, draft.number),
    ).toMatchObject({
      ok: false,
      error: "Hợp đồng đã hủy nên không gửi duyệt phụ lục được.",
    });
    expect(
      await approveAmendment(
        ctx.db,
        fx.director,
        contractId,
        draft.number,
        null,
      ),
    ).toMatchObject({
      ok: false,
      error: "Hợp đồng đã hủy nên không duyệt phụ lục được.",
    });
    expect(
      await returnAmendment(ctx.db, fx.director, contractId, draft.number, "x"),
    ).toMatchObject({ ok: false });
    expect(await activityRows(ctx.db)).toHaveLength(before);
  });
});

describe("contractTermsAt (tasks 5.3)", () => {
  it("answers the old price before and the new one from the effective date", async () => {
    await approvedAmendment(1400, "2026-12-15");
    expect(await priceOn("2026-12-14")).toBe(1200);
    expect(await priceOn("2026-12-15")).toBe(1400);
    expect(
      (await contractTermsAt(ctx.db, contractId, "2026-12-15"))?.revisionCode,
    ).toBe("112026/ANPHAT-MINHPHAT/01");
  });

  it("follows two amendments", async () => {
    await approvedAmendment(1400, "2026-12-15");
    await approvedAmendment(1300, "2027-02-01");
    expect(await priceOn("2027-01-10")).toBe(1400);
    expect(await priceOn("2027-02-01")).toBe(1300);
  });

  it("lets the later of two amendments on the same day win", async () => {
    await approvedAmendment(1400, "2026-12-15");
    await approvedAmendment(1350, "2026-12-15");
    expect(await priceOn("2026-12-15")).toBe(1350);
  });

  it("logs the approval with the day's rent before and after", async () => {
    const done = await approvedAmendment(1400, "2026-12-15");
    expect((await activityRows(ctx.db, done.code)).at(-1)).toMatchObject({
      action: "APPROVE",
      summary:
        "Hiệu lực 15/12/2026 · tiền thuê 1 ngày 1.330.000 ₫ → 1.450.000 ₫",
    });
  });
});

describe("returning, cancelling and edge cases", () => {
  it("returns a pending amendment with its reason, and refuses no reason", async () => {
    const draft = await open();
    await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
      ...repriced(1400, "2026-12-15"),
      updatedAt: draft.updatedAt,
    });
    await submitAmendment(ctx.db, fx.sales, contractId, draft.number);
    expect(
      await returnAmendment(ctx.db, fx.director, contractId, draft.number, ""),
    ).toMatchObject({ ok: false, error: CONTRACT_MESSAGES.returnReason });
    expect(
      await returnAmendment(
        ctx.db,
        fx.director,
        contractId,
        draft.number,
        "Giá chéo cao quá",
      ),
    ).toMatchObject({ ok: true, data: { status: "DRAFT" } });
    expect(
      await returnAmendment(ctx.db, fx.sales, contractId, draft.number, "x"),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("cancels a pending amendment and frees the contract for another", async () => {
    const draft = await open();
    expect(
      await cancelAmendment(ctx.db, fx.sales, contractId, draft.number, ""),
    ).toMatchObject({ ok: false, error: CONTRACT_MESSAGES.cancelReason });
    expect(
      await cancelAmendment(
        ctx.db,
        fx.sales,
        contractId,
        draft.number,
        "Lập nhầm",
      ),
    ).toMatchObject({ ok: true, data: { status: "CANCELLED" } });
    expect(
      await cancelAmendment(ctx.db, fx.sales, contractId, draft.number, "Lại"),
    ).toMatchObject({ ok: false, error: CONTRACT_MESSAGES.amendCancelled });
  });

  it("answers 409 to a stale edit and 422 to a malformed date", async () => {
    const draft = await open();
    expect(
      await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
        ...repriced(1400, "2026-12-15"),
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({ ok: false, status: 409, error: CONTRACT_MESSAGES.stale });
    expect(
      await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
        ...repriced(1400, "15/12/2026"),
        updatedAt: draft.updatedAt,
      }),
    ).toMatchObject({ ok: false, status: 422, field: "effectiveFrom" });
  });

  it("refuses to send an amendment without a reason", async () => {
    const draft = await open();
    await updateAmendment(ctx.db, fx.sales, contractId, draft.number, {
      ...repriced(1400, "2026-12-15", { reason: null }),
      updatedAt: draft.updatedAt,
    });
    expect(
      await submitAmendment(ctx.db, fx.sales, contractId, draft.number),
    ).toMatchObject({ ok: false, error: CONTRACT_MESSAGES.amendReason });
  });

  it("answers 404 for the original revision and a missing number", async () => {
    expect(
      await submitAmendment(ctx.db, fx.sales, contractId, 0),
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      await submitAmendment(ctx.db, fx.sales, contractId, 7),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("amends a sale and logs its total before and after", async () => {
    const { kgSale } = await import("@/test/contracts");
    const sale = await createContract(ctx.db, fx.sales, kgSale(fx));
    if (!sale.ok) throw new Error(sale.error);
    await submitContract(ctx.db, fx.sales, sale.data.id);
    await approveContract(ctx.db, fx.director, sale.data.id, null);
    const draft = await createAmendment(ctx.db, fx.sales, sale.data.id, {
      today: TODAY,
    });
    if (!draft.ok) throw new Error(draft.error);
    await updateAmendment(ctx.db, fx.sales, sale.data.id, 1, {
      ...kgSale(fx),
      lines: [
        {
          itemId: fx.item("GG-K17"),
          condition: "GOOD",
          pricingUnit: "KG",
          quantity: "1250,5",
          price: 15_000,
        },
      ],
      effectiveFrom: "2026-11-05",
      reason: "Giá thép tăng",
      updatedAt: draft.data.updatedAt,
    });
    await submitAmendment(ctx.db, fx.sales, sale.data.id, 1);
    const done = await approveAmendment(
      ctx.db,
      fx.director,
      sale.data.id,
      1,
      null,
    );
    if (!done.ok) throw new Error(done.error);
    expect((await activityRows(ctx.db, done.data.code)).at(-1)?.summary).toBe(
      "Hiệu lực 05/11/2026 · tổng tiền 17.507.000 ₫ → 18.757.500 ₫",
    );
  });
});

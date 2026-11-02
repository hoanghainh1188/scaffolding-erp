// Reading contracts for D5, D5a, D5b (contracts tasks 7.3, 7.4, 6.2).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { companyProfile } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { createTestContext } from "@/test/auth";
import {
  d5Rental,
  kgSale,
  setupContractFixture,
  type ContractFixture,
} from "@/test/contracts";

import {
  approveAmendment,
  createAmendment,
  submitAmendment,
  updateAmendment,
} from "./amendments";
import { approveContract, submitContract } from "./approval";
import {
  codePreview,
  formOptions,
  getAmendmentDetail,
  getContractDetail,
  termsFor,
} from "./queries";
import { createContract } from "./service";

const ctx = createTestContext();
afterAll(ctx.close);

const TODAY = "2026-11-05" as BusinessDate;

let fx: ContractFixture;
let id = "";
beforeEach(async () => {
  fx = await setupContractFixture(ctx);
  const saved = await createContract(ctx.db, fx.sales, d5Rental(fx));
  if (!saved.ok) throw new Error(saved.error);
  id = saved.data.id;
});

async function approve() {
  await submitContract(ctx.db, fx.sales, id);
  await approveContract(ctx.db, fx.director, id, null);
}

async function approvedAmendment() {
  const draft = await createAmendment(ctx.db, fx.sales, id, { today: TODAY });
  if (!draft.ok) throw new Error(draft.error);
  await updateAmendment(ctx.db, fx.sales, id, 1, {
    ...d5Rental(fx),
    lines: [
      { itemId: fx.item("PK-KU"), quantity: "400" },
      { itemId: fx.item("GG-CH"), quantity: "0", price: 400 },
    ],
    effectiveFrom: "2026-12-15",
    reason: "Đổi giá chéo",
    updatedAt: draft.data.updatedAt,
  });
  return draft.data;
}

describe("getContractDetail", () => {
  it("shows the draft with its figures and what the seller may do", async () => {
    const result = await getContractDetail(ctx.db, fx.sales, id, TODAY);
    if (!result.ok) throw new Error(result.error);
    const { head, shown, can, checks } = result.data;
    expect(head).toMatchObject({
      code: "112026/ANPHAT-MINHPHAT",
      type: "RENTAL",
      status: "DRAFT",
      site: { name: "Trường THCS Dương Nội" },
    });
    expect(shown.kits[0]).toMatchObject({ code: "BO-17", quantity: 300 });
    expect(
      shown.kits[0]?.components
        .map((part) => `${part.code}×${part.quantity}`)
        .sort(),
    ).toEqual(["GG-CH×2", "GG-K17×2", "GG-M16×1"]);
    expect(shown.lines.map((line) => line.code)).toEqual([
      "GG-CH",
      "GG-K17",
      "GG-M16",
      "PK-KU",
    ]);
    expect(shown.dayRent).toBe(1_330_000);
    expect(shown.months.map((month) => month.amount)).toEqual([
      39_900_000, 41_230_000,
    ]);
    expect(shown.value).toBe(186_200_000);
    expect(shown.expectedDays).toEqual({ days: 140, minimumApplied: false });
    expect(shown.batches[1]?.lines.map((line) => line.code)).toEqual([
      "BO-17",
      "PK-KU",
    ]);
    expect(can).toEqual({
      edit: true,
      approve: false,
      amend: false,
      cancel: true,
    });
    expect(checks.overdue).toEqual({ amount: 0, days: 0 });
  });

  it("offers the director the approval once sent", async () => {
    await submitContract(ctx.db, fx.sales, id);
    const result = await getContractDetail(ctx.db, fx.director, id, TODAY);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.can).toEqual({
      edit: false,
      approve: true,
      amend: false,
      cancel: false,
    });
    expect(result.data.shown.submitted?.name).toBe("Quốc Bảo");
  });

  it("shows the latest approved revision and the open amendment", async () => {
    await approve();
    await approvedAmendment();
    let result = await getContractDetail(ctx.db, fx.sales, id, TODAY);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.openAmendment?.number).toBe(1);
    expect(result.data.can.amend).toBe(false);
    await submitAmendment(ctx.db, fx.sales, id, 1);
    await approveAmendment(ctx.db, fx.director, id, 1, null);
    result = await getContractDetail(ctx.db, fx.sales, id, TODAY);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.shown.code).toBe("112026/ANPHAT-MINHPHAT/01");
    expect(result.data.shown.approved?.name).toBe("Minh Anh");
    expect(result.data.can).toMatchObject({ amend: true, edit: false });
  });

  it("shows a sale with its total and no months", async () => {
    const sale = await createContract(ctx.db, fx.sales, kgSale(fx));
    if (!sale.ok) throw new Error(sale.error);
    const result = await getContractDetail(
      ctx.db,
      fx.accountant,
      sale.data.id,
      TODAY,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.data.shown).toMatchObject({
      value: 17_507_000,
      months: [],
      expectedDays: null,
    });
    expect(result.data.head.site).toBeNull();
    expect(result.data.can).toEqual({
      edit: false,
      approve: false,
      amend: false,
      cancel: false,
    });
  });

  it("answers 404 and 403", async () => {
    expect(
      await getContractDetail(ctx.db, fx.sales, "nope", TODAY),
    ).toMatchObject({ status: 404 });
    expect(
      await getContractDetail(
        ctx.db,
        fx.sales,
        "00000000-0000-4000-8000-000000000000",
        TODAY,
      ),
    ).toMatchObject({ status: 404 });
    const saleOnly = await fx.seller("thuyvy", "SALE");
    expect(await getContractDetail(ctx.db, saleOnly, id, TODAY)).toMatchObject({
      status: 403,
    });
  });
});

describe("getAmendmentDetail", () => {
  it("shows the change, the copy it changes and the billing impact", async () => {
    await approve();
    await approvedAmendment();
    const result = await getAmendmentDetail(ctx.db, fx.sales, id, 1);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.base.dayRent).toBe(1_330_000);
    expect(result.data.amendment.dayRent).toBe(1_390_000);
    expect(result.data.changes.map((change) => change.label)).toEqual([
      "Giá GG-CH",
    ]);
    expect(result.data.impact).toEqual({
      lastClosedEnd: null,
      oldPriceFrom: "2026-11-01",
      oldPriceTo: "2026-12-14",
      newPriceFrom: "2026-12-15",
    });
    expect(result.data.can).toMatchObject({
      edit: true,
      approve: false,
      cancel: true,
    });
  });

  it("answers 404 for the original, a missing number and a bad id, 403 out of scope", async () => {
    await approve();
    await approvedAmendment();
    expect(await getAmendmentDetail(ctx.db, fx.sales, id, 0)).toMatchObject({
      status: 404,
    });
    expect(await getAmendmentDetail(ctx.db, fx.sales, id, 9)).toMatchObject({
      status: 404,
    });
    expect(await getAmendmentDetail(ctx.db, fx.sales, "x", 1)).toMatchObject({
      status: 404,
    });
    const saleOnly = await fx.seller("thuyvy", "SALE");
    expect(await getAmendmentDetail(ctx.db, saleOnly, id, 1)).toMatchObject({
      status: 403,
    });
  });
});

describe("small reads", () => {
  it("lists the form options with the types the user may draft", async () => {
    const options = await formOptions(ctx.db, fx.sales);
    expect(options.types).toEqual(["RENTAL", "SALE"]);
    expect(
      options.kits.find((entry) => entry.code === "BO-17")?.components,
    ).toHaveLength(3);
    expect(options.customers.length).toBeGreaterThan(0);
    expect((await formOptions(ctx.db, fx.accountant)).types).toEqual([]);
  });

  it("answers the terms on a day, and refuses a bad date or scope", async () => {
    await approve();
    const terms = await termsFor(ctx.db, fx.accountant, id, "2026-12-01");
    expect(terms).toMatchObject({
      ok: true,
      data: { revisionNumber: 0, minRentalDays: 45 },
    });
    expect(
      await termsFor(ctx.db, fx.accountant, id, "01/12/2026"),
    ).toMatchObject({ status: 400 });
    expect(
      await termsFor(ctx.db, fx.accountant, "x", "2026-12-01"),
    ).toMatchObject({ status: 404 });
    const saleOnly = await fx.seller("thuyvy", "SALE");
    expect(await termsFor(ctx.db, saleOnly, id, "2026-12-01")).toMatchObject({
      status: 403,
    });
  });

  it("previews a number, refusing what cannot be numbered", async () => {
    const input = {
      customerId: fx.customer("NT-0001"),
      startDate: "2026-11-20",
      customerToken: "Minh Phát",
    };
    expect(await codePreview(ctx.db, fx.sales, input)).toEqual({
      ok: true,
      data: { code: "112026/ANPHAT-MINHPHAT-2", customerToken: "MINHPHAT" },
    });
    expect(await codePreview(ctx.db, fx.accountant, input)).toMatchObject({
      status: 403,
    });
    expect(
      await codePreview(ctx.db, fx.sales, { ...input, customerId: "x" }),
    ).toMatchObject({ status: 404 });
    expect(
      await codePreview(ctx.db, fx.sales, { ...input, startDate: "x" }),
    ).toMatchObject({ status: 400 });
    expect(
      await codePreview(ctx.db, fx.sales, { ...input, customerToken: "---" }),
    ).toMatchObject({
      status: 422,
      field: "customerToken",
    });
    await ctx.db
      .update(companyProfile)
      .set({ shortName: null })
      .where(eq(companyProfile.id, 1));
    expect(await codePreview(ctx.db, fx.sales, input)).toMatchObject({
      status: 409,
    });
  });
});

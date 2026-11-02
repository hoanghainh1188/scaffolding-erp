// Drafting contracts (contracts spec; tasks 4.2).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { contractRevision, customer, item, user } from "@/db/schema";
import { CONTRACT_MESSAGES } from "@/domain/contract";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import {
  d5Rental,
  kgSale,
  setupContractFixture,
  type ContractFixture,
} from "@/test/contracts";

import { approveContract, submitContract } from "./approval";
import { readContent } from "./content";
import { readRevisions } from "./records";
import { createContract, PARTY_MESSAGES, updateContract } from "./service";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ContractFixture;
beforeEach(async () => {
  fx = await setupContractFixture(ctx);
});

async function create(body = d5Rental(fx), actor = fx.sales) {
  const result = await createContract(ctx.db, actor, body);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function contentOf(contractId: string, number = 0) {
  const revision = (await readRevisions(ctx.db, contractId)).find(
    (row) => row.number === number,
  );
  if (!revision) throw new Error("no revision");
  return { revision, content: await readContent(ctx.db, revision.id) };
}

const lineOf = (
  content: Awaited<ReturnType<typeof contentOf>>["content"],
  id: string,
) => content.lines.find((line) => line.itemId === id);

describe("createContract", () => {
  it("splits the kit, copies catalog prices and compensation", async () => {
    const saved = await create();
    const { revision, content } = await contentOf(saved.id);
    expect(revision).toMatchObject({
      status: "DRAFT",
      minRentalDays: 45,
      paymentTermsDays: 30,
      effectiveFrom: "2026-11-01",
    });
    expect(lineOf(content, fx.item("GG-K17"))).toMatchObject({
      quantity: "600.000",
      ownQuantity: "0.000",
      price: 1200,
      catalogPrice: 1200,
    });
    expect(lineOf(content, fx.item("GG-M16"))?.quantity).toBe("300.000");
    expect(
      content.compensations.find((entry) => entry.itemId === fx.item("GG-K17")),
    ).toMatchObject({ lostPrice: 350_000, damagePrice: 60_000 });
    expect(content.deposits).toHaveLength(2);
    expect(content.batches.map((batch) => batch.plannedDate)).toEqual([
      "2026-11-01",
      "2026-11-15",
    ]);
  });

  it("copies the seller of the customer and logs the creation", async () => {
    const [seller] = await ctx.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.username, "quocbao"));
    await ctx.db
      .update(customer)
      .set({ salesUserId: seller?.id })
      .where(eq(customer.id, fx.customer("NT-0001")));
    const saved = await create(d5Rental(fx), fx.director);
    const { contract: row } = await import("@/db/schema").then(async (s) => ({
      contract: (
        await ctx.db
          .select({ salesUserId: s.contract.salesUserId })
          .from(s.contract)
          .where(eq(s.contract.id, saved.id))
      )[0],
    }));
    expect(row?.salesUserId).toBe(seller?.id ?? "missing");
    const rows = await activityRows(ctx.db, saved.code);
    expect(rows.map((entry) => [entry.action, entry.summary])).toEqual([
      [
        "CREATE",
        "Cho thuê · Cty TNHH Xây dựng Minh Phát · Trường THCS Dương Nội · 4 mã hàng · 186.200.000 ₫",
      ],
    ]);
  });

  it("refuses a site of another customer", async () => {
    expect(
      await createContract(ctx.db, fx.sales, {
        ...d5Rental(fx),
        customerId: fx.customer("NT-0002"),
      }),
    ).toMatchObject({
      ok: false,
      status: 422,
      field: "siteId",
      error: PARTY_MESSAGES.siteOfOther(
        "CT-0002",
        "Anh Trần Văn Hùng (cai thầu)",
      ),
    });
  });

  it("refuses a rental without a site, takes a sale without one", async () => {
    expect(
      await createContract(ctx.db, fx.sales, { ...d5Rental(fx), siteId: null }),
    ).toMatchObject({
      ok: false,
      error: "Hợp đồng cho thuê cần một công trình.",
    });
    const sale = await create(kgSale(fx));
    expect(sale.code).toBe("102026/ANPHAT-PDLONG");
  });

  it("refuses a line of 0 pieces", async () => {
    expect(
      await createContract(ctx.db, fx.sales, {
        ...d5Rental(fx),
        kits: [],
        lines: [{ itemId: fx.item("PK-KU"), quantity: "0" }],
        batches: [],
      }),
    ).toMatchObject({
      ok: false,
      error: "Số lượng phải lớn hơn 0. Bạn bỏ dòng nếu không thuê mã này.",
    });
  });

  it("refuses a seller without the rental scope", async () => {
    const saleOnly = await fx.seller("thuyvy", "SALE");
    const before = (await activityRows(ctx.db)).length;
    expect(await createContract(ctx.db, saleOnly, d5Rental(fx))).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await activityRows(ctx.db)).toHaveLength(before);
  });
});

describe("compensation copied from the company table (0.2 #49)", () => {
  it("keeps the copied price when the company table changes", async () => {
    const saved = await create();
    await ctx.db
      .update(item)
      .set({ lostPrice: 480_000 })
      .where(eq(item.id, fx.item("GG-K17")));
    const again = await updateContract(ctx.db, fx.sales, saved.id, {
      ...d5Rental(fx),
      updatedAt: saved.updatedAt,
    });
    expect(again.ok).toBe(true);
    const { content } = await contentOf(saved.id);
    expect(
      content.compensations.find((entry) => entry.itemId === fx.item("GG-K17")),
    ).toMatchObject({ lostPrice: 350_000, catalogLostPrice: 350_000 });
  });

  it("takes the current table again on Lấy lại bảng chung", async () => {
    const saved = await create();
    await ctx.db
      .update(item)
      .set({ lostPrice: 480_000 })
      .where(eq(item.id, fx.item("GG-K17")));
    await updateContract(ctx.db, fx.sales, saved.id, {
      ...d5Rental(fx),
      refreshCompensation: true,
      updatedAt: saved.updatedAt,
    });
    const { content } = await contentOf(saved.id);
    expect(
      content.compensations.find((entry) => entry.itemId === fx.item("GG-K17")),
    ).toMatchObject({ lostPrice: 480_000, catalogLostPrice: 480_000 });
  });

  it("keeps a price typed for this contract next to the table value", async () => {
    const saved = await create();
    await updateContract(ctx.db, fx.sales, saved.id, {
      ...d5Rental(fx),
      compensations: [{ itemId: fx.item("GG-K17"), lostPrice: 500_000 }],
      updatedAt: saved.updatedAt,
    });
    const { content } = await contentOf(saved.id);
    expect(
      content.compensations.find((entry) => entry.itemId === fx.item("GG-K17")),
    ).toMatchObject({ lostPrice: 500_000, catalogLostPrice: 350_000 });
  });
});

describe("updateContract", () => {
  it("refuses a new customer or type on a numbered draft", async () => {
    const saved = await create();
    const before = await activityRows(ctx.db);
    expect(
      await updateContract(ctx.db, fx.sales, saved.id, {
        ...d5Rental(fx),
        customerId: fx.customer("NT-0002"),
        updatedAt: saved.updatedAt,
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: PARTY_MESSAGES.customerFixed("Cty TNHH Xây dựng Minh Phát"),
    });
    expect(
      await updateContract(ctx.db, fx.sales, saved.id, {
        ...d5Rental(fx),
        type: "SALE",
        updatedAt: saved.updatedAt,
      }),
    ).toEqual({ ok: false, status: 409, error: PARTY_MESSAGES.typeFixed });
    expect(await activityRows(ctx.db)).toEqual(before);
  });

  it("moves a draft to another site of the same customer", async () => {
    const saved = await create();
    const moved = await updateContract(ctx.db, fx.sales, saved.id, {
      ...d5Rental(fx),
      siteId: fx.site("Chung cư An Phú – Block B"),
      updatedAt: saved.updatedAt,
    });
    expect(moved).toMatchObject({ ok: true, data: { code: saved.code } });
  });

  it("answers 409 to a stale edit and keeps the first one", async () => {
    const saved = await create();
    const first = await updateContract(ctx.db, fx.director, saved.id, {
      ...d5Rental(fx),
      lines: [{ itemId: fx.item("PK-KU"), quantity: "400", price: 450 }],
      updatedAt: saved.updatedAt,
    });
    expect(first.ok).toBe(true);
    expect(
      await updateContract(ctx.db, fx.sales, saved.id, {
        ...d5Rental(fx),
        updatedAt: saved.updatedAt,
      }),
    ).toEqual({ ok: false, status: 409, error: CONTRACT_MESSAGES.stale });
    const { content } = await contentOf(saved.id);
    expect(lineOf(content, fx.item("PK-KU"))?.price).toBe(450);
  });

  it("logs the changed fields, nothing when nothing changed", async () => {
    const saved = await create();
    const same = await updateContract(ctx.db, fx.sales, saved.id, {
      ...d5Rental(fx),
      updatedAt: saved.updatedAt,
    });
    if (!same.ok) throw new Error(same.error);
    expect((await activityRows(ctx.db, saved.code)).length).toBe(1);
    await updateContract(ctx.db, fx.sales, saved.id, {
      ...d5Rental(fx),
      lines: [{ itemId: fx.item("PK-KU"), quantity: "400", price: 450 }],
      updatedAt: same.data.updatedAt,
    });
    const rows = await activityRows(ctx.db, saved.code);
    expect(rows.at(-1)).toMatchObject({
      action: "UPDATE",
      summary: "Giá PK-KU: 400 ₫ → 450 ₫",
    });
  });

  it("refuses to edit an approved contract and keeps its prices", async () => {
    const saved = await create();
    await submitContract(ctx.db, fx.sales, saved.id);
    await approveContract(ctx.db, fx.director, saved.id, null);
    const [revision] = await ctx.db
      .select({ updatedAt: contractRevision.updatedAt })
      .from(contractRevision)
      .where(eq(contractRevision.contractId, saved.id));
    const { contract: rows } = await import("@/db/schema");
    const [row] = await ctx.db
      .select({ updatedAt: rows.updatedAt })
      .from(rows)
      .where(eq(rows.id, saved.id));
    expect(revision).toBeDefined();
    expect(
      await updateContract(ctx.db, fx.sales, saved.id, {
        ...d5Rental(fx),
        lines: [{ itemId: fx.item("PK-KU"), quantity: "400", price: 450 }],
        updatedAt: row?.updatedAt.toISOString(),
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: CONTRACT_MESSAGES.editApproved,
    });
    const { content } = await contentOf(saved.id);
    expect(lineOf(content, fx.item("PK-KU"))?.price).toBe(400);
  });
});

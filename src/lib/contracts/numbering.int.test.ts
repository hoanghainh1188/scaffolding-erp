// Contract numbers (contracts spec "Số hợp đồng tự sinh", "Số hợp đồng
// không trùng"; tasks 4.1).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { companyProfile, documentCounter } from "@/db/schema";
import { CODE_MESSAGES } from "@/domain/contract-code";
import { createTestContext } from "@/test/auth";
import {
  d5Rental,
  setupContractFixture,
  type ContractFixture,
} from "@/test/contracts";

import { cancelContract } from "./approval";
import { previewContractCode } from "./numbering";
import { createContract } from "./service";

const ctx = createTestContext();
// A second pool, so two transactions really run side by side.
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

let fx: ContractFixture;
beforeEach(async () => {
  fx = await setupContractFixture(ctx);
});

async function codeOf(body = d5Rental(fx), db = ctx.db) {
  const result = await createContract(db, fx.sales, body);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

describe("contract numbers", () => {
  it("builds MMYYYY/<company>-<customer> from the start date", async () => {
    expect((await codeOf()).code).toBe("112026/ANPHAT-MINHPHAT");
  });

  it("adds -2, and never reuses the number of a cancelled one", async () => {
    await codeOf();
    const second = await codeOf({ ...d5Rental(fx), startDate: "2026-11-15" });
    expect(second.code).toBe("112026/ANPHAT-MINHPHAT-2");
    await cancelContract(ctx.db, fx.sales, second.id, "Khách thuê chỗ khác");
    expect((await codeOf()).code).toBe("112026/ANPHAT-MINHPHAT-3");
  });

  it("gives two contracts saved at once two numbers", async () => {
    const [a, b] = await Promise.all([
      codeOf(d5Rental(fx), ctx.db),
      codeOf(d5Rental(fx), other.db),
    ]);
    expect([a.code, b.code].sort()).toEqual([
      "112026/ANPHAT-MINHPHAT",
      "112026/ANPHAT-MINHPHAT-2",
    ]);
  });

  it("defaults the customer part to the code, then to the last token", async () => {
    const body = { ...d5Rental(fx), customerToken: null };
    expect((await codeOf(body)).code).toBe("112026/ANPHAT-NT0001");
    expect(
      (await codeOf({ ...d5Rental(fx), customerToken: "MINHPHAT" })).code,
    ).toBe("112026/ANPHAT-MINHPHAT");
    expect((await codeOf({ ...body, startDate: "2026-12-01" })).code).toBe(
      "122026/ANPHAT-MINHPHAT",
    );
  });

  it("keeps the number when the start date moves", async () => {
    const saved = await codeOf();
    const { updateContract } = await import("./service");
    const moved = await updateContract(ctx.db, fx.sales, saved.id, {
      ...d5Rental(fx),
      startDate: "2026-12-05",
      updatedAt: saved.updatedAt,
    });
    expect(moved).toMatchObject({
      ok: true,
      data: { code: "112026/ANPHAT-MINHPHAT" },
    });
  });

  it("refuses to number a contract without a company short name", async () => {
    await ctx.db
      .update(companyProfile)
      .set({ shortName: null })
      .where(eq(companyProfile.id, 1));
    expect(await createContract(ctx.db, fx.sales, d5Rental(fx))).toEqual({
      ok: false,
      status: 409,
      error: CODE_MESSAGES.noCompanyShort,
    });
    expect(await ctx.db.select().from(documentCounter)).toEqual([]);
  });

  it("previews the next number without taking it", async () => {
    await codeOf();
    expect(
      await previewContractCode(ctx.db, "ANPHAT", "MINHPHAT", "2026-11-01"),
    ).toBe("112026/ANPHAT-MINHPHAT-2");
    const [row] = await ctx.db.select().from(documentCounter);
    expect(row?.lastNumber).toBe(1);
  });
});

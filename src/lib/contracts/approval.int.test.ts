// Sending, approving, returning and cancelling (contracts spec "Chỉ Giám
// đốc duyệt hợp đồng", "Duyệt khi nhà thầu nợ quá hạn", "Trạng thái hợp
// đồng"; tasks 4.3). The overdue debt comes from a placeholder until
// receivables; here it is mocked to 96.000.000 ₫ (7 ngày).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "@/db/client";
import { contract, contractRevision } from "@/db/schema";
import { CONTRACT_MESSAGES } from "@/domain/contract";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import {
  d5Rental,
  setupContractFixture,
  type ContractFixture,
} from "@/test/contracts";

import {
  approveContract,
  cancelContract,
  returnContract,
  submitContract,
} from "./approval";
import { createAmendment } from "./amendments";
import { createContract } from "./service";

const debt = vi.hoisted(() => ({ amount: 0, days: 0 }));
vi.mock("./overdue", () => ({
  overdueDebt: async () => ({ amount: debt.amount, days: debt.days }),
}));

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

let fx: ContractFixture;
beforeEach(async () => {
  fx = await setupContractFixture(ctx);
  debt.amount = 0;
  debt.days = 0;
});

async function pending(body = d5Rental(fx)) {
  const saved = await createContract(ctx.db, fx.sales, body);
  if (!saved.ok) throw new Error(saved.error);
  const sent = await submitContract(ctx.db, fx.sales, saved.data.id);
  if (!sent.ok) throw new Error(sent.error);
  return saved.data;
}

async function statusOf(id: string) {
  const [row] = await ctx.db
    .select({ status: contract.status })
    .from(contract)
    .where(eq(contract.id, id));
  return row?.status;
}

const contractRows = async (code: string) =>
  (await activityRows(ctx.db, code)).map((row) => row.action);

describe("submitContract", () => {
  it("sends a complete draft", async () => {
    const saved = await pending();
    expect(await statusOf(saved.id)).toBe("PENDING");
    expect(await contractRows(saved.code)).toEqual(["CREATE", "SUBMIT"]);
  });

  it("refuses a draft missing a compensation price, logging nothing", async () => {
    const saved = await createContract(ctx.db, fx.sales, {
      ...d5Rental(fx),
      compensations: [{ itemId: fx.item("PK-KU"), lostPrice: null }],
    });
    if (!saved.ok) throw new Error(saved.error);
    expect(await submitContract(ctx.db, fx.sales, saved.data.id)).toEqual({
      ok: false,
      status: 409,
      error: CONTRACT_MESSAGES.noCompensation("PK-KU"),
    });
    expect(await statusOf(saved.data.id)).toBe("DRAFT");
    expect(await contractRows(saved.data.code)).toEqual(["CREATE"]);
  });
});

describe("approveContract", () => {
  it("lets only the director approve", async () => {
    const saved = await pending();
    expect(
      await approveContract(ctx.db, fx.sales, saved.id, null),
    ).toMatchObject({ ok: false, status: 403 });
    expect(await statusOf(saved.id)).toBe("PENDING");
  });

  it("approves without a reason when nothing is overdue", async () => {
    const saved = await pending();
    expect(
      await approveContract(ctx.db, fx.director, saved.id, null),
    ).toMatchObject({ ok: true, data: { status: "APPROVED" } });
    const [revision] = await ctx.db
      .select()
      .from(contractRevision)
      .where(eq(contractRevision.contractId, saved.id));
    expect(revision).toMatchObject({
      status: "APPROVED",
      approvedBy: fx.director.id,
      approvalReason: null,
      overdueAmount: null,
    });
  });

  it("requires a reason while the customer is overdue", async () => {
    debt.amount = 96_000_000;
    debt.days = 7;
    const saved = await pending();
    expect(await approveContract(ctx.db, fx.director, saved.id, "  ")).toEqual({
      ok: false,
      status: 409,
      error: CONTRACT_MESSAGES.overdue(96_000_000, 7),
    });
    expect(await statusOf(saved.id)).toBe("PENDING");
    expect(await contractRows(saved.code)).toEqual(["CREATE", "SUBMIT"]);
  });

  it("keeps the reason and the debt with the approval, flagged", async () => {
    debt.amount = 96_000_000;
    debt.days = 7;
    const saved = await pending();
    const reason = "Minh Phát hẹn trả 96 triệu trước 05/11, đã gọi xác nhận.";
    expect(
      (await approveContract(ctx.db, fx.director, saved.id, reason)).ok,
    ).toBe(true);
    const [revision] = await ctx.db
      .select()
      .from(contractRevision)
      .where(eq(contractRevision.contractId, saved.id));
    expect(revision).toMatchObject({
      approvalReason: reason,
      overdueAmount: 96_000_000,
      overdueDays: 7,
    });
    const row = (await activityRows(ctx.db, saved.code)).at(-1);
    expect(row).toMatchObject({
      action: "APPROVE",
      summary: `Nhà thầu nợ quá hạn 96.000.000 ₫ (7 ngày) · lý do: ${reason}`,
    });
    expect(row?.flags).toContain("ANOMALY");
  });

  it("approves once when two approvals run at the same time", async () => {
    const saved = await pending();
    const results = await Promise.all([
      approveContract(ctx.db, fx.director, saved.id, null),
      approveContract(other.db, fx.director, saved.id, null),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({
      error: CONTRACT_MESSAGES.approvedAlready,
    });
    expect(
      (await contractRows(saved.code)).filter((action) => action === "APPROVE"),
    ).toHaveLength(1);
  });
});

describe("returnContract", () => {
  it("sends it back to draft with the reason", async () => {
    const saved = await pending();
    const reason = "Giá kích tăng U thấp quá, báo lại 450 ₫";
    expect(
      await returnContract(ctx.db, fx.director, saved.id, reason),
    ).toMatchObject({ ok: true, data: { status: "DRAFT" } });
    const [revision] = await ctx.db
      .select({ returnedReason: contractRevision.returnedReason })
      .from(contractRevision)
      .where(eq(contractRevision.contractId, saved.id));
    expect(revision?.returnedReason).toBe(reason);
    expect((await activityRows(ctx.db, saved.code)).at(-1)).toMatchObject({
      action: "RETURN",
      summary: reason,
    });
  });

  it("refuses to return without a reason", async () => {
    const saved = await pending();
    expect(await returnContract(ctx.db, fx.director, saved.id, "")).toEqual({
      ok: false,
      status: 409,
      error: CONTRACT_MESSAGES.returnReason,
    });
    expect(await statusOf(saved.id)).toBe("PENDING");
  });
});

describe("cancelContract", () => {
  it("cancels a draft and keeps its number", async () => {
    const saved = await createContract(ctx.db, fx.sales, d5Rental(fx));
    if (!saved.ok) throw new Error(saved.error);
    expect(
      await cancelContract(
        ctx.db,
        fx.sales,
        saved.data.id,
        "Khách thuê chỗ khác",
      ),
    ).toMatchObject({ ok: true, data: { status: "CANCELLED" } });
    expect(await cancelContract(ctx.db, fx.sales, saved.data.id, "x")).toEqual({
      ok: false,
      status: 409,
      error: CONTRACT_MESSAGES.ended,
    });
  });

  it("cancels the open amendment of an approved contract with it", async () => {
    const saved = await pending();
    await approveContract(ctx.db, fx.director, saved.id, null);
    const amendment = await createAmendment(ctx.db, fx.sales, saved.id, {
      today: "2026-11-05" as never,
    });
    if (!amendment.ok) throw new Error(amendment.error);
    expect(
      await cancelContract(ctx.db, fx.sales, saved.id, "Khách đổi ý"),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      await cancelContract(ctx.db, fx.director, saved.id, "Khách đổi ý"),
    ).toMatchObject({ ok: true, data: { status: "CANCELLED" } });
    const [row] = await ctx.db
      .select({
        status: contractRevision.status,
        reason: contractRevision.cancelledReason,
      })
      .from(contractRevision)
      .where(eq(contractRevision.id, amendment.data.id));
    expect(row).toEqual({ status: "CANCELLED", reason: "Hợp đồng đã hủy" });
    expect(
      (await activityRows(ctx.db, amendment.data.code)).map((entry) => [
        entry.action,
        entry.summary,
      ]),
    ).toEqual([
      ["CREATE", "Phụ lục 01 của 112026/ANPHAT-MINHPHAT"],
      ["CANCEL", "Hợp đồng đã hủy"],
    ]);
    expect((await activityRows(ctx.db, saved.code)).at(-1)?.action).toBe(
      "CANCEL",
    );
  });
});

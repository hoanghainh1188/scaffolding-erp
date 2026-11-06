// Documents waiting for approval by role (dashboard-basic task 3.3, 0.2
// #94): the director and the accountant see all five kinds, sales only the
// contracts of their scope and the rental notes; the greeting counts the
// same rows.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { location, stockAdjustment, stocktake } from "@/db/schema";
import { greeting } from "@/domain/dashboard";
import type { ContractUser } from "@/domain/permissions";
import { createBuyBack } from "@/lib/buy-backs/service";
import { submitContract } from "@/lib/contracts/approval";
import { createContract, type ContractBody } from "@/lib/contracts/service";
import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import { d5Rental, kgSale } from "@/test/contracts";
import {
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";
import { returnOf } from "@/test/returns";

import { pendingApprovals } from "./approvals";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ReceivableFixture;

async function submitted(body: ContractBody) {
  const saved = await createContract(ctx.db, fx.sales, body);
  if (!saved.ok) throw new Error(saved.error);
  const sent = await submitContract(ctx.db, fx.sales, saved.data.id);
  if (!sent.ok) throw new Error(sent.error);
  return saved.data;
}

beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
  await submitted(d5Rental(fx));
  await submitted(kgSale(fx));
  const lost = await returnOf(ctx, fx, { "GG-K17": [0, 0, 0, 1] });
  if (!lost.ok) throw new Error(lost.error);
  const bought = await createBuyBack(ctx.db, fx.sales, {
    contractId: fx.deal.id,
    reason: "Khách giữ lại 5 khung",
    lines: [{ itemId: fx.item("GG-K17"), quantity: "5", unitPrice: 300_000 }],
  });
  if (!bought.ok) throw new Error(bought.error);
  const admin = getAdminDatabase();
  const [yard] = await admin
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  await admin.insert(stocktake).values({
    code: "KK-2026-006",
    locationId: yard?.id ?? "",
    scopeAll: true,
    status: "SUBMITTED",
    clientStartId: randomUUID(),
    startedBy: fx.director.id,
    submittedBy: fx.director.id,
    submittedAt: new Date(),
  });
  await admin.insert(stockAdjustment).values({
    code: "ĐC-2026-009",
    kind: "ADJUSTMENT",
    status: "PENDING_APPROVAL",
    reason: "Sửa tình trạng 3 khung",
    createdBy: fx.accountant.id,
    submittedBy: fx.accountant.id,
    submittedAt: new Date(),
  });
});

const viewer = (
  role: ContractUser["role"],
  contractScope: ContractUser["contractScope"] = "ALL",
): ContractUser => ({ role, contractScope });

const kinds = async (user: ContractUser) =>
  (await pendingApprovals(ctx.db, user)).map((row) => row.kind).sort();

describe("pendingApprovals", () => {
  it("shows the director every kind, oldest sent first", async () => {
    const rows = await pendingApprovals(ctx.db, viewer("DIRECTOR"));
    expect(rows.map((row) => row.kind).sort()).toEqual([
      "BUY_BACK",
      "COMPENSATION",
      "CONTRACT",
      "CONTRACT",
      "STOCKTAKE",
      "STOCK_ADJUSTMENT",
    ]);
    const sent = rows.map((row) => row.sentAt.getTime());
    expect(sent).toEqual([...sent].sort((a, b) => a - b));
    expect(rows.find((row) => row.kind === "BUY_BACK")?.amount).toBe(1_500_000);
    const rental = rows.find((row) => row.label === "Hợp đồng thuê");
    expect(rental?.href).toMatch(/^\/sales\/contracts\/[0-9a-f-]{36}$/);
    expect(rows.find((row) => row.kind === "STOCKTAKE")?.href).toBe(
      "/inventory/stocktakes/KK-2026-006",
    );
  });

  it("shows the accountant the same five kinds", async () => {
    expect(await kinds(viewer("ACCOUNTANT"))).toEqual(
      await kinds(viewer("DIRECTOR")),
    );
  });

  it("limits sales to their scope and to rental notes", async () => {
    expect(await kinds(viewer("SALES"))).toEqual([
      "BUY_BACK",
      "COMPENSATION",
      "CONTRACT",
      "CONTRACT",
    ]);
    expect(await kinds(viewer("SALES", "RENTAL"))).toEqual([
      "BUY_BACK",
      "COMPENSATION",
      "CONTRACT",
    ]);
    const saleOnly = await pendingApprovals(ctx.db, viewer("SALES", "SALE"));
    expect(saleOnly.map((row) => row.label)).toEqual(["Hợp đồng bán"]);
  });

  it("counts in the greeting exactly the rows of the block", async () => {
    const rows = await pendingApprovals(ctx.db, viewer("ACCOUNTANT"));
    expect(greeting("Thu Hà", "ACCOUNTANT", rows.length)).toBe(
      "Chào Thu Hà, có 6 việc đang chờ Giám đốc duyệt",
    );
    const sales = await pendingApprovals(ctx.db, viewer("SALES", "SALE"));
    expect(greeting("Quốc Bảo", "SALES", sales.length)).toBe(
      "Chào Quốc Bảo, có 1 việc đang chờ Giám đốc duyệt",
    );
  });
});

// Risky sites (dashboard-basic task 3.7, 0.2 #92): each sign, the 30-day
// boundary by Vietnamese day, the end date, two contracts at one site, and
// what sales may see.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { riskLabel } from "@/domain/dashboard";
import type { ContractUser } from "@/domain/permissions";
import { createTestContext } from "@/test/auth";
import { d5Rental } from "@/test/contracts";
import { approvedContract } from "@/test/deliveries";
import {
  closedPeriod,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";
import { returnOf } from "@/test/returns";

import { riskySites } from "./risk";

const ctx = createTestContext();
afterAll(ctx.close);

const d = (value: string) => value as BusinessDate;
const DIRECTOR: ContractUser = { role: "DIRECTOR", contractScope: "ALL" };
let fx: ReceivableFixture;

beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
});

async function labels(today: string, viewer: ContractUser = DIRECTOR) {
  const sites = await riskySites(ctx.db, viewer, d(today));
  return sites.map((site) => [
    site.siteName,
    site.contracts.map((entry) => entry.signs.map(riskLabel)),
  ]);
}

describe("riskySites", () => {
  it("has no risk for a fresh contract", async () => {
    expect(await labels("2026-11-06")).toEqual([]);
  });

  it("marks overdue debt of the contract, by days only", async () => {
    await closedPeriod(ctx, fx, "2026-09", 1_000_000, { terms: 1 });
    expect(await labels("2026-11-06")).toEqual([
      ["Trường THCS Dương Nội", [["Nợ quá hạn 36 ngày"]]],
    ]);
    expect(await labels("2026-10-01")).toEqual([]);
  });

  it("keeps a loss for 30 days", async () => {
    // Return of 05/11/2026 with 3 GG-K17 lost.
    const lost = await returnOf(ctx, fx, { "GG-K17": [0, 0, 0, 3] });
    expect(lost.ok).toBe(true);
    expect(await labels("2026-12-05")).toEqual([
      ["Trường THCS Dương Nội", [["Mất 3 GG-K17 ngày 05/11"]]],
    ]);
    expect(await labels("2026-12-06")).toEqual([]);
  });

  it("marks goods still on site after the end date", async () => {
    // d5Rental ends 21/03/2027; 440 pieces are on site.
    expect(await labels("2027-03-21")).toEqual([]);
    expect(await labels("2027-03-22")).toEqual([
      ["Trường THCS Dương Nội", [["Hết hạn HĐ 21/03, còn 440 cái"]]],
    ]);
  });

  // A rental cannot be sent for approval without an end date, so "no end
  // date" is covered by isPastEnd in src/domain/dashboard.test.ts.

  it("groups two risky contracts of one site under one row", async () => {
    const second = await approvedContract(ctx, fx, {
      ...d5Rental(fx),
      signedDate: "2026-10-29",
    });
    await closedPeriod(ctx, fx, "2026-09", 1_000_000, { terms: 1 });
    await closedPeriod(ctx, fx, "2026-09", 500_000, {
      terms: 10,
      contractId: second.id,
    });
    const sites = await riskySites(ctx.db, DIRECTOR, d("2026-11-06"));
    expect(sites).toHaveLength(1);
    expect(
      sites[0]?.contracts.map((entry) => entry.signs.map(riskLabel)),
    ).toEqual([["Nợ quá hạn 36 ngày"], ["Nợ quá hạn 27 ngày"]]);
  });

  it("shows sales their scope, with no amount anywhere", async () => {
    await closedPeriod(ctx, fx, "2026-09", 12_400_000, { terms: 1 });
    const sales = await riskySites(
      ctx.db,
      { role: "SALES", contractScope: "ALL" },
      d("2026-11-06"),
    );
    expect(sales).toHaveLength(1);
    expect(JSON.stringify(sales)).not.toContain("12400000");
    expect(
      await riskySites(
        ctx.db,
        { role: "SALES", contractScope: "SALE" },
        d("2026-11-06"),
      ),
    ).toEqual([]);
  });
});

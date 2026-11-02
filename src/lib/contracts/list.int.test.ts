// D4 (contracts spec "Danh sách hợp đồng D4", "Quyền theo loại hợp đồng";
// tasks 4.5).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { createTestContext } from "@/test/auth";
import {
  d5Rental,
  kgSale,
  setupContractFixture,
  type ContractFixture,
} from "@/test/contracts";

import { approveContract, cancelContract, submitContract } from "./approval";
import { listContracts } from "./list";
import { createContract, type ContractBody } from "./service";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ContractFixture;
beforeEach(async () => {
  fx = await setupContractFixture(ctx);
});

async function make(body: ContractBody) {
  const saved = await createContract(ctx.db, fx.director, body);
  if (!saved.ok) throw new Error(saved.error);
  return saved.data;
}

const day = (value: string) => value as BusinessDate;

describe("listContracts", () => {
  it("puts each status in its tile", async () => {
    await make(d5Rental(fx)); // draft
    const sent = await make({ ...d5Rental(fx), startDate: "2026-11-02" });
    await submitContract(ctx.db, fx.director, sent.id);
    const approved = await make({ ...d5Rental(fx), startDate: "2026-11-03" });
    await submitContract(ctx.db, fx.director, approved.id);
    await approveContract(ctx.db, fx.director, approved.id, null);
    const dropped = await make({ ...d5Rental(fx), startDate: "2026-11-04" });
    await cancelContract(ctx.db, fx.director, dropped.id, "Khách đổi ý");
    const list = await listContracts(
      ctx.db,
      fx.director,
      {},
      day("2026-11-05"),
    );
    expect(list.counts).toEqual({ all: 4, pending: 1, active: 1, ended: 1 });
    const pending = await listContracts(
      ctx.db,
      fx.director,
      { group: "pending" },
      day("2026-11-05"),
    );
    expect(pending.rows.map((row) => row.code)).toEqual([sent.code]);
  });

  it("shows a rental-only seller no sale, not even in the counts", async () => {
    await make(d5Rental(fx));
    await make(kgSale(fx));
    const rentalOnly = await fx.seller("thuyvy", "RENTAL");
    const list = await listContracts(ctx.db, rentalOnly, {}, day("2026-11-05"));
    expect(list.rows.map((row) => row.type)).toEqual(["RENTAL"]);
    expect(list.counts.all).toBe(1);
    expect(list.types).toEqual(["RENTAL"]);
    expect(
      (
        await listContracts(
          ctx.db,
          rentalOnly,
          { type: "SALE" },
          day("2026-11-05"),
        )
      ).rows,
    ).toEqual([]);
  });

  it("finds a contract by part of its number", async () => {
    await make(d5Rental(fx));
    await make(kgSale(fx));
    const found = await listContracts(
      ctx.db,
      fx.director,
      { q: "minhphat" },
      day("2026-11-05"),
    );
    expect(found.rows.map((row) => row.code)).toEqual([
      "112026/ANPHAT-MINHPHAT",
    ]);
  });

  it("shows the expected value and the guarantee warning in force", async () => {
    const saved = await make(d5Rental(fx));
    await submitContract(ctx.db, fx.director, saved.id);
    await approveContract(ctx.db, fx.director, saved.id, null);
    const [row] = (
      await listContracts(ctx.db, fx.director, {}, day("2027-03-01"))
    ).rows;
    expect(row).toMatchObject({
      value: 186_200_000,
      startDate: "2026-11-01",
      endDate: "2027-03-21",
      warnings: ["Bảo lãnh BL-2026-1188 còn 30 ngày (hết hạn 31/03/2027)"],
    });
    expect(
      (await listContracts(ctx.db, fx.director, {}, day("2027-02-28"))).rows[0]
        ?.warnings,
    ).toEqual([]);
  });
});

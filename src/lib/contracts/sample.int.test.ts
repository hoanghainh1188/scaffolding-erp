// Sample contracts (contracts tasks 7.6).
import { afterAll, beforeEach, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { createTestContext } from "@/test/auth";
import { setupContractFixture, type ContractFixture } from "@/test/contracts";

import { listContracts } from "./list";
import { seedContracts } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ContractFixture;
beforeEach(async () => {
  fx = await setupContractFixture(ctx);
});

it("creates the three sample contracts once", async () => {
  const people = { director: fx.director, sales: fx.sales };
  expect(await seedContracts(ctx.db, people)).toBe(3);
  expect(await seedContracts(ctx.db, people)).toBe(0);
  const list = await listContracts(
    ctx.db,
    fx.director,
    {},
    "2026-11-02" as BusinessDate,
  );
  expect(list.counts).toEqual({ all: 3, pending: 1, active: 1, ended: 0 });
  const d5 = list.rows.find((row) => row.code === "112026/ANPHAT-MINHPHAT");
  expect(d5?.value).toBe(186_200_000);
});

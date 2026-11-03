// Sample transfer, buy-back and exchange (site-operations tasks 7.1).
import { afterAll, beforeEach, expect, it } from "vitest";

import { buyBackNote, deliveryExchange, siteTransfer } from "@/db/schema";
import { seedContracts } from "@/lib/contracts/sample";
import { seedDeliveries } from "@/lib/deliveries/sample";
import { seedInventory } from "@/lib/inventory/sample";
import { seedReturns } from "@/lib/returns/sample";
import { createTestContext } from "@/test/auth";
import { setupContractFixture, type ContractFixture } from "@/test/contracts";

import { seedSiteOperations } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ContractFixture;
beforeEach(async () => {
  fx = await setupContractFixture(ctx);
});

it("makes one waiting transfer, buy-back and exchange, once", async () => {
  await seedInventory(ctx.db, fx.director);
  await seedContracts(ctx.db, { director: fx.director, sales: fx.sales });
  await seedDeliveries(ctx.db, { sales: fx.sales, warehouse: fx.warehouse });
  await seedReturns(ctx.db, { warehouse: fx.warehouse });
  const people = { director: fx.director, sales: fx.sales };
  expect(await seedSiteOperations(ctx.db, people)).toBe(4);
  expect(await seedSiteOperations(ctx.db, people)).toBe(0);
  const [transfer] = await ctx.db.select().from(siteTransfer);
  expect(transfer?.status).toBe("SENT");
  const [note] = await ctx.db.select().from(buyBackNote);
  expect(note?.status).toBe("PENDING");
  const [exchange] = await ctx.db.select().from(deliveryExchange);
  expect(exchange?.status).toBe("WAITING");
});

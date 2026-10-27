// Two people acting on the same catalog rows at once (review of PR #28,
// point 4). Each case runs the two calls on separate pools with
// Promise.all, many times, so an unlocked check would let one slip through.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { item, kit, kitComponent, site } from "@/db/schema";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
} from "@/test/auth";
import { resetCatalogTables } from "@/test/catalog";

import type { Actor } from "./common";
import { createGroup } from "./item-groups";
import { createItem, getItem, updateItem } from "./items";
import { createKit } from "./kits";
import { createCustomer, getCustomer, updateCustomer } from "./partners";
import { createSite } from "./places";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");

afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

const ROUNDS = 8;

let actor: Actor;
let groupId = "";

beforeEach(async () => {
  await resetAuthTables(ctx);
  await resetCatalogTables(ctx);
  actor = await createTestUser(ctx, { role: "SALES", username: "quocbao" });
  const group = await createGroup(ctx.db, actor, { name: "Giàn giáo" });
  groupId = group.ok ? group.data.id : "";
});

async function piece(code: string) {
  const result = await createItem(ctx.db, actor, {
    code,
    name: code,
    groupId,
    unit: "PIECE",
    standardWeightKg: "2",
    dailyRentalPrice: 100,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.id;
}

describe("catalog under concurrent changes", () => {
  it("never leaves an active kit holding an archived item", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const target = await piece(`CC-${round}`);
      await Promise.all([
        updateItem(other.db, actor, target, { status: "ARCHIVED" }),
        createKit(ctx.db, actor, {
          code: `BO-CC-${round}`,
          name: "Bộ",
          components: [{ itemId: target, quantity: 2 }],
        }),
      ]);
      const holders = await ctx.db
        .select({ itemStatus: item.status })
        .from(kitComponent)
        .innerJoin(kit, eq(kit.id, kitComponent.kitId))
        .innerJoin(item, eq(item.id, kitComponent.itemId))
        .where(and(eq(kitComponent.itemId, target), eq(kit.status, "ACTIVE")));
      for (const holder of holders) {
        expect(holder.itemStatus, `round ${round}`).toBe("ACTIVE");
      }
    }
  });

  it("never leaves an active site under an archived customer", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const owner = await createCustomer(ctx.db, actor, {
        kind: "COMPANY",
        name: `Nhà thầu ${round}`,
      });
      const ownerId = owner.ok ? owner.data.id : "";
      await Promise.all([
        updateCustomer(other.db, actor, ownerId, { status: "ARCHIVED" }),
        createSite(ctx.db, actor, {
          name: `Công trình ${round}`,
          customerId: ownerId,
        }),
      ]);
      const customerNow = await getCustomer(ctx.db, ownerId);
      const activeSites = await ctx.db
        .select()
        .from(site)
        .where(and(eq(site.customerId, ownerId), eq(site.status, "ACTIVE")));
      if (customerNow?.status === "ARCHIVED") {
        expect(activeSites, `round ${round}`).toHaveLength(0);
      }
    }
  });

  it("keeps both edits when two people change different fields of an item", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const target = await piece(`ED-${round}`);
      await Promise.all([
        updateItem(ctx.db, actor, target, { name: `Tên mới ${round}` }),
        updateItem(other.db, actor, target, { dailyRentalPrice: 1000 + round }),
      ]);
      expect(await getItem(ctx.db, target), `round ${round}`).toMatchObject({
        name: `Tên mới ${round}`,
        dailyRentalPrice: 1000 + round,
      });
    }
  });

  it("keeps both edits on a customer", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const owner = await createCustomer(ctx.db, actor, {
        kind: "COMPANY",
        name: `NT ${round}`,
      });
      const id = owner.ok ? owner.data.id : "";
      await Promise.all([
        updateCustomer(ctx.db, actor, id, { phone: "0912345678" }),
        updateCustomer(other.db, actor, id, { paymentTermsDays: 45 }),
      ]);
      expect(await getCustomer(ctx.db, id), `round ${round}`).toMatchObject({
        phone: "0912345678",
        paymentTermsDays: 45,
      });
    }
  });
});

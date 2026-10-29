import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { activityRows } from "@/test/activity";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
} from "@/test/auth";

import { seedActivity, type SampleActors } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

let actors: SampleActors;

beforeEach(async () => {
  await resetAuthTables(ctx);
  actors = {
    director: await createTestUser(ctx, { role: "DIRECTOR" }),
    accountant: await createTestUser(ctx, { role: "ACCOUNTANT" }),
    sales: await createTestUser(ctx, { role: "SALES" }),
    warehouse: await createTestUser(ctx, { role: "WAREHOUSE" }),
  };
});

describe("seedActivity (activity-log 8.1)", () => {
  it("writes the 11 D18 rows once", async () => {
    expect(await seedActivity(ctx.db, actors)).toBe(11);
    expect(await seedActivity(ctx.db, actors)).toBe(0);
    const rows = await activityRows(ctx.db);
    expect(rows).toHaveLength(11);
    expect(rows.filter((row) => row.flags.length > 0)).toHaveLength(3);
    expect(rows.filter((row) => row.device === "MOBILE")).toHaveLength(4);
  });
});

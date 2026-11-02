// Contract scope of a SALES account (user-management spec "Đặt phạm vi hợp
// đồng cho Kinh doanh", contracts tasks 3.1).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { user } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/auth/session";
import { activityRows } from "@/test/activity";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
  signInAs,
  TEST_PASSWORD,
  type TestUser,
} from "@/test/auth";

import {
  USER_MESSAGES,
  changeContractScope,
  createUser,
  createUserSchema,
} from "./service";

const ctx = createTestContext();
afterAll(ctx.close);

let minhanh: TestUser;
let quocbao: TestUser;
let thuha: TestUser;

beforeEach(async () => {
  await resetAuthTables();
  minhanh = await createTestUser(ctx, {
    role: "DIRECTOR",
    username: "minhanh",
  });
  quocbao = await createTestUser(ctx, { role: "SALES", username: "quocbao" });
  thuha = await createTestUser(ctx, { role: "ACCOUNTANT", username: "thuha" });
});

async function scopeOf(id: string) {
  const [row] = await ctx.db
    .select({ scope: user.contractScope })
    .from(user)
    .where(eq(user.id, id));
  return row?.scope;
}

describe("changeContractScope", () => {
  it("sets Chỉ cho thuê and logs exactly one sensitive row", async () => {
    const result = await changeContractScope(
      ctx,
      minhanh,
      quocbao.id,
      "RENTAL",
    );
    expect(result).toMatchObject({
      ok: true,
      data: { user: { username: "quocbao", contractScope: "RENTAL" } },
    });
    expect(await scopeOf(quocbao.id)).toBe("RENTAL");
    const rows = await activityRows(ctx.db, "quocbao");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "UPDATE",
      documentType: "USER",
      summary: "Phạm vi hợp đồng quocbao: Cả hai → Chỉ cho thuê",
      changes: [
        {
          field: "contractScope",
          label: "Phạm vi hợp đồng",
          before: "Cả hai",
          after: "Chỉ cho thuê",
        },
      ],
    });
    expect(rows[0]?.flags).toContain("SENSITIVE");
  });

  it("writes nothing to the log when the scope stays the same", async () => {
    await changeContractScope(ctx, minhanh, quocbao.id, "ALL");
    expect(await activityRows(ctx.db, "quocbao")).toEqual([]);
  });

  it("refuses a seller changing their own scope", async () => {
    expect(
      await changeContractScope(ctx, quocbao, quocbao.id, "ALL"),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a scope on an accountant", async () => {
    expect(await changeContractScope(ctx, minhanh, thuha.id, "SALE")).toEqual({
      ok: false,
      status: 409,
      error: USER_MESSAGES.scopeNotSales,
    });
    expect(await scopeOf(thuha.id)).toBe("ALL");
  });

  it("reaches the next request of the seller", async () => {
    const cookie = await signInAs(ctx, {
      username: "quocbao",
      password: TEST_PASSWORD,
    });
    const read = () => resolveCurrentUser(ctx.auth, new Headers({ cookie }));
    expect((await read())?.contractScope).toBe("ALL");
    await changeContractScope(ctx, minhanh, quocbao.id, "RENTAL");
    expect((await read())?.contractScope).toBe("RENTAL");
  });
});

describe("createUser with a scope", () => {
  it("defaults a new seller to Cả hai", async () => {
    const input = createUserSchema.parse({
      name: "Thúy Vy",
      username: "thuyvy",
      role: "SALES",
    });
    const result = await createUser(ctx, minhanh, input);
    expect(result).toMatchObject({
      ok: true,
      data: { user: { contractScope: "ALL" } },
    });
  });

  it("keeps the scope chosen for a seller, not for other roles", async () => {
    const seller = await createUser(
      ctx,
      minhanh,
      createUserSchema.parse({
        name: "Thúy Vy",
        username: "thuyvy",
        role: "SALES",
        contractScope: "SALE",
      }),
    );
    const keeper = await createUser(
      ctx,
      minhanh,
      createUserSchema.parse({
        name: "Đức Lực",
        username: "ducluc",
        role: "WAREHOUSE",
        contractScope: "SALE",
      }),
    );
    if (!seller.ok || !keeper.ok) throw new Error("setup");
    expect(await scopeOf(seller.data.user.id)).toBe("SALE");
    expect(await scopeOf(keeper.data.user.id)).toBe("ALL");
  });
});

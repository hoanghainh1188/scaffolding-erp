// The grant step that `npm run db:migrate` runs as the owner
// (db-least-privilege D2, D3), against the integration-test database.
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";

import {
  APPEND_ONLY_TABLES,
  applyGrants,
  DEFAULT_APP_ROLE,
  findPrivilegeProblems,
  GrantError,
} from "./grants";

const ownerUrl = process.env.TEST_DATABASE_URL_MIGRATE;
const appUrl = process.env.TEST_DATABASE_URL;
if (!ownerUrl || !appUrl) {
  throw new Error(
    "TEST_DATABASE_URL and TEST_DATABASE_URL_MIGRATE are required for integration tests.",
  );
}

const owner = postgres(ownerUrl, { max: 1, onnotice: () => {} });
const app = createDatabase(appUrl);
const role = DEFAULT_APP_ROLE;

afterAll(async () => {
  await applyGrants(owner, role);
  await owner.end();
  await app.close();
});

afterEach(async () => {
  await owner`drop table if exists public.grant_probe`;
  await applyGrants(owner, role);
});

const privileges = async (table: string) => {
  const [row] = await owner<
    { select: boolean; insert: boolean; update: boolean; delete: boolean }[]
  >`select
      has_table_privilege(${role}, ${table}, 'SELECT') as select,
      has_table_privilege(${role}, ${table}, 'INSERT') as insert,
      has_table_privilege(${role}, ${table}, 'UPDATE') as update,
      has_table_privilege(${role}, ${table}, 'DELETE') as delete`;
  return row;
};

describe("applyGrants", () => {
  it("leaves nothing to fix and gives the same result twice", async () => {
    await applyGrants(owner, role);
    const first = await findPrivilegeProblems(owner, role);
    await applyGrants(owner, role);
    expect(first).toEqual([]);
    expect(await findPrivilegeProblems(owner, role)).toEqual([]);
    expect(await privileges("purchase_order")).toEqual({
      select: true,
      insert: true,
      update: true,
      delete: true,
    });
  });

  it("revokes a hand-made UPDATE on the ledger", async () => {
    await owner`grant update, truncate on inventory_ledger to ${owner(role)}`;
    expect(await findPrivilegeProblems(owner, role)).toEqual([
      "có UPDATE/DELETE trên bảng chỉ ghi thêm inventory_ledger",
      "có TRUNCATE/REFERENCES/TRIGGER trên inventory_ledger",
    ]);
    await applyGrants(owner, role);
    expect(await findPrivilegeProblems(owner, role)).toEqual([]);
  });

  it("covers a table added by a later migration", async () => {
    await owner`create table public.grant_probe (id int)`;
    expect(await privileges("grant_probe")).toMatchObject({ select: false });
    await applyGrants(owner, role);
    expect(await privileges("grant_probe")).toEqual({
      select: true,
      insert: true,
      update: true,
      delete: true,
    });
  });

  it("gives access back after a restore without privileges", async () => {
    // pg_restore --no-privileges leaves the app role with nothing.
    await owner`revoke all on all tables in schema public from ${owner(role)}`;
    await expect(
      app.db.execute(sql`select count(*) from item`),
    ).rejects.toThrow();
    await applyGrants(owner, role);
    const [row] = await app.db.execute<{ n: string }>(
      sql`select count(*) as n from item`,
    );
    expect(row?.n).toBeDefined();
  });

  it("names a missing role instead of granting to nobody", async () => {
    const attempt = applyGrants(owner, "khong_co");
    await expect(attempt).rejects.toBeInstanceOf(GrantError);
    await expect(applyGrants(owner, "khong_co")).rejects.toThrow(
      /Role "khong_co" chưa có/,
    );
  });

  it("keeps PUBLIC out of the database (one app role per company)", async () => {
    const [row] = await owner<{ allowed: boolean; app: boolean }[]>`
      select has_database_privilege('public', current_database(), 'CONNECT') as allowed,
             has_database_privilege(${role}, current_database(), 'CONNECT') as app`;
    expect(row).toEqual({ allowed: false, app: true });
  });
});

describe("APPEND_ONLY_TABLES", () => {
  it("lists exactly the tables guarded by an *_append_only trigger", async () => {
    const rows = await owner<{ name: string }[]>`
      select distinct c.relname as name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
      where not t.tgisinternal and p.proname like '%\\_append\\_only'
      order by c.relname`;
    expect(rows.map((row) => row.name)).toEqual([...APPEND_ONLY_TABLES]);
  });
});

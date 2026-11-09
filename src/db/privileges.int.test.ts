// The app role (TEST_DATABASE_URL) has least privileges (spec
// database-access): it may append to the ledger and the activity log but
// never change or empty them, and it may not alter any table.
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";

import { APPEND_ONLY_TABLES, DEFAULT_APP_ROLE } from "./grants";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

const INSUFFICIENT_PRIVILEGE = "42501";

async function errorCode(statement: ReturnType<typeof sql>): Promise<string> {
  try {
    await db.execute(statement);
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? "no code";
  }
  return "no error";
}

/** A column of each append-only table for the UPDATE probe. */
const UPDATE_COLUMN: Readonly<
  Record<(typeof APPEND_ONLY_TABLES)[number], string>
> = {
  activity_log: "created_at",
  billing_period: "closed_at",
  billing_period_freight: "amount",
  billing_period_line: "amount",
  contract_settlement: "refund_amount",
  goods_receipt: "due_date",
  goods_receipt_cost: "amount",
  goods_receipt_line: "quantity",
  inventory_ledger: "created_at",
  receipt: "amount",
  receipt_allocation: "amount",
  receipt_cancellation: "reason",
  repair_order_submission: "created_at",
  production_order_submission: "created_at",
  scrap_price: "created_at",
  supplier_payment: "amount",
  supplier_payment_allocation: "amount",
  supplier_payment_cancellation: "reason",
};

describe("app role", () => {
  it("connects as erp_app", async () => {
    const [row] = await db.execute<{ role: string }>(
      sql`select current_user as role`,
    );
    expect(row?.role).toBe(DEFAULT_APP_ROLE);
  });

  it("owns no table", async () => {
    const owned = await db.execute<{ name: string }>(sql`
      select c.relname as name from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and pg_has_role(current_user, c.relowner, 'USAGE')`);
    expect([...owned]).toEqual([]);
  });

  it.each(APPEND_ONLY_TABLES)(
    "may not UPDATE, DELETE or TRUNCATE %s",
    async (table) => {
      const name = sql.identifier(table);
      const column = sql.identifier(UPDATE_COLUMN[table]);
      expect(
        await errorCode(sql`update ${name} set ${column} = ${column}`),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await errorCode(sql`delete from ${name}`)).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      expect(await errorCode(sql`truncate table ${name}`)).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    },
  );

  it("may not TRUNCATE ordinary tables either", async () => {
    expect(await errorCode(sql`truncate table "purchase_order" cascade`)).toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it("may not switch off the append-only triggers", async () => {
    expect(
      await errorCode(
        sql`alter table "inventory_ledger" disable trigger "inventory_ledger_no_update_delete"`,
      ),
    ).toBe(INSUFFICIENT_PRIVILEGE);
    expect(
      await errorCode(sql`alter table "activity_log" disable trigger all`),
    ).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await errorCode(sql`set session_replication_role = replica`)).toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it("may not drop or create tables", async () => {
    expect(await errorCode(sql`drop table "activity_log"`)).toBe(
      INSUFFICIENT_PRIVILEGE,
    );
    expect(await errorCode(sql`create table public.x (id int)`)).toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });
});

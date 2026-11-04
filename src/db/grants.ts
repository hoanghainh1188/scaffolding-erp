// Least-privilege grants for the app role (db-least-privilege D2, D3).
// Runs as the table owner at the end of every `npm run db:migrate`: it
// revokes everything and grants again, so it can run any number of times,
// covers tables added by later migrations and undoes grants made by hand.
import type { Sql } from "postgres";

/** Tables the app may only read and append to (they have *_append_only triggers). */
export const APPEND_ONLY_TABLES = [
  "activity_log",
  "billing_period",
  "billing_period_freight",
  "billing_period_line",
  "inventory_ledger",
  "scrap_price",
] as const;

export const DEFAULT_APP_ROLE = "erp_app";

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/** Wrong role setup. The message names roles and privileges, never URLs. */
export class GrantError extends Error {
  override readonly name = "GrantError";
}

/** The app role from DB_APP_ROLE, or erp_app. */
export function resolveAppRole(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const role = env.DB_APP_ROLE?.trim() || DEFAULT_APP_ROLE;
  if (!ROLE_NAME.test(role)) {
    throw new GrantError(
      "DB_APP_ROLE phải là tên role Postgres viết thường (a-z, 0-9, _).",
    );
  }
  return role;
}

/** Grants the app role exactly what the app needs on the current database. */
export async function applyGrants(sql: Sql, role: string): Promise<void> {
  await sql.begin(async (tx) => {
    const [found] = await tx`select 1 from pg_roles where rolname = ${role}`;
    if (!found) {
      throw new GrantError(
        `Role "${role}" chưa có. Tạo role app (local: npm run db:roles; Neon: docs/ops/demo.md) rồi chạy lại npm run db:migrate.`,
      );
    }
    const [current] = await tx<
      { db: string }[]
    >`select current_database() as db`;
    if (!current) throw new GrantError("Không đọc được tên cơ sở dữ liệu.");
    const { db } = current;
    const app = tx(role);

    await tx`revoke all on all tables in schema public from ${app}`;
    await tx`revoke all on all sequences in schema public from ${app}`;
    await tx`grant usage on schema public to ${app}`;
    await tx`grant select, insert, update, delete on all tables in schema public to ${app}`;
    await tx`grant usage, select on all sequences in schema public to ${app}`;
    for (const table of APPEND_ONLY_TABLES) {
      const [exists] = await tx`select to_regclass(${`public.${table}`}) as id`;
      if (exists?.id) {
        await tx`revoke update, delete on ${tx(table)} from ${app}`;
      }
    }

    await tx`revoke create on schema public from public`;
    const [migrations] =
      await tx`select 1 from pg_namespace where nspname = 'drizzle'`;
    if (migrations) await tx`revoke all on schema drizzle from public`;
    // Roles are cluster-wide: keep one company's app role out of another
    // company's database (0.2 #33).
    await tx`revoke connect, temporary on database ${tx(db)} from public`;
    await tx`grant connect on database ${tx(db)} to ${app}`;
  });
}

/**
 * Everything the app role may do beyond (or short of) the grants above.
 * Empty when the role is exactly right.
 */
export async function findPrivilegeProblems(
  sql: Sql,
  role: string,
): Promise<string[]> {
  const problems: string[] = [];
  const [attributes] = await sql<
    {
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolbypassrls: boolean;
      rolreplication: boolean;
    }[]
  >`select rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication
    from pg_roles where rolname = ${role}`;
  if (!attributes) return [`role "${role}" chưa có`];
  for (const [flag, enabled] of Object.entries(attributes)) {
    if (enabled) problems.push(`role "${role}" có thuộc tính ${flag}`);
  }

  const inherited = await sql<{ name: string }[]>`
    select r.rolname as name from pg_roles r
    where r.rolname <> ${role}
      and pg_has_role(${role}, r.oid, 'MEMBER')
      and (r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolbypassrls)`;
  for (const { name } of inherited) {
    problems.push(`role "${role}" là thành viên của "${name}"`);
  }

  const tables = await sql<
    {
      name: string;
      owned: boolean;
      select: boolean;
      insert: boolean;
      update: boolean;
      delete: boolean;
      extra: boolean;
    }[]
  >`
    select c.relname as name,
      pg_has_role(${role}, c.relowner, 'USAGE') as owned,
      has_table_privilege(${role}, c.oid, 'SELECT') as select,
      has_table_privilege(${role}, c.oid, 'INSERT') as insert,
      has_table_privilege(${role}, c.oid, 'UPDATE') as update,
      has_table_privilege(${role}, c.oid, 'DELETE') as delete,
      has_table_privilege(${role}, c.oid, 'TRUNCATE, REFERENCES, TRIGGER') as extra
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname`;
  const appendOnly = new Set<string>(APPEND_ONLY_TABLES);
  for (const table of tables) {
    if (table.owned) problems.push(`role "${role}" là chủ bảng ${table.name}`);
    if (!table.select || !table.insert) {
      problems.push(`thiếu SELECT/INSERT trên ${table.name}`);
    }
    if (appendOnly.has(table.name)) {
      if (table.update || table.delete) {
        problems.push(`có UPDATE/DELETE trên bảng chỉ ghi thêm ${table.name}`);
      }
    } else if (!table.update || !table.delete) {
      problems.push(`thiếu UPDATE/DELETE trên ${table.name}`);
    }
    if (table.extra) {
      problems.push(`có TRUNCATE/REFERENCES/TRIGGER trên ${table.name}`);
    }
  }

  const schemas = await sql<{ name: string }[]>`
    select nspname as name from pg_namespace
    where nspname not like 'pg\\_%' and nspname <> 'information_schema'
      and has_schema_privilege(${role}, oid, 'CREATE')`;
  for (const { name } of schemas) {
    problems.push(`có CREATE trên schema ${name}`);
  }

  const [replication] = await sql<{ allowed: boolean }[]>`
    select has_parameter_privilege(${role}, 'session_replication_role', 'SET') as allowed`;
  if (replication?.allowed) {
    problems.push("được đổi session_replication_role");
  }
  return problems;
}

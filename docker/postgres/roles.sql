-- Local-only app role (db-least-privilege D4). Safe to run again.
-- Grants are not here: `npm run db:migrate` applies them (src/db/grants.ts).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'erp_app') THEN
    CREATE ROLE erp_app LOGIN PASSWORD 'erp_app';
  END IF;
END
$$;
